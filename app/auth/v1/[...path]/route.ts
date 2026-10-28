import { NextRequest, NextResponse } from "next/server";
import {
  signInWithPassword,
  signUpWithPassword,
  refreshSession,
  verifyAccessToken,
  getUserById,
  updateUserPassword,
  updateUserMetadata,
  resendSignupConfirmation,
  createRecoveryToken,
  verifyEmailToken,
} from "@/lib/db/auth";
import { isPlainPostgres } from "@/lib/db/mode";
import { sendPasswordReset, sendSignupConfirmation } from "@/lib/notifications";
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";

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
    const auth = req.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (!token) return gotrueError("No authorization header", 401, "no_authorization");
    const verified = await verifyAccessToken(token);
    if (!verified) return gotrueError("Invalid JWT", 401, "invalid_token");
    const user = await getUserById(verified.userId);
    if (!user) return gotrueError("User not found", 401, "user_not_found");
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
      const email = String(body.email || "");
      const password = String(body.password || "");
      const { session, error } = await signInWithPassword(email, password);
      if (error === "Email not confirmed") {
        return gotrueError(error, 400, "email_not_confirmed");
      }
      if (error || !session) {
        return gotrueError(error || "Invalid login credentials", 400, "invalid_credentials");
      }
      return sessionResponse(session);
    }

    if (grant === "refresh_token") {
      const refresh = String(body.refresh_token || "");
      const { session, error } = await refreshSession(refresh);
      if (error || !session) {
        return gotrueError(error || "Invalid refresh token", 400, "refresh_token_not_found");
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
      const weak = error?.startsWith("Password");
      return gotrueError(error || "Signup failed", weak ? 422 : 400, weak ? "weak_password" : "validation_failed");
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

  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return gotrueError("No authorization header", 401, "no_authorization");
  const verified = await verifyAccessToken(token);
  if (!verified) return gotrueError("Invalid JWT", 401, "invalid_token");

  const body = (await req.json().catch(() => ({}))) as Record<string, any>;

  if (body.password) {
    const { user, error } = await updateUserPassword(verified.userId, String(body.password));
    if (error || !user) return gotrueError(error || "Update failed", 422, "weak_password");
    return NextResponse.json(user, { headers: cors() });
  }

  if (body.data || body.user_metadata) {
    const { user, error } = await updateUserMetadata(
      verified.userId,
      body.data || body.user_metadata
    );
    if (error || !user) return gotrueError(error || "Update failed");
    return NextResponse.json(user, { headers: cors() });
  }

  const user = await getUserById(verified.userId);
  return NextResponse.json(user, { headers: cors() });
}
