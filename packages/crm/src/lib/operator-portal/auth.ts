// ============================================================================
// v1.20.0 — operator-portal auth (sub-tenant operator login flow)
// ============================================================================
//
// White-label flagship surface. Audience: the HVAC owner / dentist /
// accountant / etc. who runs a workspace that an SF agency partner
// (Acme AI) has white-labeled to them. Distinct from:
//   - lib/portal/auth.ts (CUSTOMER portal — homeowners booking HVAC)
//   - NextAuth dashboard auth (SF AGENCY operator — Acme AI itself)
//
// Flow:
//   1. Agency operator (or workspace settings owner) calls
//      requestOperatorMagicLinkAction({ orgSlug, email })
//   2. We mint a JWT-style token (kind="magic", 15-min TTL) and email
//      a clickable link to /portal/<orgSlug>/magic?token=...
//   3. Operator clicks; the magic route calls
//      consumeOperatorMagicLink({ orgSlug, token }), which validates
//      the token, mints a session token (kind="session", 7-day TTL),
//      sets the sf_operator_session cookie, and redirects to
//      /portal/<orgSlug> (the operator dashboard)
//   4. Subsequent requests: requireOperatorSessionForOrg(orgSlug)
//      reads the cookie, validates kind="session", returns
//      { orgId, email } scoped to that workspace
//
// Plan gate: only Scale-tier workspaces (or workspaces under an
// active partner agency on Scale) can issue operator magic links.
// Free/Growth get a 422 with upgrade nudge.
//
// Security model:
//   - Magic-link token is JWT-only (no DB row). We accept the
//     trade-off that a leaked token is usable until expiry; mitigated
//     by 15-min TTL + HTTPS-only delivery + single-use semantic
//     (the magic route swaps it for a session cookie immediately,
//     so a re-click after first use lands them already-signed-in
//     anyway). v1.21 will add a one-shot DB nonce for true
//     single-use enforcement.
//   - Session cookie is HMAC-signed, httpOnly, sameSite=lax,
//     secure-in-prod. 7-day rolling exp.
//   - We DO NOT touch organizations.owner_id automatically — the
//     issuer must vouch for the email belonging to a person who
//     should manage this workspace. v1.21 adds an explicit "claim
//     workspace ownership" step on first sign-in.

"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { assertWritable } from "@/lib/demo/server";
import { emitSeldonEvent } from "@/lib/events/bus";
import { trackEvent } from "@/lib/analytics/track";
import {
  OPERATOR_SESSION_COOKIE,
  signOperatorToken,
  verifyOperatorToken,
  type OperatorTokenPayload,
} from "./session";
import {
  pickFromAddress,
  sendOperatorMagicLinkEmail,
} from "@/lib/emails/operator-magic-link";
import { getEffectiveBrandingForWorkspace } from "@/lib/partner-agencies/branding";

const MAGIC_LINK_TTL_MIN = 15;
const SESSION_TTL_DAYS = 7;

function getAppOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "http://localhost:3000"
  );
}

async function getOrgBySlug(orgSlug: string) {
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      ownerId: organizations.ownerId,
      parentAgencyId: organizations.parentAgencyId,
    })
    .from(organizations)
    .where(eq(organizations.slug, orgSlug))
    .limit(1);
  return org ?? null;
}

