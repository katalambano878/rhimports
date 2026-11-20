import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-compat";
import { isPlainPostgres } from "@/lib/db/mode";
import { resolveActor, withRls, rlsDeniedStatus, RlsAuthError } from "@/lib/db/rls";
import { isRpcAllowed, publicError } from "@/lib/db/rest-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PG_IDENT = /^[a-z_][a-z0-9_]*$/i;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, prefer, x-client-info",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ fn: string }> }
) {
  if (!isPlainPostgres()) {
    return NextResponse.json({ message: "DATABASE_URL not set" }, { status: 503, headers: CORS });
  }
  const { fn } = await ctx.params;
  if (!PG_IDENT.test(fn)) {
    return NextResponse.json({ message: "Invalid function name" }, { status: 400, headers: CORS });
  }
  // Only the functions pages call from the browser; everything else is
  // server-only (and pg_catalog functions are never reachable: calls are
  // always schema-qualified as public.<fn>).
  if (!isRpcAllowed(fn)) {
    return NextResponse.json(
      { message: "Function not allowed", code: "42501", details: null, hint: null },
      { status: 403, headers: CORS }
    );
  }

  let actor;
  try {
    actor = await resolveActor(req.headers);
  } catch (e) {
    if (e instanceof RlsAuthError) {
      return NextResponse.json({ message: e.message, code: "PGRST301" }, { status: 401, headers: CORS });
    }
    throw e;
  }

  const body = await req.json().catch(() => ({}));
  const args = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, any>;
  const client = createClient();
  const { data, error } = await withRls(actor, () => client.rpc(fn, args));
  if (error) {
    return NextResponse.json(publicError({ ...error, code: error.code ?? "PGRST202" }, actor), {
      status: rlsDeniedStatus(actor, error.message) ?? 400,
      headers: CORS,
    });
  }
  return NextResponse.json(data, { headers: CORS });
}
