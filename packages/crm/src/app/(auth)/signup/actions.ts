"use server";

import { z } from "zod";
import { signIn } from "@/auth";
import { assertWritable } from "@/lib/demo/server";

export type MagicLinkActionState = {
  error?: string;
  sent?: boolean;
  email?: string;
  inboxUrl?: string;
};

const emailSchema = z.object({
  email: z.string().email(),
});

function resolveInboxUrl(email: string) {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";

  if (domain === "gmail.com" || domain === "googlemail.com") {
    return "https://mail.google.com/mail/u/0/#search/from:noreply@seldonframe.com";
  }

  if (["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(domain)) {
    return "https://outlook.live.com/mail/";
  }

  return null;
}

function isRedirectControlFlowError(error: unknown) {
  const digest = (error as { digest?: string } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/**
 * Sanitize the redirectTo field the signup form submits. The form embeds
 * /signup/connect-ai?next=/clients/new?url=... when the visitor arrived
 * from the marketing prompt; the bare default is /clients/new. Both shapes
 * are allowed; anything else falls through to /clients/new.
 *
 * 2026-05-22 — Expanded to allow the new /signup/billing target. Without
 * this, the signup form's redirectTo gets rewritten to /clients/new by
 * the old check (which only validated the leading slash), bypassing the
 * card-collection step entirely.
 *
 * 2026-05-27 — Added /signup/connect-ai. /signup/billing entry was a 100%
 * drop-off (0/12 real signups in 3.5d). Mandatory step 2/2 moves to the
 * Anthropic BYOK collection page; /signup/billing stays in the allowlist
 * because it remains the destination for the "add a card to unlock more
 * workspaces" CTA fired from the over-limit upgrade prompt — same route,
 * just no longer the default magic-link redirect.
 */
function sanitizeRedirectTo(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw.startsWith("/") || raw.startsWith("//")) {
    return "/clients/new";
  }

  // Allow /signup/connect-ai (BYOK collection — new step 2/2) and
  // /signup/billing (kept for opt-in card capture from the over-limit
  // prompt), /clients/new (with arbitrary query) for the direct landing,
  // /dashboard as a safety fallback, and /claim/... for the existing
  // workspace-claim flow.
  const pathOnly = raw.split("?")[0]!;
  const allowed =
    pathOnly === "/signup/connect-ai" ||
    pathOnly === "/signup/billing" ||
    pathOnly === "/clients/new" ||
    pathOnly === "/dashboard" ||
    pathOnly === "/claim" ||
    pathOnly.startsWith("/clients/new/") ||
    pathOnly.startsWith("/dashboard/") ||
    pathOnly.startsWith("/claim/");

  return allowed ? raw : "/clients/new";
}

export async function signInWithGoogleAction() {
  assertWritable();

  // Google OAuth currently always lands on /clients/new — extending the
  // marketing-prompt passthrough to Google is a future-improvement task
  // (the OAuth round trip on Google's side would need to preserve our
  // redirectTo, which works but requires testing across the consent
  // screens). Email magic-link is the primary path for the new flow.
  await signIn("google", { redirectTo: "/clients/new" });
}

export async function sendMagicLinkAction(_: MagicLinkActionState, formData: FormData): Promise<MagicLinkActionState> {
  try {
    assertWritable();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Sign in is unavailable in demo mode." };
  }

  const parsed = emailSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { error: "Enter a valid email address." };
  }

  const email = parsed.data.email.trim().toLowerCase();
  const redirectTo = sanitizeRedirectTo(formData.get("redirectTo"));

  try {
    await signIn("resend", {
      email,
      redirect: false,
      redirectTo,
    });

    return {
      sent: true,
      email,
      inboxUrl: resolveInboxUrl(email) ?? undefined,
    };
  } catch (error) {
    if (isRedirectControlFlowError(error)) {
      return {
        sent: true,
        email,
        inboxUrl: resolveInboxUrl(email) ?? undefined,
      };
    }

    return { error: "Could not send magic link right now. Please try again." };
  }
}
