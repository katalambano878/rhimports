// Runs /rest/v1 and /storage/v1 requests under the database's own RLS
// policies, the way PostgREST does on Supabase: each request gets a
// transaction, switches to the anon/authenticated role and exposes the JWT
// claims that auth.uid() / auth.role() / is_admin_or_staff() read.
// Service-role callers run as the owning app role, which bypasses RLS.

import { jwtVerify } from "jose";
import { getSharedPool, runWithClient } from "./pool";
import { authJwtSecret } from "./mode";

export type RlsActor =
  | { kind: "service" }
  | { kind: "anon"; claims: Record<string, unknown> }
  | { kind: "authenticated"; userId: string; claims: Record<string, unknown> };

export class RlsAuthError extends Error {
  status = 401;
}

const ANON_ROLE = process.env.DB_ANON_ROLE || "anon";
const AUTHENTICATED_ROLE = process.env.DB_AUTHENTICATED_ROLE || "authenticated";
const ROLE_IDENT = /^[a-z_][a-z0-9_]*$/;

function bearerToken(headers: Headers): string | null {
  const auth = headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  if (bearer) return bearer;
  const apikey = (headers.get("apikey") || "").trim();
  return apikey || null;
}

/** Work out who is calling from the Authorization / apikey headers. */
export async function resolveActor(headers: Headers): Promise<RlsActor> {
  const token = bearerToken(headers);
  if (!token) return { kind: "anon", claims: { role: "anon" } };

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey && token === serviceKey) return { kind: "service" };

  let payload: Record<string, unknown>;
  try {
    ({ payload } = (await jwtVerify(token, new TextEncoder().encode(authJwtSecret()))) as {
      payload: Record<string, unknown>;
    });
  } catch {
    throw new RlsAuthError("JWT is invalid or expired");
  }

  if (payload.typ === "refresh") throw new RlsAuthError("Refresh tokens cannot call the API");
  if (payload.role === "service_role") return { kind: "service" };
  if (payload.role === "anon") return { kind: "anon", claims: payload };

  const userId = typeof payload.sub === "string" ? payload.sub : "";
  if (!userId) throw new RlsAuthError("JWT has no subject");
  return { kind: "authenticated", userId, claims: { ...payload, role: "authenticated" } };
}

function dbRoleFor(actor: Exclude<RlsActor, { kind: "service" }>): string {
  const role = actor.kind === "anon" ? ANON_ROLE : AUTHENTICATED_ROLE;
  if (!ROLE_IDENT.test(role)) throw new Error(`Unsafe database role name: ${role}`);
  return role;
}

/**
 * Run `fn` with the actor's RLS context. Results carrying `error` roll the
 * transaction back, so a failed multi-step request never half-commits.
 */
export async function withRls<T>(actor: RlsActor, fn: () => Promise<T>): Promise<T> {
  if (actor.kind === "service") return fn();

  const client = await getSharedPool().connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${dbRoleFor(actor)}`);
    const claims = JSON.stringify(actor.claims);
    const sub = actor.kind === "authenticated" ? actor.userId : "";
    const role = actor.kind === "authenticated" ? "authenticated" : "anon";
    await client.query(
      `SELECT set_config('request.jwt.claims', $1, true),
              set_config('request.jwt.claim.sub', $2, true),
              set_config('request.jwt.claim.role', $3, true)`,
      [claims, sub, role]
    );

    const result = await runWithClient(client, fn);
    const failed =
      result && typeof result === "object" && "error" in (result as object)
        ? Boolean((result as { error?: unknown }).error)
        : false;
    await client.query(failed ? "ROLLBACK" : "COMMIT");
    committed = true;
    return result;
  } finally {
    if (!committed) await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
}

/** PostgREST answers RLS denials with 401 for anon callers and 403 otherwise. */
export function rlsDeniedStatus(actor: RlsActor, message: string | undefined): number | null {
  if (!message) return null;
  if (/row-level security|permission denied/i.test(message)) {
    return actor.kind === "anon" ? 401 : 403;
  }
  return null;
}
