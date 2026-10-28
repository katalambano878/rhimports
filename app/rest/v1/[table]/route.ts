import { NextRequest, NextResponse } from "next/server";
import {
  createClient,
  applyPostgrestParams,
} from "@/lib/db/supabase-compat";
import { isPlainPostgres } from "@/lib/db/mode";
import {
  resolveActor,
  withRls,
  rlsDeniedStatus,
  RlsAuthError,
  type RlsActor,
} from "@/lib/db/rls";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PG_IDENT = /^[a-z_][a-z0-9_]*$/i;

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, prefer, x-client-info, accept-profile, content-profile",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  };
}

function preferSingle(req: NextRequest): boolean {
  const accept = req.headers.get("accept") || "";
  return accept.includes("application/vnd.pgrst.object+json");
}

function preferReturn(req: NextRequest): boolean {
  const prefer = req.headers.get("prefer") || "";
  return prefer.includes("return=representation") || prefer.includes("resolution=");
}

function preferCount(req: NextRequest): boolean {
  const prefer = req.headers.get("prefer") || "";
  return prefer.includes("count=exact");
}

function jsonError(message: string, status = 400, code = "PGRST") {
  return NextResponse.json(
    { message, code, details: null, hint: null },
    { status, headers: corsHeaders() }
  );
}

async function actorOrError(req: NextRequest): Promise<RlsActor | NextResponse> {
  try {
    return await resolveActor(req.headers);
  } catch (e) {
    if (e instanceof RlsAuthError) return jsonError(e.message, 401);
    throw e;
  }
}

function failure(actor: RlsActor, message: string | undefined, fallback: string, code?: string) {
  // PostgREST answers single() with no or several rows as 406 / PGRST116.
  if (code === "PGRST116") return jsonError(message || fallback, 406, code);
  return jsonError(message || fallback, rlsDeniedStatus(actor, message) ?? 400);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ table: string }> }
) {
  if (!isPlainPostgres()) {
    return jsonError("Plain Postgres mode is not enabled (DATABASE_URL missing)", 503);
  }
  const { table } = await ctx.params;
  if (!PG_IDENT.test(table)) return jsonError("Invalid table");
  const actor = await actorOrError(req);
  if (actor instanceof NextResponse) return actor;

  const client = createClient();
  const qb = client.from(table);
  const select = req.nextUrl.searchParams.get("select") || "*";
  if (preferCount(req)) {
    qb.select(select, {
      count: "exact",
      head: req.headers.get("prefer")?.includes("head=true"),
    });
  } else {
    qb.select(select);
  }
  // Apply filters/order/limit without re-applying select
  const params = new URLSearchParams(req.nextUrl.searchParams);
  params.delete("select");
  applyPostgrestParams(qb as any, params, {
    preferSingle: preferSingle(req),
  });

  const result = await withRls(actor, async () => await qb);
  if (result.error) return failure(actor, result.error.message, "Query failed", result.error.code);

  const headers = new Headers(corsHeaders());
  headers.set("Content-Type", "application/json");
  if (result.count != null) {
    const rows = Array.isArray(result.data)
      ? result.data
      : result.data
        ? [result.data]
        : [];
    const len = rows.length;
    const offset = Math.max(0, Number(params.get("offset") || 0) || 0);
    // PostgREST: empty/head counts use */N (fixes shop "12 of 0")
    if (len === 0) {
      headers.set("Content-Range", `*/${result.count}`);
    } else {
      headers.set(
        "Content-Range",
        `${offset}-${offset + len - 1}/${result.count}`
      );
    }
  }

  if (preferSingle(req)) {
    return NextResponse.json(result.data, { status: 200, headers });
  }
  return NextResponse.json(result.data ?? [], { status: 200, headers });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ table: string }> }
) {
  if (!isPlainPostgres()) {
    return jsonError("Plain Postgres mode is not enabled (DATABASE_URL missing)", 503);
  }
  const { table } = await ctx.params;
  if (!PG_IDENT.test(table)) return jsonError("Invalid table");
  const actor = await actorOrError(req);
  if (actor instanceof NextResponse) return actor;

  const body = await req.json().catch(() => null);
  if (body == null) return jsonError("Invalid JSON body");

  const client = createClient();
  // supabase-js .upsert() posts with Prefer: resolution=merge-duplicates and
  // ?on_conflict=cols; plain .insert() sends neither.
  const prefer = req.headers.get("prefer") || "";
  const onConflict = req.nextUrl.searchParams.get("on_conflict") || undefined;
  let qb = prefer.includes("resolution=merge-duplicates")
    ? client.from(table).upsert(body, { onConflict })
    : client.from(table).insert(body);
  if (preferReturn(req) || preferSingle(req)) {
    qb = qb.select(req.nextUrl.searchParams.get("select") || "*") as typeof qb;
  }
  if (preferSingle(req)) qb = qb.single() as typeof qb;

  const result = await withRls(actor, async () => await qb);
  if (result.error) return failure(actor, result.error.message, "Insert failed");

  return NextResponse.json(result.data, {
    status: 201,
    headers: corsHeaders(),
  });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ table: string }> }
) {
  if (!isPlainPostgres()) {
    return jsonError("Plain Postgres mode is not enabled (DATABASE_URL missing)", 503);
  }
  const { table } = await ctx.params;
  if (!PG_IDENT.test(table)) return jsonError("Invalid table");
  const actor = await actorOrError(req);
  if (actor instanceof NextResponse) return actor;

  const body = await req.json().catch(() => null);
  if (body == null || typeof body !== "object") return jsonError("Invalid JSON body");

  const client = createClient();
  let qb = client.from(table).update(body);
  applyPostgrestParams(qb as any, req.nextUrl.searchParams);
  if (preferReturn(req) || preferSingle(req)) {
    qb = qb.select("*") as typeof qb;
  }
  if (preferSingle(req)) qb = qb.single() as typeof qb;

  const result = await withRls(actor, async () => await qb);
  if (result.error) return failure(actor, result.error.message, "Update failed");

  return NextResponse.json(result.data, { status: 200, headers: corsHeaders() });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ table: string }> }
) {
  if (!isPlainPostgres()) {
    return jsonError("Plain Postgres mode is not enabled (DATABASE_URL missing)", 503);
  }
  const { table } = await ctx.params;
  if (!PG_IDENT.test(table)) return jsonError("Invalid table");
  const actor = await actorOrError(req);
  if (actor instanceof NextResponse) return actor;

  const client = createClient();
  let qb = client.from(table).delete();
  applyPostgrestParams(qb as any, req.nextUrl.searchParams);
  if (preferReturn(req)) {
    qb = qb.select("*") as typeof qb;
  }

  const result = await withRls(actor, async () => await qb);
  if (result.error) return failure(actor, result.error.message, "Delete failed");

  return NextResponse.json(result.data ?? null, { status: 200, headers: corsHeaders() });
}
