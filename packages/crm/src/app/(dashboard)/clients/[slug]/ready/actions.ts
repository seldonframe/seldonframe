// packages/crm/src/app/(dashboard)/clients/[slug]/ready/actions.ts
//
// 2026-05-27 — Onboarding-completion actions for the Ready page.
//
// The Ready page is the terminal screen of the unified onboarding arc
// (step 3/3 — Make it yours). The arc completes via either of two
// user actions:
//
//   1. Click "Connect custom domain →" — exits to /settings/domain.
//      Onboarding completes on the OTHER side, when the domain save
//      succeeds (gated in the domain settings page itself; not here).
//
//   2. Click "Maybe later →" — escape hatch. Marks onboarding complete
//      immediately and redirects to the workspace dashboard so the
//      operator can start using what they built without being nagged
//      to upgrade. This is the "skip" path; it's deliberately framed
//      as a soft maybe rather than a permanent dismissal so the loss-
//      aversion copy ("Your client sees …") still does its work above.
//
// Both paths flip users.onboarding_completed_at to NOW(); the next time
// the user hits any of the three shell-wrapped pages, the shell
// computes completed=true and renders nothing.

"use server";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { assertWritable } from "@/lib/demo/server";
import { markOnboardingComplete } from "@/lib/onboarding/state";
import { sendOnboardingCompletionWelcomeEmail } from "@/lib/onboarding/welcome-email";

/**
 * "Maybe later" — the soft-skip path from the step-3 surface. Marks
 * onboarding complete and redirects to the workspace's own dashboard.
 *
 * The redirect goes through /switch-workspace?to=<id>&next=/dashboard
 * because the operator is currently in their AGENCY org context (the
 * Ready page is under the agency dashboard chrome); the workspace they
 * just built is a separate org. Without /switch-workspace they'd land
 * on the AGENCY dashboard instead of the new client workspace's, which
 * defeats the "go use what you built" intent.
 *
 * The workspace id + slug are encoded in the form's hidden inputs
 * because server actions don't see route params automatically.
 *
 * Side effect: also fires the welcome email (best-effort). Failure is
 * swallowed — the redirect must still happen.
 */
export async function dismissOnboardingAction(formData: FormData): Promise<never> {
  // Demo-readonly gate. Same shape as every other write-side action so
  // a hosted demo deployment doesn't accidentally mark accounts as
  // onboarded just because someone clicked the button.
  assertWritable();

  const session = await auth();
  if (!session?.user?.id) {
    // No session → bounce to /login. Shouldn't happen because the
    // Ready page itself gates on auth, but defensive: an action
    // invocation without a session is a state we should not silently
    // succeed for.
    redirect("/login");
  }

  const workspaceId = String(formData.get("workspaceId") ?? "").trim();
  const workspaceSlug = String(formData.get("workspaceSlug") ?? "").trim();
  const baseDomain = String(formData.get("baseDomain") ?? "").trim();

  await markOnboardingComplete(session.user.id);

  // Telemetry — pair with signup_connect_ai_saved + ready_page_seen so
  // we can compute step-3-to-completion conversion. Logged before the
  // email/redirect so we still capture the event even if either fails.
  console.log(
    JSON.stringify({
      event: "onboarding_dismissed_maybe_later",
      user_id: session.user.id,
      workspace_id: workspaceId || null,
      workspace_slug: workspaceSlug || null,
    }),
  );

  // Fire the welcome email best-effort. Wrapped in try/catch — Resend
  // outage / sandbox-mode rejection must not block the redirect (the
  // operator already clicked "Maybe later"; making them wait for an
  // SMTP timeout would be hostile).
  if (workspaceSlug && baseDomain) {
    try {
      await sendOnboardingCompletionWelcomeEmail({
        email: session.user.email ?? null,
        name: session.user.name ?? null,
        workspaceName: workspaceSlug, // fallback; the helper queries the real name
        workspaceSlug,
        baseDomain,
      });
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "onboarding_welcome_email_failed",
          user_id: session.user.id,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  // Redirect to the workspace dashboard via switch-workspace so the
  // active org cookie lands on the workspace they just built.
  if (workspaceId) {
    redirect(
      `/switch-workspace?to=${encodeURIComponent(workspaceId)}&next=${encodeURIComponent("/dashboard")}`,
    );
  }
  redirect("/dashboard");
}
