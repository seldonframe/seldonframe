// packages/crm/src/lib/onboarding/welcome-email.ts
//
// 2026-05-27 — Wrapper around lib/emails/welcome that fires a "Your
// first SeldonFrame workspace is live" email when the unified
// onboarding shell completes (either via the "Maybe later" dismissal
// or via a successful custom-domain save). The existing
// /api/v1/email/send-welcome route + sendWelcomeEmail() handle the
// rendering + Resend dispatch; this wrapper just resolves the
// workspace-context fields (urls, tier) from the DB and forwards
// to sendWelcomeEmail with the right shape.
//
// Why a separate wrapper rather than calling sendWelcomeEmail()
// directly from actions.ts:
//   - actions.ts is a "use server" file; it can't import the full
//     Resend client easily without ballooning the action bundle.
//     A thin server-side wrapper keeps the action lean.
//   - The wrapper knows how to build the workspace URLs from the slug
//     (booking, intake, landing, admin) — that's lib/billing logic the
//     action shouldn't have to inline.
//   - Errors are swallowed inside the wrapper so callers don't need
//     try/catch boilerplate — the email is fire-and-forget by design
//     (a Resend outage must not block the redirect after "Maybe later").
//
// Wire dependencies:
//   - RESEND_API_KEY — if absent, the email send is skipped with a
//     warning log. The user still completes onboarding; they just
//     don't get the email.
//   - WORKSPACE_BASE_DOMAIN — fallback to "app.seldonframe.com" if
//     unset, same as the Ready page does.

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { bookings, intakeForms, landingPages, organizations } from "@/db/schema";
import {
  pickFromAddress,
  sendWelcomeEmail,
  type WelcomeEmailRequest,
} from "@/lib/emails/welcome";

export type OnboardingCompletionWelcomeEmailInput = {
  /** The signed-in user's email. Null/undefined → email send is skipped
   *  (no recipient → nothing to do). The caller pulls this off
   *  session.user.email. */
  email: string | null;
  /** The user's display name. Used to personalize the greeting; falls
   *  back to "Welcome aboard," when null. */
  name: string | null;
  /** Display name for the workspace they just built. Used as a fallback
   *  if the DB lookup fails to find the org row. */
  workspaceName: string;
  /** Slug of the workspace. Used to build all the public URLs. */
  workspaceSlug: string;
  /** WORKSPACE_BASE_DOMAIN from the calling page's env, e.g.
   *  "app.seldonframe.com". The caller already resolved this so we
   *  don't re-read process.env here. */
  baseDomain: string;
};

const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim() ?? "";

/**
 * Send the post-onboarding welcome email best-effort.
 *
 * Behavior:
 *   - Returns void; never throws. Failure paths are logged and
 *     swallowed so the caller (a server action that redirects on
 *     completion) never has to handle this.
 *   - Skips entirely when email is null OR RESEND_API_KEY is unset —
 *     both are non-fatal states for the onboarding flow.
 *   - Looks up the workspace's booking/intake/landing slugs so the
 *     email's URL list matches what /clients/[slug]/ready shows.
 */
export async function sendOnboardingCompletionWelcomeEmail(
  input: OnboardingCompletionWelcomeEmailInput,
): Promise<void> {
  if (!input.email) {
    console.warn(
      JSON.stringify({
        event: "onboarding_welcome_email_skipped",
        reason: "no_recipient",
      }),
    );
    return;
  }
  if (!RESEND_API_KEY) {
    console.warn(
      JSON.stringify({
        event: "onboarding_welcome_email_skipped",
        reason: "resend_unconfigured",
      }),
    );
    return;
  }

  // Resolve the canonical workspace name (and the workspace id we need
  // to scope the booking/intake/landing lookups) from the slug. If the
  // lookup fails we fall back to the slug-derived name and skip the
  // detail URLs — better to send a sparse email than nothing.
  const [workspaceRow] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      plan: organizations.plan,
    })
    .from(organizations)
    .where(eq(organizations.slug, input.workspaceSlug))
    .limit(1);

  if (!workspaceRow) {
    console.warn(
      JSON.stringify({
        event: "onboarding_welcome_email_skipped",
        reason: "workspace_not_found",
        slug: input.workspaceSlug,
      }),
    );
    return;
  }

  const appBase = `https://${input.baseDomain}`;

  // Look up the deep-link slugs in parallel — same shape the Ready
  // page uses, so the email URLs match exactly what the operator just
  // saw on screen. If any of the three are absent, we synthesize a
  // shorter version of the URL (the slug roots already work as landing
  // entry points, just less specific).
  const [bookingTemplateRow] = await db
    .select({ slug: bookings.bookingSlug })
    .from(bookings)
    .where(and(eq(bookings.orgId, workspaceRow.id), eq(bookings.status, "template")))
    .limit(1);

  const [intakeFormRow] = await db
    .select({ slug: intakeForms.slug })
    .from(intakeForms)
    .where(and(eq(intakeForms.orgId, workspaceRow.id), eq(intakeForms.isActive, true)))
    .limit(1);

  const [landingRow] = await db
    .select({ id: landingPages.id })
    .from(landingPages)
    .where(
      and(
        eq(landingPages.orgId, workspaceRow.id),
        eq(landingPages.slug, "r1"),
        eq(landingPages.status, "published"),
      ),
    )
    .limit(1);

  const landingUrl = landingRow
    ? `${appBase}/w/${input.workspaceSlug}`
    : `https://${input.workspaceSlug}.${input.baseDomain}`;
  const bookingUrl = bookingTemplateRow
    ? `${appBase}/book/${input.workspaceSlug}/${bookingTemplateRow.slug}`
    : `${appBase}/book/${input.workspaceSlug}`;
  const intakeUrl = intakeFormRow
    ? `${appBase}/forms/${input.workspaceSlug}/${intakeFormRow.slug}`
    : `${appBase}/forms/${input.workspaceSlug}`;
  // Admin = the workspace's own dashboard via switch-workspace so the
  // active-org cookie lands correctly. This mirrors the Ready page's
  // sw() helper.
  const adminUrl = `${appBase}/switch-workspace?to=${encodeURIComponent(workspaceRow.id)}&next=${encodeURIComponent("/dashboard")}`;

  const tier: "free" | "growth" | "scale" =
    workspaceRow.plan === "growth" || workspaceRow.plan === "scale"
      ? workspaceRow.plan
      : "free";

  const payload: WelcomeEmailRequest = {
    email: input.email,
    name: input.name,
    workspace: {
      landing_url: landingUrl,
      booking_url: bookingUrl,
      intake_url: intakeUrl,
      admin_url: adminUrl,
    },
    tier,
  };

  const fromAddress = pickFromAddress(process.env);
  const result = await sendWelcomeEmail(payload, {
    apiKey: RESEND_API_KEY,
    fromAddress,
  });

  if (!result.ok) {
    console.error(
      JSON.stringify({
        event: "onboarding_welcome_email_failed",
        slug: input.workspaceSlug,
        status: result.status,
        error: result.error,
      }),
    );
    return;
  }

  console.log(
    JSON.stringify({
      event: "onboarding_welcome_email_sent",
      slug: input.workspaceSlug,
      message_id: result.messageId,
      tier,
    }),
  );
}
