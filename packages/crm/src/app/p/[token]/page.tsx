// packages/crm/src/app/p/[token]/page.tsx
// 2026-05-19 — Proposal Builder. Public route. Renders the proposal
// page + logs a 'viewed' event (dedup'd by IP/24h). Spec: §"Public proposal page".

import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { and, eq, gte, sql } from "drizzle-orm";
import sanitizeHtml from "sanitize-html";
import { db } from "@/db";
import {
  organizations,
  proposalEvents,
  proposals,
  users,
} from "@/db/schema";
import { loadProposalByToken } from "@/lib/proposals/load-by-token";
import { BookingIframe } from "@/components/proposals/booking-iframe";
import { ScreenshotGrid } from "@/components/proposals/screenshot-grid";
import { AcceptButton } from "./accept-button";

export const dynamic = "force-dynamic";

async function logViewedOnce(proposalId: string, ipAddress: string, userAgent: string) {
  // Dedup: don't log a viewed event if the same IP viewed in the last 24h.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [existing] = await db
    .select({ id: proposalEvents.id })
    .from(proposalEvents)
    .where(
      and(
        eq(proposalEvents.proposalId, proposalId),
        eq(proposalEvents.eventType, "viewed"),
        eq(proposalEvents.ipAddress, ipAddress),
        gte(proposalEvents.createdAt, since),
      ),
    )
    .limit(1);

  if (existing) return;

  await db.insert(proposalEvents).values({
    proposalId,
    eventType: "viewed",
    ipAddress,
    userAgent,
  });
  await db
    .update(proposals)
    .set({
      status: sql`CASE WHEN status = 'sent' THEN 'viewed' ELSE status END`,
      firstViewedAt: sql`COALESCE(first_viewed_at, NOW())`,
      updatedAt: new Date(),
    })
    .where(eq(proposals.id, proposalId));
}

export default async function ProposalPublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const proposal = await loadProposalByToken(token);
  if (!proposal) notFound();
  if (proposal.status === "expired") notFound();
  if (new Date(proposal.expiresAt).getTime() < Date.now()) notFound();

  const reqHeaders = await headers();
  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ua = reqHeaders.get("user-agent") ?? "unknown";
  await logViewedOnce(proposal.id, ip, ua);

  const [agency] = await db
    .select()
    .from(users)
    .where(eq(users.id, proposal.createdByUserId ?? ""))
    .limit(1);

  const [workspace] = proposal.previewWorkspaceId
    ? await db
        .select({ slug: organizations.slug })
        .from(organizations)
        .where(eq(organizations.id, proposal.previewWorkspaceId))
        .limit(1)
    : [null];

  const baseDomain =
    process.env.WORKSPACE_BASE_DOMAIN?.trim() || "seldonframe.app";
  const brandColor = agency?.agencyProfile.brand_color ?? "#0ea5e9";

  // Sanitize the LLM-generated HTML before rendering on this public surface.
  // New dep: sanitize-html (added 2026-05-20). The operator-only /proposals/[id]
  // editor deliberately skips sanitization (auth-gated, low risk).
  const safeHtml = sanitizeHtml(proposal.generatedHtml, {
    allowedTags: [
      "section", "div", "p", "h1", "h2", "h3", "h4", "ul", "ol", "li",
      "strong", "em", "br", "span", "a",
    ],
    allowedAttributes: {
      a: ["href", "rel", "target"],
      span: ["style"],
      h1: ["style"],
      div: ["style"],
    },
    allowedStyles: {
      "*": {
        "color": [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/, /^rgba\(/],
        "background-color": [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/, /^rgba\(/],
        "text-align": [/^(left|right|center|justify)$/],
      },
    },
    allowedSchemes: ["https"],
  });

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-12 space-y-10">
        <header className="space-y-2">
          {agency?.agencyProfile.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={agency.agencyProfile.logo_url}
              alt={agency.agencyProfile.name ?? ""}
              className="h-10 mb-4"
            />
          )}
          <h1
            className="text-4xl font-semibold tracking-tight"
            style={{ color: brandColor }}
          >
            {proposal.prospectName}
          </h1>
        </header>

        <div
          className="prose max-w-none"
          dangerouslySetInnerHTML={{ __html: safeHtml }}
        />

        {workspace && (
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Your live booking page</h2>
            <BookingIframe workspaceSlug={workspace.slug} baseDomain={baseDomain} />
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">What&apos;s included</h2>
          <ScreenshotGrid />
        </section>

        <section
          className="rounded-2xl border-2 p-8 text-center space-y-4"
          style={{ borderColor: brandColor }}
        >
          <p className="text-sm text-muted-foreground">Investment</p>
          <p className="text-5xl font-semibold" style={{ color: brandColor }}>
            ${(proposal.monthlyPriceCents / 100).toLocaleString("en-US")}
            <span className="text-lg text-muted-foreground"> / month</span>
          </p>
          <AcceptButton token={proposal.signedToken} brandColor={brandColor} />
          <p className="text-xs text-muted-foreground">
            Month-to-month. Cancel anytime. Payments handled by Stripe.
          </p>
        </section>
      </div>
    </main>
  );
}
