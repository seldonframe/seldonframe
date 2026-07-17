// The per-competitor "triangle" cross-link block — indexation consolidation
// Part 1c (docs/strategy/seo/2026-07-17-indexation-consolidation-plan.md).
// Three surfaces exist per competitor: /alternative-to-<slug>, /<slug>-pricing,
// and /compare/seldonframe-vs-<slug>. All three already render from ONE shared
// template each (alternative-page.tsx, pricing-page.tsx, seldonframe-vs-page.tsx
// — no per-competitor page files to edit), so this single component, told which
// surface it's rendering on, links to whichever OTHER surfaces exist for that
// competitor. `pricing` is the only optional leg: /<slug>-pricing only exists
// for competitors present in BOTH lib/seo/alternative-pages.ts (COMPETITORS,
// 26 slugs) AND lib/seo/competitor-pricing.ts (PRICING, 25 slugs) — every
// PRICING slug has a matching COMPETITOR, but "claude-projects" has no pricing
// page (an alternative-to-only comparison, no vendor pricing page to break down).

import type { ReactElement } from "react";
import Link from "next/link";
import { MKT } from "@/components/marketplace/marketplace-data";
import { getCompetitor } from "@/lib/seo/alternative-pages";
import { PRICING } from "@/lib/seo/competitor-pricing";

export type CompetitorSurface = "alternative" | "pricing" | "compare";

const PILL_STYLE = {
  fontSize: 13.5,
  fontWeight: 600,
  color: "rgba(34,29,23,0.7)",
  border: `1px solid ${MKT.ink10}`,
  borderRadius: 999,
  padding: "7px 14px",
  textDecoration: "none",
  background: "rgba(255,255,255,0.5)",
} as const;

/** Whether `/<slug>-pricing` exists (i.e. the slug is in the PRICING registry). */
export function hasCompetitorPricing(slug: string): boolean {
  return PRICING.some((p) => p.slug === slug);
}

/**
 * Renders a link to each of the OTHER two triangle surfaces for `slug` (never
 * back to `current`), skipping `pricing` when the competitor has no pricing
 * page. Returns null when there's nothing else to link (shouldn't happen in
 * practice — every competitor has at least 2 of the 3 surfaces).
 */
export function CompetitorCrossLinks({
  slug,
  current,
}: {
  slug: string;
  current: CompetitorSurface;
}): ReactElement | null {
  const c = getCompetitor(slug);
  const candidates: { surface: CompetitorSurface; href: string; label: string }[] = [
    { surface: "alternative", href: `/alternative-to-${slug}`, label: `${c.name} switching guide` },
    { surface: "pricing", href: `/${slug}-pricing`, label: `${c.name} pricing breakdown` },
    { surface: "compare", href: `/compare/seldonframe-vs-${slug}`, label: `SeldonFrame vs ${c.name}` },
  ];
  const targets = candidates.filter(
    (t) => t.surface !== current && (t.surface !== "pricing" || hasCompetitorPricing(slug)),
  );
  if (targets.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {targets.map((t) => (
        <Link key={t.surface} href={t.href} className="sf-link" style={PILL_STYLE}>
          {`${t.label} →`}
        </Link>
      ))}
    </div>
  );
}
