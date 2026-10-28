// GoTrue-compatible auth against plain Postgres auth.users (bcrypt hashes).

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes, randomUUID } from "crypto";
import { query } from "./pool";
import { authJwtSecret } from "./mode";

const ACCESS_TTL_SEC = 60 * 60; // matches the Supabase project's jwt_exp
const REFRESH_TTL_SEC = 60 * 60 * 24 * 30; // 30 days

export interface AuthUser {
  id: string;
  aud: string;
  role: string;
  email: string;
  phone: string;
  email_confirmed_at: string | null;
  phone_confirmed_at: string | null;
  confirmed_at: string | null;
  last_sign_in_at: string | null;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  identities: unknown[];
  created_at: string;
  updated_at: string;
}

export interface SessionTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: "bearer";
  user: AuthUser;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(authJwtSecret());
}

function rowToUser(row: Record<string, any>, appRole?: string | null): AuthUser {
  const meta =
    typeof row.raw_user_meta_data === "string"
      ? JSON.parse(row.raw_user_meta_data || "{}")
      : row.raw_user_meta_data || {};
  const appMeta =
    typeof row.raw_app_meta_data === "string"
      ? JSON.parse(row.raw_app_meta_data || "{}")
      : row.raw_app_meta_data || {};
  if (appRole) {
    appMeta.role = appRole;
  }
  return {
    id: row.id,
    aud: "authenticated",
    role: "authenticated",
    email: row.email || "",
    phone: row.phone || "",
    email_confirmed_at: row.email_confirmed_at || null,
    phone_confirmed_at: row.phone_confirmed_at || null,
    confirmed_at: row.email_confirmed_at || row.phone_confirmed_at || null,
    last_sign_in_at: row.last_sign_in_at || null,
    app_metadata: appMeta,
    user_metadata: meta,
    identities: [],
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
  };
}

async function loadAppRole(userId: string): Promise<string | null> {
  try {
    const { rows } = await query<{ role: string }>(
      `SELECT role FROM profiles WHERE id = $1 LIMIT 1`,
      [userId]
    );
    return rows[0]?.role ?? null;
  } catch {
    return null;
  }
}

async function mintSession(userRow: Record<string, any>): Promise<SessionTokens> {
  const appRole = await loadAppRole(userRow.id);
  const user = rowToUser(userRow, appRole);
  const now = Math.floor(Date.now() / 1000);
  const sessionId = randomUUID();

  const access_token = await new SignJWT({
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    phone: user.phone,
    app_metadata: user.app_metadata,
    user_metadata: user.user_metadata,
    session_id: sessionId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TTL_SEC)
    .sign(secretKey());

  const refresh_token = await new SignJWT({
    typ: "refresh",
    session_id: sessionId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuedAt(now)
    .setExpirationTime(now + REFRESH_TTL_SEC)
    .sign(secretKey());

  return {
    access_token,
    refresh_token,
    expires_in: ACCESS_TTL_SEC,
    expires_at: now + ACCESS_TTL_SEC,
    token_type: "bearer",
    user,
  };
}

export async function verifyAccessToken(
  token: string
): Promise<{ userId: string; payload: Record<string, any> } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.typ === "refresh") return null;
    const userId = typeof payload.sub === "string" ? payload.sub : null;
    if (!userId) return null;
    return { userId, payload: payload as Record<string, any> };
  } catch {
    return null;
  }
}

