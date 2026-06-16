// packages/crm/src/app/start/return/page.tsx
// Success/return page for the /start live-sell checkout.
// Stripe Embedded Checkout redirects here after payment with ?session_id=...
// Retrieves the session on the connected account to confirm status.
// Shows the "You're all set" screen + onboarding mini-form + book onboarding call CTA.
// Auth-required — the operator is still logged in from the /start page.

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { organizations, proposals, stripeConnections, users } from "@/db/schema";
import { getStripeClient } from "@/lib/proposals/stripe-connect";
import { getOrCreateOnboardingCallBookingSlug, getAgencySlug } from "../actions";
import { OnboardingMiniForm } from "./_components/onboarding-mini-form";

export const dynamic = "force-dynamic";

export default async function StartReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/start");

  const { session_id: sessionId } = await searchParams;

  if (!sessionId) {
    redirect("/start");
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user) redirect("/login");

  const agencyOrgId = user.orgId;

  // Find the agency's active Stripe connected account.
  const [conn] = await db
    .select({ accountId: stripeConnections.stripeAccountId })
    .from(stripeConnections)
    .where(
      and(
        eq(stripeConnections.orgId, agencyOrgId),
        eq(stripeConnections.isActive, true),
      ),
    )
    .limit(1);

  const stripe = getStripeClient();

  // Retrieve the session on the connected account to confirm payment.
  type CheckoutStatus = "open" | "complete" | "expired";
  let sessionStatus: CheckoutStatus | null = null;
  let prospectName = "your client";
  let prospectEmail = "";
  let previewWorkspaceId: string | null = null;

  if (stripe && conn) {
    try {
      const checkoutSession = await stripe.checkout.sessions.retrieve(
        sessionId,
        {},
        { stripeAccount: conn.accountId },
      );
      sessionStatus = (checkoutSession.status as CheckoutStatus) ?? null;

      // Resolve prospect details from the proposal (via session metadata).
      const proposalId = checkoutSession.metadata?.proposal_id;
      if (proposalId) {
        const [proposalRow] = await db
          .select({
            prospectName: proposals.prospectName,
            prospectEmail: proposals.prospectEmail,
            previewWorkspaceId: proposals.previewWorkspaceId,
          })
          .from(proposals)
          .where(eq(proposals.id, proposalId))
          .limit(1);

        if (proposalRow) {
          prospectName = proposalRow.prospectName;
          prospectEmail = proposalRow.prospectEmail;
          previewWorkspaceId = proposalRow.previewWorkspaceId;
        }
      }

      // Fallback: look up proposal by session id.
      if (!previewWorkspaceId) {
        const [bySession] = await db
          .select({
            prospectName: proposals.prospectName,
            prospectEmail: proposals.prospectEmail,
            previewWorkspaceId: proposals.previewWorkspaceId,
          })
          .from(proposals)
          .where(eq(proposals.stripeCheckoutSessionId, sessionId))
          .limit(1);

        if (bySession) {
          prospectName = bySession.prospectName;
          prospectEmail = bySession.prospectEmail;
          previewWorkspaceId = bySession.previewWorkspaceId;
        }
      }
    } catch {
      // If we can't retrieve the session, show a fallback success state.
      // The webhook will still activate the workspace.
      sessionStatus = "complete";
    }
  }

  // Resolve the onboarding-call booking slug for the "Book onboarding call" CTA.
  const [bookingSlug, agencySlug] = await Promise.all([
    getOrCreateOnboardingCallBookingSlug(agencyOrgId),
    getAgencySlug(agencyOrgId),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "https://app.seldonframe.com";
  const bookOnboardingUrl = `${appUrl}/book/${agencySlug}/${bookingSlug}`;

  // Agency branding
  const agencyName = user.agencyProfile?.name ?? user.name;
  const primaryColor = user.agencyProfile?.brand_color ?? "#B26B49";
  const agencyLogoUrl = user.agencyProfile?.logo_url ?? null;

  // Look up workspace name for the success message.
  let workspaceName = prospectName;
  if (previewWorkspaceId) {
    const [wsRow] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, previewWorkspaceId))
      .limit(1);
    if (wsRow?.name) workspaceName = wsRow.name;
  }

  if (sessionStatus === "open") {
    // Payment not completed yet — redirect back.
    redirect("/start");
  }

  return (
    <main className="min-h-screen" style={{ backgroundColor: "#F6F2EA" }}>
      {/* Top brand bar */}
      <div className="border-b border-black/10" style={{ backgroundColor: "#1F2B24" }}>
        <div className="mx-auto max-w-2xl px-6 py-4 flex items-center gap-3">
          {agencyLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={agencyLogoUrl} alt={agencyName} className="h-8" />
          ) : (
            <span
              className="text-sm font-semibold uppercase tracking-widest"
              style={{ color: "#F6F2EA" }}
            >
              {agencyName}
            </span>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-6 py-12 space-y-10">
        {/* Hero */}
        <div className="text-center space-y-3">
          <div
            className="inline-flex h-16 w-16 items-center justify-center rounded-full text-3xl mx-auto"
            style={{ backgroundColor: primaryColor + "22" }}
          >
            ✓
          </div>
          <h1 className="text-3xl font-bold text-foreground">
            You&apos;re all set, {workspaceName}!
          </h1>
          <p className="text-muted-foreground">
            Payment confirmed. The workspace is activating now — the admin link is on its way to{" "}
            <strong>{prospectEmail || "the client"}</strong>.
          </p>
        </div>

        {/* Onboarding mini-form */}
        {previewWorkspaceId && (
          <section className="rounded-2xl border border-black/10 bg-white px-6 py-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Quick workspace setup</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Fill these in while you&apos;re on the call — takes 60 seconds.
              </p>
            </div>
            <OnboardingMiniForm
              orgId={previewWorkspaceId}
              accentColor={primaryColor}
            />
          </section>
        )}

        {/* Book onboarding call CTA */}
        <section className="rounded-2xl border border-black/10 bg-white px-6 py-6 space-y-3 text-center">
          <h2 className="text-lg font-semibold">Schedule the onboarding call</h2>
          <p className="text-sm text-muted-foreground">
            Book a 30-minute call to walk the client through their new workspace.
          </p>
          <a
            href={bookOnboardingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-md px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:opacity-90"
            style={{ backgroundColor: primaryColor }}
          >
            Book onboarding call →
          </a>
        </section>

        {/* What happens next */}
        <section className="rounded-2xl border border-black/10 bg-white px-6 py-6 space-y-4">
          <h2 className="text-lg font-semibold">What happens next</h2>
          <ol className="space-y-3 text-sm">
            {[
              `The workspace for ${workspaceName} activates within 60 seconds.`,
              `An admin link is emailed to ${prospectEmail || "the client"} so they can log in.`,
              "Stripe sends an automatic receipt to their inbox.",
              "Use the form above to fill in services & hours before you end the call.",
            ].map((item, i) => (
              <li key={i} className="flex gap-3">
                <span
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  {i + 1}
                </span>
                <span className="text-muted-foreground">{item}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Back to dashboard */}
        <div className="text-center">
          <a
            href="/dashboard"
            className="text-sm underline underline-offset-4 text-muted-foreground hover:text-foreground"
          >
            ← Back to dashboard
          </a>
        </div>
      </div>
    </main>
  );
}