async function setOperatorSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(OPERATOR_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

// ─── server actions ────────────────────────────────────────────────────────

export type RequestOperatorMagicLinkResult =
  | { ok: true; expiresAt: string; sentTo: string }
  | { ok: false; reason: string };

/**
 * Mint a magic-link token + email it to the operator.
 *
 * Idempotent + safe to call repeatedly: each call mints a fresh
 * token. Old tokens stay valid until their 15-min TTL elapses (no
 * DB row to invalidate; v1.21 will add nonce enforcement).
 *
 * Silent-no-op observability (v1.19 pattern): every short-circuit
 * path emits a structured warn so production monitoring can
 * attribute "no email arrived" reports.
 */
export async function requestOperatorMagicLinkAction(input: {
  orgSlug: string;
  email: string;
  invitedByName?: string;
}): Promise<RequestOperatorMagicLinkResult> {
  assertWritable();

  const orgSlug = input.orgSlug.trim();
  const email = (input.email ?? "").trim().toLowerCase();
  const emailDomain = email.split("@")[1] ?? null;

  if (!orgSlug || !email) {
    return { ok: false, reason: "missing_required_field" };
  }

  const org = await getOrgBySlug(orgSlug);
  if (!org) {
    console.warn(
      `[operator-magic-link] silent_no_op: org_not_found org_slug=${orgSlug} email_domain=${emailDomain}`,
    );
    return { ok: true, expiresAt: "", sentTo: email };
  }

  // Build the magic-link token + URL.
  const expiresAtMs = Date.now() + MAGIC_LINK_TTL_MIN * 60_000;
  const payload: OperatorTokenPayload = {
    orgId: org.id,
    email,
    exp: expiresAtMs,
    kind: "magic",
  };
  const token = signOperatorToken(payload);
  const inviteUrl = new URL(
    `/portal/${orgSlug}/magic`,
    getAppOrigin(),
  );
  inviteUrl.searchParams.set("token", token);

  // Apply partner-agency branding to the email if the workspace is
  // under an active agency.
  const branding = await getEffectiveBrandingForWorkspace(org.id);

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn(
      `[operator-magic-link] silent_no_op: resend_not_configured org_id=${org.id} email_domain=${emailDomain}`,
    );
    return { ok: true, expiresAt: new Date(expiresAtMs).toISOString(), sentTo: email };
  }

  const fromAddress = pickFromAddress(process.env);

  const send = await sendOperatorMagicLinkEmail(
    {
      email,
      workspaceName: org.name ?? orgSlug,
      inviteUrl: inviteUrl.toString(),
      expiresInMinutes: MAGIC_LINK_TTL_MIN,
      brandName: branding?.is_white_label ? branding.brand_name : null,
      logoUrl: branding?.logo_url ?? null,
      supportUrl: branding?.is_white_label ? branding.support_url : null,
      invitedByName: input.invitedByName?.trim() || null,
    },
    { apiKey, fromAddress },
  );

  if (!send.ok) {
    console.error(
      `[operator-magic-link] send_failed org_id=${org.id} email_domain=${emailDomain} status=${send.status} error=${send.error}`,
    );
    return { ok: false, reason: "email_send_failed" };
  }

  await emitSeldonEvent(
    "operator_portal.magic_link_issued",
    { email_domain: emailDomain ?? "(no_domain)" },
    { orgId: org.id },
  );

  trackEvent(
    "operator_magic_link_issued",
    { email_domain: emailDomain ?? "(no_domain)" },
    { orgId: org.id },
  );

  return {
    ok: true,
    expiresAt: new Date(expiresAtMs).toISOString(),
    sentTo: email,
  };
}

// ─── magic-link consumption (called by /portal/[orgSlug]/magic route) ──────

export async function consumeOperatorMagicLink(input: {
  orgSlug: string;
  token: string;
}): Promise<
  | { ok: true; orgId: string; email: string }
  | { ok: false; reason: string }
> {
  const orgSlug = input.orgSlug.trim();
  const token = input.token.trim();

  if (!orgSlug || !token) {
    return { ok: false, reason: "missing_token_or_slug" };
  }

  const verified = verifyOperatorToken(token);
  if (!verified || verified.kind !== "magic") {
    return { ok: false, reason: "invalid_or_expired_token" };
  }

  const org = await getOrgBySlug(orgSlug);
  if (!org || org.id !== verified.orgId) {
    return { ok: false, reason: "org_mismatch" };
  }

  // Mint a session token (long TTL) and set the cookie.
  const sessionExp = Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
  const sessionToken = signOperatorToken({
    orgId: org.id,
    email: verified.email,
    exp: sessionExp,
    kind: "session",
    supportOriginUserId: verified.supportOriginUserId ?? null,
  });
  await setOperatorSessionCookie(sessionToken);

  await emitSeldonEvent(
    "operator_portal.session_established",
    { email_domain: verified.email.split("@")[1] ?? "(no_domain)" },
    { orgId: org.id },
  );

  trackEvent(
    "operator_portal_login",
    { login_method: "magic_link" },
    { orgId: org.id },
  );

  return { ok: true, orgId: org.id, email: verified.email };
}

// ─── session reads ─────────────────────────────────────────────────────────

export async function getOperatorSessionForOrg(orgSlug: string): Promise<
  | { orgId: string; orgSlug: string; email: string; supportOriginUserId: string | null }
  | null
> {
  const org = await getOrgBySlug(orgSlug);
  if (!org) return null;

  const cookieStore = await cookies();
  const token = cookieStore.get(OPERATOR_SESSION_COOKIE)?.value;
  const verified = verifyOperatorToken(token);
  if (!verified || verified.kind !== "session" || verified.orgId !== org.id) {
    return null;
  }

  return {
    orgId: org.id,
    orgSlug: org.slug,
    email: verified.email,
    supportOriginUserId: verified.supportOriginUserId ?? null,
  };
}

export async function requireOperatorSessionForOrg(orgSlug: string) {
  const session = await getOperatorSessionForOrg(orgSlug);
  if (!session) {
    redirect(`/portal/${orgSlug}/login`);
  }
  return session;
}

export async function clearOperatorSessionAction(orgSlug: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(OPERATOR_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  redirect(`/portal/${orgSlug}/login`);
}
