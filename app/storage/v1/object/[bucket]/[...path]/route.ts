import { NextRequest, NextResponse } from "next/server";
import { createStorageClient } from "@/lib/db/storage";
import { isPlainPostgres } from "@/lib/db/mode";
import { query } from "@/lib/db/pool";
import { resolveActor, withRls, RlsAuthError, type RlsActor } from "@/lib/db/rls";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Mirrors the storage.objects policies on Supabase: these buckets accept
// writes from staff (or the service role); every other bucket is read-only.
const STAFF_WRITABLE_BUCKETS = new Set(["products", "media", "site-assets"]);

async function canWrite(actor: RlsActor, bucket: string): Promise<boolean> {
  if (!STAFF_WRITABLE_BUCKETS.has(bucket)) return false;
  if (actor.kind === "service") return true;
  if (actor.kind !== "authenticated") return false;
  const { rows } = await withRls(actor, () =>
    query<{ ok: boolean }>("SELECT public.is_admin_or_staff() AS ok")
  );
  return rows[0]?.ok === true;
}

async function authorize(
  req: NextRequest,
  bucket: string
): Promise<NextResponse | null> {
  let actor: RlsActor;
  try {
    actor = await resolveActor(req.headers);
  } catch (e) {
    if (e instanceof RlsAuthError) {
      return NextResponse.json({ statusCode: "401", error: "Unauthorized", message: e.message }, { status: 401 });
    }
    throw e;
  }
  if (!(await canWrite(actor, bucket))) {
    return NextResponse.json(
      { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" },
      { status: 403 }
    );
  }
  return null;
}

/** supabase-js sends Blob/File uploads as multipart form data, buffers as raw bytes. */
async function readUpload(req: NextRequest): Promise<{ bytes: Buffer; contentType: string }> {
  const headerType = req.headers.get("content-type") || "application/octet-stream";
  if (headerType.includes("multipart/form-data")) {
    const form = await req.formData();
    for (const value of form.values()) {
      if (typeof value !== "string") {
        return {
          bytes: Buffer.from(await value.arrayBuffer()),
          contentType: value.type || "application/octet-stream",
        };
      }
    }
    throw new Error("No file in upload");
  }
  return { bytes: Buffer.from(await req.arrayBuffer()), contentType: headerType };
}

async function store(req: NextRequest, ctx: { params: Promise<{ bucket: string; path: string[] }> }, upsert: boolean) {
  if (!isPlainPostgres()) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 503 });
  }
  const { bucket, path } = await ctx.params;
  const denied = await authorize(req, bucket);
  if (denied) return denied;

  const objectPath = path.map(decodeURIComponent).join("/");
  let upload;
  try {
    upload = await readUpload(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Invalid upload" }, { status: 400 });
  }

  const storage = createStorageClient();
  const { data, error } = await storage.from(bucket).upload(objectPath, upload.bytes, {
    contentType: upload.contentType,
    upsert: upsert || (req.headers.get("x-upsert") || "").toLowerCase() === "true",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data: pub } = storage.from(bucket).getPublicUrl(objectPath);
  return NextResponse.json({
    Key: `${bucket}/${objectPath}`,
    Id: data?.path,
    ...data,
    publicUrl: pub.publicUrl,
  });
}

/** Supabase Storage upload: POST /storage/v1/object/{bucket}/{path} */
export async function POST(req: NextRequest, ctx: { params: Promise<{ bucket: string; path: string[] }> }) {
  return store(req, ctx, false);
}

/** Supabase Storage update (overwrite): PUT /storage/v1/object/{bucket}/{path} */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ bucket: string; path: string[] }> }) {
  return store(req, ctx, true);
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ bucket: string; path: string[] }> }
) {
  if (!isPlainPostgres()) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 503 });
  }
  const { bucket, path } = await ctx.params;
  const denied = await authorize(req, bucket);
  if (denied) return denied;

  const objectPath = path.map(decodeURIComponent).join("/");
  const storage = createStorageClient();
  const { error } = await storage.from(bucket).remove([objectPath]);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({});
}
