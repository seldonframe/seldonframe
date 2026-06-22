// packages/crm/src/app/(auth)/signup/connect-ai/actions.ts
//
// 2026-05-27 — Server Actions for the new step 2/2 of signup: collect the
// operator's Anthropic API key so /clients/new can extract their first
// workspace immediately afterwards.
//
// Replaces /signup/billing as the mandatory post-magic-link step. The
// rationale is in the route's page.tsx header and in the PR description;
// in short: live signup telemetry showed 0/12 conversions through the
// card-collection step over 3.5 days. Card capture moves to opt-in
// (triggered from the over-limit upgrade prompt); BYOK becomes the new
// gate because it directly unblocks the next action the visitor wants
// to take.
//
// Two actions:
//   - saveConnectAiKeyAction — validates the key shape, encrypts it,
//     stores it on the operator's agency-org row, redirects to ?next=.
//   - skipConnectAiAction — escape hatch for env-degraded paths (no
//     ENCRYPTION_KEY in the deployment, for example). Logs the skip so
//     ops can see how often it fires; the visitor is not stranded.
//
// Both are server-only and gated through auth() — a session-less request
// to either action bounces back to /signup.

"use server";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { assertWritable } from "@/lib/demo/server";
import { sanitizeNextPath } from "@/lib/auth/signup-redirect";
import { setOperatorByokAnthropicKey } from "@/lib/web-onboarding/byok-resolver";

/** Discriminated shape returned to the form when validation/encryption
 *  fails before we can redirect. The form re-renders with the message
 *  inline so the visitor can correct the key without losing their place. */
export type SaveConnectAiKeyState = {
  error?: string;
  /** Echoed back so the input keeps its value on re-render (we never
   *  echo the raw key — only an indicator that the previous submit
   *  preserved the buffer). The actual value lives in the form's
   *  uncontrolled input across the action round-trip since we use
   *  useActionState. */
  attempted?: boolean;
};

/**
 * Persist the operator's Anthropic key on their agency-org and redirect
 * to the validated next path. The setter merges into
 * organizations.integrations.anthropic.apiKey so client workspaces
 * (children with parent_user_id = operator) inherit the key for every
 * downstream Anthropic call (extraction, soul gen, chatbot replies, ...).
 *
 * Returns SaveConnectAiKeyState only on validation failure — on success
 * the redirect throws and the function never returns. (useActionState
 * needs the same return type on both branches; redirect() satisfies the
 * never-return half.)
 */
export async function saveConnectAiKeyAction(
  _prev: SaveConnectAiKeyState,
  formData: FormData,
): Promise<SaveConnectAiKeyState> {
  try {
    assertWritable();
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Sign up is unavailable in demo mode.",
      attempted: true,
    };
  }

  const session = await auth();
  if (!session?.user?.id) {
    // No active session — start the signup over from scratch. The form's
    // re-render path wouldn't help here (nothing to save against), so
    // hard redirect.
    redirect("/signup");
  }

  // The operator's primary/agency org is whichever org their auth
  // session was minted against. Same shape resolution as
  // /api/integrations/anthropic POST — we read it off the session
  // without an extra round trip.
  const orgId =
    (session.user as { orgId?: string | null; primaryOrgId?: string | null }).orgId ??
    (session.user as { primaryOrgId?: string | null }).primaryOrgId ??
    null;

  if (!orgId) {
    // A user with a session but no primary org would be a brand-new
    // signup edge case — there's nothing to store against yet. The
    // safest fallback is to let them continue to /clients/new where
    // the inline BYOK retry path can capture the key after they have
    // an org from the workspace they're about to create.
    const nextPathFallback = sanitizeNextPath(formData.get("next"));
    console.warn(
      JSON.stringify({
        event: "signup_connect_ai_no_primary_org",
        user_id: session.user.id,
      }),
    );
    redirect(nextPathFallback);
  }

  const rawKey = String(formData.get("apiKey") ?? "").trim();
  const nextPath = sanitizeNextPath(formData.get("next"));

  if (rawKey.length === 0) {
    return { error: "Paste your Anthropic API key to continue.", attempted: true };
  }
  if (rawKey.length < 10 || rawKey.length > 500) {
    return { error: "That doesn't look like an Anthropic key.", attempted: true };
  }

  const result = await setOperatorByokAnthropicKey({ orgId, apiKey: rawKey });

  if (!result.ok) {
    if (result.reason === "invalid_key_shape") {
      return {
        error: "Anthropic keys start with sk-ant-. Double-check the key you copied.",
        attempted: true,
      };
    }
    if (result.reason === "encryption_unavailable") {
      // Env-level misconfiguration; surface a clear admin-facing message
      // and let the user skip so they aren't stranded. The skip route
      // logs this case so ops can see encryption is broken.
      console.error(
        JSON.stringify({
          event: "signup_connect_ai_encryption_unavailable",
          user_id: session.user.id,
        }),
      );
      return {
        error:
          "We couldn't save the key right now — try again in a moment. If this persists, contact support.",
        attempted: true,
      };
    }
    if (result.reason === "org_not_found") {
      console.error(
        JSON.stringify({
          event: "signup_connect_ai_org_not_found",
          user_id: session.user.id,
          org_id: orgId,
        }),
      );
      return { error: "Account lookup failed. Try signing in again.", attempted: true };
    }
  }

  // Telemetry — pair this with the existing signup_card_confirm event so
  // we can compare conversion rates between the two step 2/2 surfaces.
  console.log(
    JSON.stringify({
      event: "signup_connect_ai_saved",
      user_id: session.user.id,
      org_id: orgId,
      next: nextPath,
    }),
  );

  redirect(nextPath);
}

/**
 * 2026-06-22 — Magic first-run. This is the "Skip — start free →" path on
 * the signup connect-ai page. The first workspace builds on SeldonFrame's
 * platform key (create-from-url/paste resolve BYOK → ANTHROPIC_API_KEY),
 * so a key is NOT required to sign up. This action marks the step skipped
 * (stores NO key) + redirects to the same ?next= destination
 * (= /clients/new), where the visitor's pasted URL builds their workspace
 * for free. BYOK is prompted later, only at the unbounded-COGS moments:
 * building/running agents in the Studio (generateAgentDraftAction /
 * testAgentTemplateTurn gate on mode !== "byok") or a 2nd workspace.
 *
 * Also doubles as the escape hatch for env-degraded paths (no
 * ENCRYPTION_KEY in the deployment); the skip is logged either way so ops
 * can see how often it fires.
 */
export async function skipConnectAiAction(formData: FormData): Promise<never> {
  assertWritable();

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signup");
  }

  const nextPath = sanitizeNextPath(formData.get("next"));

  console.log(
    JSON.stringify({
      event: "signup_connect_ai_skipped",
      user_id: session.user.id,
      next: nextPath,
    }),
  );

  redirect(nextPath);
}
