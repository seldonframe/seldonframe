// ICP-3 / Phase 3 (seller side) — the Studio REVENUE dashboard (route stays
// /studio/earnings; the visible label + heading are "Revenue").
//
// Leads with the recurring revenue the builder's deployed agents generate:
// 30-day MRR (Σ active deployments' monthly priceCents) + ARR (MRR × 12). Below
// that, the existing marketplace breakdown stays: their published + draft
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
import { computeRevenueSummary } from "@/lib/deployments/revenue";
import { listDeployments } from "@/lib/deployments/store";
import { formatCentsUsd } from "@/lib/utils/formatters";
import { StudioTabs } from "../studio-tabs";

export const dynamic = "force-dynamic";

type RentalAgg = { count: number; revenueCents: number; feeCents: number };

/** Per-listing rental aggregates for this seller: agent_rental_call events are
 *  logged with orgId = the creator (seller) org + properties.listing_id, and
 *  (x402) properties.amount_cents / fee_cents for SETTLED paid calls. Group +
 *  sum: count = all rental calls (usage signal); revenue/fee = the settled
 *  metered dollars (amount_cents 0 on free-lane calls contributes nothing). */
async function rentalsByListing(orgId: string): Promise<Map<string, RentalAgg>> {
  const rows = await db
    .select({
      listingId: sql<string>`${seldonframeEvents.properties} ->> 'listing_id'`,
      n: sql<number>`count(*)::int`,
      revenueCents: sql<number>`coalesce(sum((${seldonframeEvents.properties} ->> 'amount_cents')::int), 0)::int`,
      feeCents: sql<number>`coalesce(sum((${seldonframeEvents.properties} ->> 'fee_cents')::int), 0)::int`,
    })
    .from(seldonframeEvents)
    .where(
      and(
        eq(seldonframeEvents.event, "agent_rental_call"),
        eq(seldonframeEvents.orgId, orgId),
      ),
    )
    .groupBy(sql`${seldonframeEvents.properties} ->> 'listing_id'`);

  const map = new Map<string, RentalAgg>();
  for (const row of rows) {
    if (row.listingId) {
      map.set(row.listingId, {
        count: Number(row.n) || 0,
        revenueCents: Number(row.revenueCents) || 0,
        feeCents: Number(row.feeCents) || 0,
      });
    }
  }
  return map;
}

