// packages/crm/src/app/p/[token]/success/page.tsx
// 2026-05-21 — Phase H: agency-branded post-acceptance confirmation.
// The prospect sees the AGENCY as their counterparty — no Seldon Frame chrome.
// Server component. Loads proposal → workspace → agency user in three queries.

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { loadProposalByToken } from "@/lib/proposals/load-by-token";

export const dynamic = "force-dynamic";

export default async function ProposalSuccessPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const proposal = await loadProposalByToken(token);
  if (!proposal) notFound();

  const [agency] = proposal.createdByUserId
    ? await db
        .select()
        .from(users)
        .where(eq(users.id, proposal.createdByUserId))
        .limit(1)
    : [null];

  const [workspace] = proposal.previewWorkspaceId
    ? await db
        .select({ slug: organizations.slug, name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, proposal.previewWorkspaceId))
        .limit(1)
    : [null];

  const baseDomain = process.env.WORKSPACE_BASE_DOMAIN ?? "seldonframe.app";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.seldonframe.com";

  const agencyName =
    agency?.agencyProfile?.name ?? agency?.name ?? "Your agency";
  const agencyEmail = agency?.email ?? null;
  const agencyLogoUrl = agency?.agencyProfile?.logo_url ?? null;
  const brandColor = agency?.agencyProfile?.brand_color ?? "#0ea5e9";

  const bookingUrl = workspace
    ? `https://${workspace.slug}.${baseDomain}/book`
    : null;

  const greetingName =
    proposal.prospectFirstName?.trim() || proposal.prospectName;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-16 space-y-10">
        {/* Agency logo header */}
        <header className="flex flex-col items-center gap-3 text-center">
          {agencyLogoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={agencyLogoUrl} alt={agencyName} className="h-12" />
          )}
          <p
            className="text-xs uppercase tracking-widest font-medium"
            style={{ color: brandColor }}
          >
            {agencyName}
          </p>
        </header>

        {/* Headline */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight">
            Welcome aboard, {greetingName}.
          </h1>
          <p className="text-lg text-muted-foreground">
            Your workspace for {proposal.prospectName} is going live now.
          </p>
        </div>

        {/* Deliverables grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {bookingUrl && (
            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-2xl border bg-card p-5 hover:shadow-lg transition-shadow space-y-1"
            >
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Booking page
              </p>
              <p
                className="font-semibold truncate"
                style={{ color: brandColor }}
              >
                {bookingUrl.replace(/^https?:\/\//, "")}
              </p>
              <p className="text-xs text-muted-foreground">
                Share this with your customers
              </p>
            </a>
          )}

          <a
            href={`${appUrl}/login`}
            className="rounded-2xl border bg-card p-5 hover:shadow-lg transition-shadow space-y-1"
          >
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Admin login
            </p>
            <p
              className="font-semibold truncate"
              style={{ color: brandColor }}
            >
              {appUrl.replace(/^https?:\/\//, "")}/login
            </p>
            <p className="text-xs text-muted-foreground">
              Sign in with {proposal.prospectEmail}
            </p>
          </a>

          <div className="rounded-2xl border bg-card p-5 space-y-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Receipt
            </p>
            <p className="font-semibold">Sent by Stripe</p>
            <p className="text-xs text-muted-foreground">
              Check {proposal.prospectEmail}
            </p>
          </div>

          {agencyEmail && (
            <a
              href={`mailto:${agencyEmail}?subject=${encodeURIComponent(
                "Questions about my new workspace"
              )}`}
              className="rounded-2xl border bg-card p-5 hover:shadow-lg transition-shadow space-y-1"
            >
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Talk to {agencyName.split(" ")[0]}
              </p>
              <p
                className="font-semibold truncate"
                style={{ color: brandColor }}
              >
                {agencyEmail}
              </p>
              <p className="text-xs text-muted-foreground">
                Reply anytime with questions
              </p>
            </a>
          )}
        </section>

        {/* What happens next */}
        <section className="rounded-2xl border bg-card/40 p-6 space-y-4">
          <h2 className="text-lg font-semibold">What happens next</h2>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span
                className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold text-white shrink-0"
                style={{ backgroundColor: brandColor }}
              >
                1
              </span>
              <span>
                {agencyName} just emailed you an admin link to{" "}
                {proposal.prospectEmail}. Arrives within a minute.
              </span>
            </li>
            <li className="flex gap-3">
              <span
                className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold text-white shrink-0"
                style={{ backgroundColor: brandColor }}
              >
                2
              </span>
              <span>Stripe receipt for your setup is in your inbox.</span>
            </li>
            <li className="flex gap-3">
              <span
                className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold text-white shrink-0"
                style={{ backgroundColor: brandColor }}
              >
                3
              </span>
              <span>
                {agencyName} will check in tomorrow morning to make sure
                everything&apos;s running smooth.
              </span>
            </li>
          </ol>
        </section>

        {/* Footer */}
        {agencyEmail && (
          <p className="text-center text-sm text-muted-foreground">
            Questions? Just reply to{" "}
            <a
              href={`mailto:${agencyEmail}`}
              className="underline"
              style={{ color: brandColor }}
            >
              {agencyEmail}
            </a>
          </p>
        )}
      </div>
    </main>
  );
}
