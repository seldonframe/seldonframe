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
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { organizations, orgMembers } from "@/db/schema";
import { assertWritable } from "@/lib/demo/server";
import { markOnboardingComplete } from "@/lib/onboarding/state";
import { sendOnboardingCompletionWelcomeEmail } from "@/lib/onboarding/welcome-email";
import { isLandingTemplateId } from "@/components/landing-templates/registry";
import { resolveHealthTemplate } from "@/lib/landing/template-selection";
import { DEFAULT_ORG_THEME, type OrgTheme } from "@/lib/theme/types";

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

/**
 * Set (or clear-to-Auto) the public landing design for a workspace from the
 * ready-page picker. `choice` is "auto" or one of the registered template ids.
 *
 * Persistence model (organizations.theme jsonb):
 *   - landingTemplate       → the concrete template id /w/[slug] renders.
 *   - landingTemplateChoice → the operator's intent ("auto" | id), so the
 *                             ready module can show "Auto-picked for X" vs
 *                             "Chosen by you" on return visits.
 *
 * "auto" resolves to the best-fit health template for the workspace's vertical
 * (resolveHealthTemplate). Re-validates the public page so the swap is live.
 * Gated on auth + workspace ownership — server actions are public endpoints.
 */
export async function setLandingTemplateAction(
  slug: string,
  choice: string,
): Promise<void> {
  assertWritable();

  const session = await auth();
  if (!session?.user?.id) return;

  const [ws] = await db
    .select({
      id: organizations.id,
      ownerId: organizations.ownerId,
      parentUserId: organizations.parentUserId,
      soul: organizations.soul,
      theme: organizations.theme,
    })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!ws) return;

  // Ownership gate — same shape as the ready page's read gate.
  const isOwner = ws.ownerId === session.user.id;
  const isParent = ws.parentUserId === session.user.id;
  if (!isOwner && !isParent) {
    const [member] = await db
      .select({ userId: orgMembers.userId })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, ws.id), eq(orgMembers.userId, session.user.id)))
      .limit(1);
    if (!member) return;
  }

  const vertical = ((ws.soul as unknown as { industry?: string } | null)?.industry ?? "").toString();

  let landingTemplate: string;
  let landingTemplateChoice: string;
  if (choice === "auto") {
    landingTemplate = resolveHealthTemplate(vertical);
    landingTemplateChoice = "auto";
  } else if (isLandingTemplateId(choice)) {
    landingTemplate = choice;
    landingTemplateChoice = choice;
  } else {
    return; // unknown id — ignore rather than corrupt the theme
  }

  const prevTheme: OrgTheme = ws.theme ?? DEFAULT_ORG_THEME;
  await db
    .update(organizations)
    .set({ theme: { ...prevTheme, landingTemplate, landingTemplateChoice } })
    .where(eq(organizations.id, ws.id));

  // The public landing renders /w/[slug] dynamically, but revalidate anyway in
  // case ISR is added later, and to bust any RSC cache.
  revalidatePath(`/w/${slug}`);
}
