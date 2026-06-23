// ICP-3 / Phase 3 (seller side) — the Studio EARNINGS dashboard.
//
// The builder's marketplace income at a glance: their published + draft
// kind:'agent' listings, each with installs, rentals, and revenue, plus a
// summary that discloses the platform fee.
//
// THIS IS THE ONLY SURFACE IN THE WHOLE APP THAT SHOWS THE 2% MARKETPLACE FEE
// TO A USER. The buyer storefront, the publish panel, and every other screen
// stay fee-free; the fee is disclosed exactly where the money is shown, framed
// as "you keep 98%". The fee math reuses the SAME GMV primitive as checkout
// (computeListingEarnings → computeInvoiceApplicationFeeCents) so the number is
// exactly what Stripe withholds.

import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { ExternalLink, Store } from "lucide-react";
import { db } from "@/db";
import { marketplaceListings } from "@/db/schema/marketplace";
import { seldonframeEvents } from "@/db/schema/seldonframe-events";
import { getOrgId } from "@/lib/auth/helpers";
import { computeListingEarnings } from "@/lib/marketplace/earnings";
import { formatCentsUsd } from "@/lib/utils/formatters";
import { StudioTabs } from "../studio-tabs";

export const dynamic = "force-dynamic";

/** Rental count per listing for this seller: agent_rental_call events are
 *  logged with orgId = the creator (seller) org and properties.listing_id
 *  identifying the listing (api/v1/agents/[slug]/mcp). Group + count. */
async function rentalsByListing(orgId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({
      listingId: sql<string>`${seldonframeEvents.properties} ->> 'listing_id'`,
      n: sql<number>`count(*)::int`,
    })
    .from(seldonframeEvents)
    .where(
      and(
        eq(seldonframeEvents.event, "agent_rental_call"),
        eq(seldonframeEvents.orgId, orgId),
      ),
    )
    .groupBy(sql`${seldonframeEvents.properties} ->> 'listing_id'`);

  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.listingId) map.set(row.listingId, Number(row.n) || 0);
  }
  return map;
}

export default async function StudioEarningsPage() {
  const orgId = await getOrgId();
  if (!orgId) {
    return (
      <section className="animate-page-enter space-y-4">
        <h1 className="text-page-title">Earnings</h1>
        <p className="text-sm text-muted-foreground">Sign in to see your marketplace earnings.</p>
      </section>
    );
  }

  // The seller's agent listings + their lifetime rentals.
  const [listings, rentals] = await Promise.all([
    db
      .select({
        id: marketplaceListings.id,
        slug: marketplaceListings.slug,
        name: marketplaceListings.name,
        price: marketplaceListings.price,
        installCount: marketplaceListings.installCount,
        isPublished: marketplaceListings.isPublished,
      })
      .from(marketplaceListings)
      .where(
        and(
          eq(marketplaceListings.creatorOrgId, orgId),
          eq(marketplaceListings.kind, "agent"),
        ),
      ),
    rentalsByListing(orgId),
  ]);

  const { listings: rows, summary } = computeListingEarnings(
    listings.map((l) => ({
      id: l.id,
      slug: l.slug,
      name: l.name,
      priceCents: l.price ?? 0,
      installCount: l.installCount ?? 0,
      rentalCount: rentals.get(l.id) ?? 0,
      isPublished: l.isPublished === true,
    })),
  );

  return (
    <section className="animate-page-enter space-y-5">
      <StudioTabs />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-page-title">Earnings</h1>
          <p className="text-label text-[hsl(var(--color-text-secondary))]">
            What your agents earn on the marketplace. You keep 95% — SeldonFrame
            takes a {summary.feePercent}% fee on sales.
          </p>
        </div>
        <Link href="/studio/agents" className="crm-button-secondary h-9 px-4 text-sm">
          Manage agents
        </Link>
      </div>

      {/* ── Summary: the money shot. The ONLY place the fee is shown. ── */}
      <div className="rounded-xl border bg-card p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="Gross sales" value={formatCentsUsd(summary.grossCents)} />
          <Stat
            label={`SeldonFrame fee (${summary.feePercent}%)`}
            value={`− ${formatCentsUsd(summary.feeCents)}`}
            muted
          />
          <Stat label="You keep (95%)" value={formatCentsUsd(summary.netCents)} emphasis />
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
          <span>
            {summary.publishedCount} live ·{" "}
            {summary.listingCount - summary.publishedCount} draft
          </span>
          <span>{summary.installCount.toLocaleString("en-US")} total installs</span>
          <span>{summary.rentalCount.toLocaleString("en-US")} total rental calls</span>
        </div>
      </div>

      {/* ── Per-listing breakdown ── */}
      {rows.length === 0 ? (
        <article className="rounded-xl border bg-card p-6 text-center">
          <div className="mx-auto max-w-md space-y-3">
            <span
              className="mx-auto inline-flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              aria-hidden
            >
              <Store className="size-5" />
            </span>
            <h2 className="text-base font-semibold">No listings yet.</h2>
            <p className="text-sm text-muted-foreground">
              Open an agent and use <strong>List on the marketplace</strong> to
              publish it. Once builders install it, your earnings show up here.
            </p>
            <div className="flex justify-center pt-1">
              <Link href="/studio/agents" className="crm-button-primary h-9 px-4 text-sm">
                Go to your agents
              </Link>
            </div>
          </div>
        </article>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          {/* header row (desktop) */}
          <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 border-b px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Agent</span>
            <span className="text-right">Installs</span>
            <span className="text-right">Rentals</span>
            <span className="text-right">Gross</span>
            <span className="text-right">You keep</span>
          </div>
          <ul className="divide-y">
            {rows.map((row) => (
              <li
                key={row.id}
                className="grid grid-cols-1 gap-2 px-5 py-4 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr] sm:items-center sm:gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{row.name}</span>
                    {row.isPublished ? (
                      <Link
                        href={`/marketplace/${row.slug}`}
                        target="_blank"
                        className="inline-flex items-center gap-0.5 text-[11px] text-emerald-700 hover:underline dark:text-emerald-400"
                      >
                        live <ExternalLink className="size-3" />
                      </Link>
                    ) : (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        draft
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {row.priceCents > 0 ? `${formatCentsUsd(row.priceCents)} / install` : "Free"}
                  </p>
                </div>
                <Cell label="Installs" value={row.installCount.toLocaleString("en-US")} />
                <Cell label="Rentals" value={row.rentalCount.toLocaleString("en-US")} />
                <Cell label="Gross" value={formatCentsUsd(row.grossCents)} />
                <Cell label="You keep" value={formatCentsUsd(row.netCents)} emphasis />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  muted,
  emphasis,
}: {
  label: string;
  value: string;
  muted?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          emphasis
            ? "mt-1 text-2xl font-semibold tracking-tight text-emerald-700 dark:text-emerald-400"
            : muted
              ? "mt-1 text-2xl font-semibold tracking-tight text-muted-foreground"
              : "mt-1 text-2xl font-semibold tracking-tight text-foreground"
        }
      >
        {value}
      </p>
    </div>
  );
}

/** A responsive cell: shows its label inline on mobile (stacked), hides it on
 *  desktop where the column header carries it. */
function Cell({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between sm:block sm:text-right">
      <span className="text-xs text-muted-foreground sm:hidden">{label}</span>
      <span
        className={
          emphasis
            ? "text-sm font-semibold text-emerald-700 dark:text-emerald-400"
            : "text-sm text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}