export default async function StudioEarningsPage() {
  const orgId = await getOrgId();
  if (!orgId) {
    return (
      <section className="animate-page-enter space-y-4">
        <StudioTabs />
        <h1 className="text-page-title">Revenue</h1>
        <p className="text-sm text-muted-foreground">Sign in to see your revenue.</p>
      </section>
    );
  }

  // The seller's agent listings + their lifetime rentals + their deployments
  // (the recurring-revenue source for the MRR/ARR hero). All in parallel.
  const [listings, rentals, deployments] = await Promise.all([
    db
      .select({
        id: marketplaceListings.id,
        slug: marketplaceListings.slug,
        name: marketplaceListings.name,
        price: marketplaceListings.price,
        priceModel: marketplaceListings.priceModel,
        monthlyPriceCents: marketplaceListings.monthlyPriceCents,
        perCallPriceCents: marketplaceListings.perCallPriceCents,
        perOutcomePriceCents: marketplaceListings.perOutcomePriceCents,
        outcomeType: marketplaceListings.outcomeType,
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
    listDeployments(orgId),
  ]);

  // The money shot: recurring revenue from ACTIVE deployments. Pure fold over the
  // deployment list (only status:'active' priceCents count); ARR = MRR × 12.
  const revenue = computeRevenueSummary(deployments);

  const { listings: rows, summary } = computeListingEarnings(
    listings.map((l) => {
      const rental = rentals.get(l.id);
      return {
      id: l.id,
      slug: l.slug,
      name: l.name,
      priceCents: l.price ?? 0,
      installCount: l.installCount ?? 0,
      rentalCount: rental?.count ?? 0,
      rentalRevenueCents: rental?.revenueCents ?? 0,
      rentalFeeCents: rental?.feeCents ?? 0,
      isPublished: l.isPublished === true,
      // Pricing MODEL (display only) — the strings are validated by the guards
      // inside computeListingEarnings, which fall back to onetime for bad rows.
      priceModel: (l.priceModel ?? undefined) as never,
      monthlyPriceCents: l.monthlyPriceCents,
      perCallPriceCents: l.perCallPriceCents,
      perOutcomePriceCents: l.perOutcomePriceCents,
      outcomeType: (l.outcomeType ?? undefined) as never,
      };
    }),
  );

  return (
    <section className="animate-page-enter space-y-6">
      <StudioTabs />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-page-title">Revenue</h1>
          <p className="text-label text-muted-foreground">
            How much, from where, and what your agents earn — the recurring
            revenue your deployments generate, plus marketplace income.
          </p>
        </div>
        <Link href="/studio/agents" className="crm-button-secondary h-9 px-4 text-sm">
          Manage agents
        </Link>
      </div>

      {/* ── Hero: recurring revenue (MRR / ARR) from active deployments — the
          headline statement, calm. MRR leads as the big mono figure; ARR sits
          beside it as the annual run-rate. ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1.15fr_1fr]">
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-(--shadow-xs)">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              MRR · monthly recurring
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              {revenue.activeCount === 1
                ? "1 active client"
                : `${revenue.activeCount.toLocaleString("en-US")} active clients`}
            </span>
          </div>
          <div className="mt-5">
            <div className="font-mono text-5xl font-semibold leading-none tracking-tight text-foreground">
              {formatCentsUsd(revenue.mrrCents)}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Your recurring take-home from active deployments.
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-(--shadow-xs)">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            ARR · annual run-rate
          </span>
          <div className="mt-5 font-mono text-4xl font-semibold leading-none tracking-tight text-foreground">
            {formatCentsUsd(revenue.arrCents)}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">MRR × 12</p>
        </div>
      </div>

      {/* ── Marketplace summary: the money shot. The ONLY place the fee is shown.
          Rendered as a calm "where your gross goes" statement card. ── */}
      <div className="space-y-3">
        <h2 className="text-card-title text-foreground">
          Marketplace ·{" "}
          <span className="text-muted-foreground">
            you keep 95% (SeldonFrame takes a {summary.feePercent}% fee on sales)
          </span>
        </h2>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-(--shadow-xs)">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Stat label="Gross sales" value={formatCentsUsd(summary.grossCents)} />
            <Stat
              label={`SeldonFrame fee (${summary.feePercent}%)`}
              value={`− ${formatCentsUsd(summary.feeCents)}`}
              muted
            />
            <Stat label="You keep (95%)" value={formatCentsUsd(summary.netCents)} emphasis />
          </div>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-4 text-xs text-muted-foreground">
            <span>
              {summary.publishedCount} live ·{" "}
              {summary.listingCount - summary.publishedCount} draft
            </span>
            <span>{summary.installCount.toLocaleString("en-US")} total installs</span>
            <span>{summary.rentalCount.toLocaleString("en-US")} total rental calls</span>
            {summary.rentalRevenueCents > 0 && (
              <span>{formatCentsUsd(summary.rentalRevenueCents)} from rentals</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Per-listing breakdown: revenue by agent, calm. ── */}
      {rows.length === 0 ? (
        <article className="rounded-2xl border border-border bg-card p-8 text-center shadow-(--shadow-xs)">
          <div className="mx-auto max-w-md space-y-3">
            <span
              className="mx-auto inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"
              aria-hidden
            >
              <Store className="size-5" />
            </span>
            <h2 className="text-base font-semibold text-foreground">No listings yet.</h2>
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
        <div className="space-y-3">
          <h2 className="text-card-title text-foreground">Revenue by agent</h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-(--shadow-xs)">
            {/* header row (desktop) */}
            <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 border-b border-border bg-muted/30 px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
              <span>Agent</span>
              <span className="text-right">Installs</span>
              <span className="text-right">Rentals</span>
              <span className="text-right">Gross</span>
              <span className="text-right">You keep</span>
            </div>
            <ul className="divide-y divide-border">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="grid grid-cols-1 gap-2 px-5 py-4 transition-colors hover:bg-muted/30 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr] sm:items-center sm:gap-3"
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
                    <p className="text-xs text-muted-foreground">{row.priceLabel}</p>
                  </div>
                  <Cell label="Installs" value={row.installCount.toLocaleString("en-US")} />
                  <Cell label="Rentals" value={row.rentalCount.toLocaleString("en-US")} />
                  <Cell label="Gross" value={formatCentsUsd(row.grossCents)} />
                  <Cell label="You keep" value={formatCentsUsd(row.netCents)} emphasis />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

/** A figure in the marketplace statement card: a small label over a mono number.
 *  `emphasis` is the green "you keep" take-home; `muted` is the deducted fee. */
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
            ? "mt-1 font-mono text-2xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400"
            : muted
              ? "mt-1 font-mono text-2xl font-semibold tracking-tight text-muted-foreground"
              : "mt-1 font-mono text-2xl font-semibold tracking-tight text-foreground"
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
            ? "font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400"
            : "font-mono text-sm text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}