export async function getUserById(userId: string): Promise<AuthUser | null> {
  const { rows } = await query(
    `SELECT id, email, phone, encrypted_password, email_confirmed_at,
            phone_confirmed_at, last_sign_in_at, raw_app_meta_data,
            raw_user_meta_data, created_at, updated_at
     FROM auth.users WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [userId]
  );
  if (!rows[0]) return null;
  const appRole = await loadAppRole(userId);
  return rowToUser(rows[0], appRole);
}

export async function signInWithPassword(
  email: string,
  password: string
): Promise<{ session: SessionTokens | null; error: string | null }> {
  const normalized = email.trim().toLowerCase();
  const { rows } = await query(
    `SELECT id, email, phone, encrypted_password, email_confirmed_at,
            phone_confirmed_at, last_sign_in_at, raw_app_meta_data,
            raw_user_meta_data, created_at, updated_at
     FROM auth.users
     WHERE lower(email) = $1 AND deleted_at IS NULL
     LIMIT 1`,
    [normalized]
  );
  const row = rows[0];
  if (!row?.encrypted_password) {
    return { session: null, error: "Invalid login credentials" };
  }
  const ok = bcrypt.compareSync(password, row.encrypted_password);
  if (!ok) {
    return { session: null, error: "Invalid login credentials" };
  }
  if (!row.email_confirmed_at) {
    return { session: null, error: "Email not confirmed" };
  }

  await query(
    `UPDATE auth.users SET last_sign_in_at = now(), updated_at = now() WHERE id = $1`,
    [row.id]
  ).catch(() => {});

  const session = await mintSession(row);
  return { session, error: null };
}

// Email links carry a random token; only its SHA-256 is stored, like GoTrue.
const CONFIRMATION_TTL_SEC = 60 * 60 * 24;
const RECOVERY_TTL_SEC = 60 * 60;

function newEmailToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: hashEmailToken(raw) };
}

function hashEmailToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Supabase project setting "Confirm email" is on: new accounts stay
 * unconfirmed until the emailed link is opened, and no session is issued.
 * Returns the raw confirmation token for the caller to email (null when no
 * email should be sent, e.g. the address already belongs to a confirmed user —
 * GoTrue answers that case with a normal-looking response).
 */
export async function signUpWithPassword(opts: {
  email: string;
  password: string;
  data?: Record<string, unknown>;
}): Promise<{ user: AuthUser | null; confirmToken: string | null; error: string | null }> {
  const email = opts.email.trim().toLowerCase();
  if (!email || !opts.password) {
    return { user: null, confirmToken: null, error: "Email and password are required" };
  }
  if (opts.password.length < 6) {
    return { user: null, confirmToken: null, error: "Password should be at least 6 characters." };
  }

  const token = newEmailToken();
  const existing = await query(
    `SELECT * FROM auth.users WHERE lower(email) = $1 AND deleted_at IS NULL LIMIT 1`,
    [email]
  );
  const prior = existing.rows[0];
  if (prior?.email_confirmed_at) {
    return { user: rowToUser(prior), confirmToken: null, error: null };
  }
  if (prior) {
    // Unconfirmed signup repeated: refresh the password and send a new link.
    const { rows } = await query(
      `UPDATE auth.users
         SET encrypted_password = $1, confirmation_token = $2, confirmation_sent_at = now(),
             raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || $3::jsonb,
             updated_at = now()
       WHERE id = $4 RETURNING *`,
      [bcrypt.hashSync(opts.password, 10), token.hash, JSON.stringify(opts.data || {}), prior.id]
    );
    return { user: rowToUser(rows[0]), confirmToken: token.raw, error: null };
  }

  // handle_new_user (AFTER INSERT trigger) creates the matching profiles row.
  const { rows } = await query(
    `INSERT INTO auth.users (
       id, instance_id, aud, role, email, encrypted_password,
       confirmation_token, confirmation_sent_at, raw_app_meta_data, raw_user_meta_data,
       created_at, updated_at, recovery_token, email_change_token_new, email_change
     ) VALUES (
       $1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       $2, $3, $4, now(), '{"provider":"email","providers":["email"]}'::jsonb, $5::jsonb,
       now(), now(), '', '', ''
     ) RETURNING *`,
    [randomUUID(), email, bcrypt.hashSync(opts.password, 10), token.hash, JSON.stringify(opts.data || {})]
  );
  await query(
    `INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::text, $1, jsonb_build_object('sub', $1::text, 'email', $2::text,
             'email_verified', false, 'phone_verified', false), 'email', now(), now(), now())`,
    [rows[0].id, email]
  ).catch((e) => console.error("[auth] identity insert failed:", e.message));

  return { user: rowToUser(rows[0]), confirmToken: token.raw, error: null };
}

/** New confirmation link for an unconfirmed account (POST /auth/v1/resend). */
export async function resendSignupConfirmation(email: string): Promise<string | null> {
  const token = newEmailToken();
  const { rows } = await query(
    `UPDATE auth.users SET confirmation_token = $1, confirmation_sent_at = now(), updated_at = now()
     WHERE lower(email) = $2 AND email_confirmed_at IS NULL AND deleted_at IS NULL
     RETURNING id`,
    [token.hash, email.trim().toLowerCase()]
  );
  return rows[0] ? token.raw : null;
}

/** Recovery link for a known address (POST /auth/v1/recover); null when unknown. */
export async function createRecoveryToken(email: string): Promise<string | null> {
  const token = newEmailToken();
  const { rows } = await query(
    `UPDATE auth.users SET recovery_token = $1, recovery_sent_at = now(), updated_at = now()
     WHERE lower(email) = $2 AND deleted_at IS NULL
     RETURNING id`,
    [token.hash, email.trim().toLowerCase()]
  );
  return rows[0] ? token.raw : null;
}

/**
 * Consume an emailed link (GET /auth/v1/verify). Signup links confirm the
 * address; both kinds sign the user in, matching GoTrue's redirect with a
 * session in the URL fragment.
 */
export async function verifyEmailToken(
  type: "signup" | "recovery",
  rawToken: string
): Promise<{ session: SessionTokens | null; error: string | null }> {
  if (!rawToken) return { session: null, error: "Token is required" };
  const hash = hashEmailToken(rawToken);
  const sql =
    type === "signup"
      ? `UPDATE auth.users
           SET email_confirmed_at = COALESCE(email_confirmed_at, now()), confirmation_token = '',
               last_sign_in_at = now(), updated_at = now()
         WHERE confirmation_token = $1 AND deleted_at IS NULL
           AND confirmation_sent_at > now() - make_interval(secs => $2)
         RETURNING *`
      : `UPDATE auth.users
           SET recovery_token = '', email_confirmed_at = COALESCE(email_confirmed_at, now()),
               last_sign_in_at = now(), updated_at = now()
         WHERE recovery_token = $1 AND deleted_at IS NULL
           AND recovery_sent_at > now() - make_interval(secs => $2)
         RETURNING *`;
  const ttl = type === "signup" ? CONFIRMATION_TTL_SEC : RECOVERY_TTL_SEC;
  const { rows } = await query(sql, [hash, ttl]);
  if (!rows[0]) return { session: null, error: "Email link is invalid or has expired" };
  return { session: await mintSession(rows[0]), error: null };
}

export async function refreshSession(
  refreshToken: string
): Promise<{ session: SessionTokens | null; error: string | null }> {
  try {
    const { payload } = await jwtVerify(refreshToken, secretKey());
    if (payload.typ !== "refresh") {
      return { session: null, error: "Invalid refresh token" };
    }
    const userId = payload.sub;
    if (!userId || typeof userId !== "string") {
      return { session: null, error: "Invalid refresh token" };
    }
    const { rows } = await query(
      `SELECT id, email, phone, encrypted_password, email_confirmed_at,
              phone_confirmed_at, last_sign_in_at, raw_app_meta_data,
              raw_user_meta_data, created_at, updated_at
       FROM auth.users WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [userId]
    );
    if (!rows[0]) return { session: null, error: "User not found" };
    const session = await mintSession(rows[0]);
    return { session, error: null };
  } catch {
    return { session: null, error: "Invalid refresh token" };
  }
}

export async function updateUserPassword(
  userId: string,
  password: string
): Promise<{ user: AuthUser | null; error: string | null }> {
  if (!password || password.length < 6) {
    return { user: null, error: "Password must be at least 6 characters" };
  }
  const hash = bcrypt.hashSync(password, 10);
  await query(
    `UPDATE auth.users SET encrypted_password = $1, updated_at = now() WHERE id = $2`,
    [hash, userId]
  );
  const user = await getUserById(userId);
  return { user, error: null };
}

export async function updateUserMetadata(
  userId: string,
  data: Record<string, unknown>
): Promise<{ user: AuthUser | null; error: string | null }> {
  await query(
    `UPDATE auth.users
     SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || $1::jsonb,
         updated_at = now()
     WHERE id = $2`,
    [JSON.stringify(data), userId]
  );
  const user = await getUserById(userId);
  return { user, error: null };
}
