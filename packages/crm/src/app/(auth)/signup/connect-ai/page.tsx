// packages/crm/src/app/(auth)/signup/connect-ai/page.tsx
//
// 2026-05-27 — Step 2/2 of the restructured signup flow. Replaces
// /signup/billing (card capture) as the mandatory post-magic-link step
// because live signup telemetry showed a 100% drop-off there
// (0/12 conversions in 3.5d). The new gate asks for the operator's
// Anthropic API key — far more achievable AND directly unblocks the
// first build (/clients/new uses the key for extraction + soul + chatbot
// reply generation).
//
// Flow recap (from /signup → here):
//   /signup → form submit → magic-link email → user clicks link →
//   NextAuth callback creates session → redirects to
//   /signup/connect-ai?next=/clients/new?url=https://... (the visitor's
//   original prompt baked into ?next= via buildSignupConnectAiRedirect).
//
// This page:
//   - Auth-gates. No session → bounce to /signup.
//   - If the signed-in user's agency org already has an Anthropic key
//     stored, skips this step entirely and redirects to `next`. Mirrors
//     the existing-user-skip from /signup/billing/page.tsx so returning
//     operators who already connected their AI never see this page again.
//   - Otherwise renders the BYOK form. The form posts to
//     saveConnectAiKeyAction, which validates the key shape, encrypts,
//     and stores it on organizations.integrations.anthropic.apiKey at
//     the operator's agency-org level. All client workspaces inherit
//     the key automatically via parent_user_id walking in the BYOK
//     resolver.
//
// /signup/billing still exists — it's just no longer the magic-link
// landing. It's reached from /settings/billing and from the over-limit
// upgrade prompt ("add a card to unlock more workspaces") so the
// existing SetupIntent flow keeps working as an opt-in step.

import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { sanitizeNextPath } from "@/lib/auth/signup-redirect";
import { operatorHasByokAnthropicKey } from "@/lib/web-onboarding/byok-resolver";
import { OnboardingShell } from "@/components/onboarding/shell";

import { ConnectAiForm } from "./connect-ai-form";

export const dynamic = "force-dynamic";

export default async function SignupConnectAiPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    // Visitor reached /signup/connect-ai without a session — back to
    // /signup so they can start over with their email.
    redirect("/signup");
  }

  const params = await searchParams;
  const next = sanitizeNextPath(params.next);

  // Existing-user skip. A returning operator who already connected their
  // Anthropic key shouldn't have to paste it again. We read it off
  // organizations.integrations.anthropic.apiKey at the operator's
  // primary/agency org — same resolution path the runtime uses at
  // extraction time, so "has a usable key" here means "will succeed in
  // /clients/new". Done BEFORE rendering the form to save the round trip.
  const orgId =
    (session.user as { orgId?: string | null; primaryOrgId?: string | null }).orgId ??
    (session.user as { primaryOrgId?: string | null }).primaryOrgId ??
    null;

  if (orgId && (await operatorHasByokAnthropicKey(orgId))) {
    redirect(next);
  }

  // 2026-05-27 — Unified onboarding shell. This is step 1/3 of the arc:
  //   Step 1 — Connect AI  (← here)
  //   Step 2 — Build       (/clients/new)
  //   Step 3 — Make it yours (/clients/[slug]/ready → /settings/domain)
  //
  // The shell renders the header strip with logo + progress bar +
  // "Step 1 of 3" counter at the top. The bar fills to 33% here
  // (endowed-progress effect — they get credit for signing up). We
  // pass showLogo={false} because the (auth) layout already renders
  // the SeldonFrame wordmark above this card; two marks side-by-side
  // would look noisy.
  return (
    <div className="space-y-6">
      <OnboardingShell step={1} title="Connect AI" showLogo={false} />

      <div className="space-y-2 text-center">
        <h1 className="text-section-title text-foreground">Connect your AI provider</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">
          This unlocks workspace creation. You stay in control of cost, model,
          and rate limits. Estimated cost per workspace: ~$0.50–$1 in Claude
          tokens.
        </p>
      </div>

      <ConnectAiForm next={next} />

      {/* 2026-05-27 — Reassurance line beneath the form (above the
          encryption footer in ConnectAiForm), pulled into the page
          because the form is the shared primitive — the page owns the
          framing copy. Mirrors the BYOK-direct-billing point the
          marketing site makes so the visitor isn't surprised by token
          charges on their Anthropic statement later. */}
      <p className="text-center text-xs text-[hsl(var(--color-text-secondary))]">
        <span className="font-medium text-foreground">Why this first?</span>{" "}
        SeldonFrame doesn&apos;t proxy your AI usage — you pay Anthropic
        directly for tokens (~$0.50/workspace). This step unlocks workspace
        creation.
      </p>

      <footer className="border-t border-border pt-4 text-xs text-[hsl(var(--color-text-secondary))]">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/privacy" className="underline-offset-4 hover:underline">
            Privacy Policy
          </Link>
          <Link href="/terms" className="underline-offset-4 hover:underline">
            Terms of Service
          </Link>
          <span className="ml-auto">&copy; 2026 SeldonFrame</span>
        </div>
      </footer>
    </div>
  );
}
