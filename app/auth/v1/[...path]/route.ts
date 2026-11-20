import { NextRequest, NextResponse } from "next/server";
import {
  signInWithPassword,
  signUpWithPassword,
  refreshSession,
  verifyAccessToken,
  getUserForToken,
  canChangePasswordWith,
  signOutEverywhere,
  updateUserPassword,
  updateUserMetadata,
  resendSignupConfirmation,
  createRecoveryToken,
  verifyEmailToken,
  type AuthFailure,
} from "@/lib/db/auth";
import { isPlainPostgres } from "@/lib/db/mode";
import { sendPasswordReset, sendSignupConfirmation } from "@/lib/notifications";
import {
  checkRateLimit,
  clearLoginFailures,
  getClientIdentifier,
  loginLockRemaining,
  RATE_LIMITS,
  recordLoginFailure,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Emails sent per address per hour (Supabase's built-in mailer allows far fewer).
const EMAIL_LIMIT = { maxRequests: 5, windowSeconds: 3600 };
const IP_LIMIT = { maxRequests: 20, windowSeconds: 3600 };

function cors(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  };
}

function gotrueError(message: string, status = 400, code = "invalid_request") {
  return NextResponse.json(
    { error: code, error_code: code, error_description: message, msg: message, message },
    { status, headers: cors() }
  );
}

function failure(err: AuthFailure) {
  return gotrueError(err.message, err.status, err.code);
}

/** Sign-in attempts per IP and per address (successes count too; failures also feed the lockout). */
function loginRateLimited(req: NextRequest, email: string): NextResponse | null {
  const ip = checkRateLimit(`auth-login-ip:${getClientIdentifier(req)}`, RATE_LIMITS.authLoginIp);
  const addr = email ? checkRateLimit(`auth-login-email:${email}`, RATE_LIMITS.authLoginEmail) : { success: true };
  if (ip.success && addr.success) return null;
  return gotrueError("Too many requests. Please wait a minute and try again.", 429, "over_request_rate_limit");
}

function bearer(req: NextRequest): string {
  return (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

function sessionResponse(session: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: string;
  user: unknown;
}) {
  return NextResponse.json(
    {
      access_token: session.access_token,
      token_type: session.token_type,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      refresh_token: session.refresh_token,
      user: session.user,
    },
    { status: 200, headers: cors() }
  );
}

function siteUrl(req: NextRequest): string {
  return (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/+$/, "");
}

/** Only redirect back to this site (GoTrue's redirect allow-list). */
function safeRedirect(req: NextRequest, raw: string | null | undefined, fallbackPath: string): string {
  const base = siteUrl(req);
  if (raw) {
    try {
      const target = new URL(raw, base);
      const allowed = new URL(base);
      if (target.host === allowed.host || target.host === `www.${allowed.host}` || `www.${target.host}` === allowed.host) {
        return target.toString();
      }
    } catch {
      /* fall through */
    }
  }
  return `${base}${fallbackPath}`;
}

function verifyLink(req: NextRequest, type: "signup" | "recovery", token: string, redirectTo: string): string {
  const url = new URL(`${siteUrl(req)}/auth/v1/verify`);
  url.searchParams.set("token", token);
  url.searchParams.set("type", type);
  url.searchParams.set("redirect_to", redirectTo);
  return url.toString();
}

/** true when this caller/address has sent too many auth emails recently. */
function emailRateLimited(req: NextRequest, kind: string, email: string): boolean {
  const ip = checkRateLimit(`auth-${kind}-ip:${getClientIdentifier(req)}`, IP_LIMIT);
  const addr = checkRateLimit(`auth-${kind}-email:${email.trim().toLowerCase()}`, EMAIL_LIMIT);
  return !ip.success || !addr.success;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors() });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  if (!isPlainPostgres()) return gotrueError("DATABASE_URL not set", 503);

  const { path } = await ctx.params;
  const slug = path.join("/");

  if (slug === "user") {
    const token = bearer(req);
    if (!token) return gotrueError("This endpoint requires a Bearer token", 401, "no_authorization");
    // Invalid, expired, banned, deleted or revoked (signed out everywhere,
    // password changed) sessions all answer like GoTrue's bad_jwt.
    const user = await getUserForToken(token);
    if (!user) return gotrueError("invalid JWT: unable to parse or verify signature", 403, "bad_jwt");
    return NextResponse.json(user, { headers: cors() });
  }

  // Emailed confirmation / recovery links land here, then bounce back to the
  // site with the session in the URL fragment (supabase-js picks it up).
  if (slug === "verify") {
    const params = req.nextUrl.searchParams;
    const type = params.get("type") === "recovery" ? "recovery" : "signup";
    const fallback = type === "recovery" ? "/auth/reset-password" : "/auth/login?verified=1";
    const redirectTo = safeRedirect(req, params.get("redirect_to"), fallback);
    const { session, error } = await verifyEmailToken(type, params.get("token") || "");

    if (error || !session) {
      const failed = new URL(redirectTo);
      failed.hash = new URLSearchParams({
        error: "access_denied",
        error_code: "otp_expired",
        error_description: error || "Email link is invalid or has expired",
      }).toString();
      return NextResponse.redirect(failed.toString(), 303);
    }

    // Proving inbox access (reset or confirmation link) lifts a sign-in lock.
    if (session.user.email) clearLoginFailures(session.user.email);
    const target = new URL(redirectTo);
    target.hash = new URLSearchParams({
      access_token: session.access_token,
      expires_at: String(session.expires_at),
      expires_in: String(session.expires_in),
      refresh_token: session.refresh_token,
      token_type: session.token_type,
      type,
    }).toString();
    return NextResponse.redirect(target.toString(), 303);
  }

  if (slug === "settings" || slug === "health") {
    return NextResponse.json(
      { external: { email: true }, disable_signup: false, mailer_autoconfirm: false },
      { headers: cors() }
    );
  }

  return gotrueError(`Unknown auth path: ${slug}`, 404);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  if (!isPlainPostgres()) return gotrueError("DATABASE_URL not set", 503);

  const { path } = await ctx.params;
  const slug = path.join("/");
  const url = req.nextUrl;
  const contentType = req.headers.get("content-type") || "";

  let body: Record<string, any> = {};
  if (contentType.includes("application/json")) {
    body = (await req.json().catch(() => ({}))) as Record<string, any>;
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    body = Object.fromEntries(new URLSearchParams(text));
  }

  // /auth/v1/token?grant_type=password|refresh_token
  if (slug === "token") {
    const grant =
      url.searchParams.get("grant_type") ||
      body.grant_type ||
      "password";

    if (grant === "password") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const limited = loginRateLimited(req, email);
      if (limited) return limited;
      // 10 wrong passwords for one address lock it for 15 minutes. Only
      // failures count, and a correct password clears the count.
      const lockedFor = loginLockRemaining(email);
      if (lockedFor > 0) {
        return gotrueError(
          `Too many failed sign-in attempts. Try again in ${Math.ceil(lockedFor / 60)} minutes, or reset your password.`,
          429,
          "over_request_rate_limit"
        );
      }
      const { session, error } = await signInWithPassword(email, password);
      if (error?.code === "invalid_credentials") recordLoginFailure(email);
      else if (!error || error.code === "email_not_confirmed") clearLoginFailures(email);
      if (error || !session) return failure(error ?? { message: "Invalid login credentials", code: "invalid_credentials", status: 400 });
      return sessionResponse(session);
    }

    if (grant === "refresh_token") {
      const refresh = String(body.refresh_token || "");
      const { session, error } = await refreshSession(refresh);
      if (error || !session) {
        return failure(error ?? { message: "Invalid Refresh Token", code: "refresh_token_not_found", status: 400 });
      }
      return sessionResponse(session);
    }

    return gotrueError(`Unsupported grant_type: ${grant}`);
  }

  if (slug === "signup") {
    const email = String(body.email || "");
    if (email && emailRateLimited(req, "signup", email)) {
      return gotrueError("Email rate limit exceeded", 429, "over_email_send_rate_limit");
    }
    const { user, confirmToken, error } = await signUpWithPassword({
      email,
      password: String(body.password || ""),
      data: body.data || body.user_metadata || {},
    });
    if (error || !user) {
      return failure(error ?? { message: "Signup failed", code: "validation_failed", status: 400 });
    }
    if (confirmToken) {
      const redirectTo = safeRedirect(req, url.searchParams.get("redirect_to"), "/auth/login?verified=1");
      await sendSignupConfirmation(user.email, verifyLink(req, "signup", confirmToken, redirectTo));
    }
    // Confirmation required: GoTrue returns the user and no session.
    return NextResponse.json(user, { status: 200, headers: cors() });
  }

  if (slug === "resend") {
    const email = String(body.email || "");
    if (body.type !== "signup" || !email) return gotrueError("Only signup confirmations can be resent");
    if (emailRateLimited(req, "resend", email)) {
      return gotrueError("Email rate limit exceeded", 429, "over_email_send_rate_limit");
    }
    const token = await resendSignupConfirmation(email);
    if (token) {
      const redirectTo = safeRedirect(req, body.options?.emailRedirectTo || url.searchParams.get("redirect_to"), "/auth/login?verified=1");
      await sendSignupConfirmation(email.trim().toLowerCase(), verifyLink(req, "signup", token, redirectTo));
    }
    return NextResponse.json({}, { status: 200, headers: cors() });
  }

  if (slug === "recover") {
    const email = String(body.email || "");
    if (!email) return gotrueError("Email is required");
    if (emailRateLimited(req, "recover", email)) {
      return gotrueError("Email rate limit exceeded", 429, "over_email_send_rate_limit");
    }
    const token = await createRecoveryToken(email);
    if (token) {
      const redirectTo = safeRedirect(req, url.searchParams.get("redirect_to"), "/auth/reset-password");
      await sendPasswordReset(email.trim().toLowerCase(), verifyLink(req, "recovery", token, redirectTo));
    }
    // Same answer whether or not the address exists.
    return NextResponse.json({}, { status: 200, headers: cors() });
  }

  if (slug === "logout") {
    // supabase-js signOut() defaults to scope=global: end every session of
    // the account (all devices) by bumping its session version. "local" and
    // "others" only drop this browser's tokens. GoTrue answers 204 with no
    // body, and supabase-js keeps the session if this errors, so never fail.
    const scope = url.searchParams.get("scope") || "global";
    const token = bearer(req);
    if (scope === "global" && token) {
      await signOutEverywhere(token).catch((e) => console.error("[auth] global sign-out failed:", e.message));
    }
    // 204 must not include a body (NextResponse.json throws Invalid response status code 204)
    return new NextResponse(null, { status: 204, headers: cors() });
  }

  return gotrueError(`Unknown auth path: ${slug}`, 404);
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  if (!isPlainPostgres()) return gotrueError("DATABASE_URL not set", 503);

  const { path } = await ctx.params;
  const slug = path.join("/");

  if (slug !== "user") {
    return gotrueError(`Unknown auth path: ${slug}`, 404);
  }

  const token = bearer(req);
  if (!token) return gotrueError("This endpoint requires a Bearer token", 401, "no_authorization");
  const current = await getUserForToken(token);
  if (!current) return gotrueError("invalid JWT: unable to parse or verify signature", 403, "bad_jwt");

  const body = (await req.json().catch(() => ({}))) as Record<string, any>;
  let user = current;

  if (body.password !== undefined) {
    // supabase-js sends only the new password. Require a fresh sign-in (last
    // 15 minutes) or a session opened from a password-reset email, so a
    // borrowed or stolen session cannot take over the account.
    const verified = await verifyAccessToken(token);
    if (!verified || !canChangePasswordWith(verified.payload)) {
      return gotrueError(
        "For your security, please sign in again before changing your password.",
        401,
        "reauthentication_needed"
      );
    }
    const res = await updateUserPassword(current.id, String(body.password));
    if (res.error || !res.user) return failure(res.error ?? { message: "Update failed", code: "unexpected_failure", status: 500 });
    user = res.user;
  }

  if (body.data || body.user_metadata) {
    const res = await updateUserMetadata(current.id, body.data || body.user_metadata);
    if (res.error || !res.user) return failure(res.error ?? { message: "Update failed", code: "unexpected_failure", status: 500 });
    user = res.user;
  }

  return NextResponse.json(user, { headers: cors() });
}
