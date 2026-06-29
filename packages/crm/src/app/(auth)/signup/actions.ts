"use server";

import { z } from "zod";
import { signIn } from "@/auth";
import { assertWritable } from "@/lib/demo/server";
import { resolveInboxUrl } from "@/lib/utils/email-inbox";
import { isSafeInternalRedirect } from "@/lib/auth/signup-redirect";

export type MagicLinkActionState = {
  error?: string;
  sent?: boolean;
  email?: string;
  inboxUrl?: string;
};

const emailSchema = z.object({
  email: z.string().email(),
});


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
 *
 * 2026-06-29 — Allowlist now delegates to `isSafeInternalRedirect`
 * (lib/auth/signup-redirect), which adds `/marketplace/*` so a buyer who
 * signs up from a public agent listing's Install/Rent button RETURNS to the
 * agent instead of being dumped on /clients/new with the buy intent lost.
 * The open-redirect policy (leading slash only, no //, no scheme/host
 * smuggling) is the SAME helper the login/signup forms use to turn the
 * `?callbackUrl=` into the hidden `redirectTo` — one shared policy, no drift.
 */
function sanitizeRedirectTo(value: unknown) {
  return isSafeInternalRedirect(value) ? (value as string).trim() : "/clients/new";
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

// Test-only DI seam (the repo idiom from installAgentListingAction /
// set-booking-policy: prefer dependency injection over mock.module, which is
// unreliable under tsx's CJS interop). Production callers (the login/signup
// forms via useActionState) pass exactly (prevState, formData), so the real
// `signIn` + `assertWritable` defaults apply and `deps` is never serialized
// across the client→server boundary. A unit test passes fakes to assert what
// redirectTo gets threaded into signIn WITHOUT a real NextAuth/Postgres.
type MagicLinkActionDeps = {
  signIn: (provider: string, options: { email: string; redirect: boolean; redirectTo: string }) => Promise<unknown>;
  assertWritable: () => void;
};

export async function sendMagicLinkAction(
  _: MagicLinkActionState,
  formData: FormData,
  deps?: MagicLinkActionDeps,
): Promise<MagicLinkActionState> {
  const signInImpl = deps?.signIn ?? (signIn as MagicLinkActionDeps["signIn"]);
  const assertWritableImpl = deps?.assertWritable ?? assertWritable;
  try {
    assertWritableImpl();
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
    await signInImpl("resend", {
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
