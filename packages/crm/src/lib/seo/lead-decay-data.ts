// The Lead Decay Curve — sourced data + pure math for
// /charts/missed-revenue-decay. never-lies applies hard here: every plotted
// point carries a `source` back to a real, checkable citation. Where the
// literature only gives discrete comparisons (not a continuous curve), we
// plot discrete points and mark the connecting segment `interpolated: true`
// so the renderer can draw it as a dashed "we don't have data here" segment
// instead of faking a smooth curve through a gap.
//
// Reused/aligned sources (do not invent new ones — these are the same
// citations already used by the guides this chart is the visual companion
// to; see lib/seo/guides/what-is-speed-to-lead.ts,
// lib/seo/guides/average-lead-response-time-by-industry.ts, and
// lib/seo/guides/the-5-minute-rule-for-lead-response.ts):
//   1. Harvard Business Review — "The Short Life of Online Sales Leads"
//      (Oldroyd, McElheran, Elkington, 2011) — https://hbr.org/2011/03/the-short-life-of-online-sales-leads
//      The full text is paywalled; the guides deliberately do NOT cite a
//      specific multiplier from it and neither does this file. It backs the
//      qualitative "odds drop sharply as time passes" claim only.
//   2. The Lead Response Management / InsideSales.com study (with MIT's
//      James Oldroyd — the same researcher as the HBR piece), publicly
//      summarized at https://www.leadresponsemanagement.org/lrm_study —
//      three years of data across six companies / ~15,000 leads / ~100,000
//      call attempts. This is the source of the widely-repeated "21x" and
//      "4x" figures. It is old (data collection predates the ~2011 HBR
//      write-up) and is a single vendor-hosted study, not a peer-reviewed
//      paper — the honesty note below says so explicitly.

export type DecayPoint = {
  /** Minutes since the lead first reached out. */
  minutes: number;
  /** Human label for axis ticks / tooltips. */
  label: string;
  /** Relative odds of successfully contacting + qualifying the lead,
   *  indexed to 100 at "responded immediately" (~5 min). */
  index: number;
  /** Short citation key into SOURCES below. */
  sourceKey: SourceKey;
  /** True if this point is a literature-derived anchor; false-y/absent for
   *  values we interpolated for chart continuity (none currently — kept for
   *  future-proofing / test coverage). */
  interpolated?: boolean;
};

export type SourceKey = "hbr-2011" | "lrm-study";

export const SOURCES: Record<SourceKey, { label: string; url: string; note: string }> = {
  "hbr-2011": {
    label: 'Harvard Business Review — "The Short Life of Online Sales Leads" (Oldroyd, McElheran, Elkington, 2011)',
    url: "https://hbr.org/2011/03/the-short-life-of-online-sales-leads",
    note: "Full text is paywalled; used here only for the qualitative finding that odds of meaningful contact drop sharply as response time grows, not for a specific multiplier.",
  },
  "lrm-study": {
    label: "Lead Response Management study (InsideSales.com data + MIT's James Oldroyd)",
    url: "https://www.leadresponsemanagement.org/lrm_study",
    note: "Vendor-hosted summary of ~15,000 leads / ~100,000 call attempts across 6 companies over 3 years. Not peer-reviewed, and the underlying data collection predates the 2011 HBR write-up by the same researcher — treat the exact multipliers as old and directional, not current fact.",
  },
};

// ─── The plotted points ──────────────────────────────────────────────────
//
// Indexed to 100 at "responded within ~5 minutes." Every number below is a
// direct restatement of a figure quoted in the LRM study summary (see
// SOURCES.lrm-study) — none are invented. Where the study gives a
// "fold decrease" between two named intervals, we anchor BOTH endpoints and
// derive the later one by division so the ratio matches the citation
// exactly (see lead-decay-data.spec assertions).
//
//   - 5 min -> 10 min: "chances of qualification dropped fourfold" => index/4
//   - 5 min -> 30 min: "a staggering 21-fold decrease" => index/21
//
// The study separately states "qualification success fell over sixfold in
// the first hour" — but that figure describes the SAME 0-60min window as a
// coarser, looser claim than the specific 5-vs-30-minute comparison above,
// and taking it at face value would put the 60-minute point ABOVE the
// 30-minute point (100/6 ≈ 16.7 vs 100/21 ≈ 4.8) — a non-monotonic "curve"
// that isn't a real decay curve at all, just two differently-scoped stats.
// Rather than force those into one misleading connected line, we do NOT
// plot a 60-minute point; the "over sixfold within the first hour" fact is
// stated as prose/FAQ copy instead (see the chart component + page FAQ),
// and the chart's only claim past 30 minutes is the honest, unsourced gap
// down to the study's other endpoint, 24 hours.
//
//   - past 20 hours: "additional call attempts negatively impact the
//     chances of successful engagement" — no numeric ratio is given, so the
//     24h point reuses the 30-minute ratio (100/21) as a conservative floor
//     (we'd rather understate the drop past 24h than invent a steeper one),
//     and the connecting segment is marked as an unsourced gap so the chart
//     never implies we measured anything between 30 minutes and 24 hours.

const INDEX_AT_5_MIN = 100;

export const DECAY_POINTS: DecayPoint[] = [
  { minutes: 5, label: "5 min", index: INDEX_AT_5_MIN, sourceKey: "lrm-study" },
  { minutes: 10, label: "10 min", index: round1(INDEX_AT_5_MIN / 4), sourceKey: "lrm-study" },
  { minutes: 30, label: "30 min", index: round1(INDEX_AT_5_MIN / 21), sourceKey: "lrm-study" },
  { minutes: 1440, label: "24 hours", index: round1(INDEX_AT_5_MIN / 21), sourceKey: "lrm-study" },
];

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Adjacent DECAY_POINTS pairs where the literature gives no interior data
 *  (nothing is sourced between 30 min and 24h) — the chart renders these
 *  connectors as a dashed "no data here" segment rather than a solid line
 *  implying a measured curve. */
export const UNSOURCED_GAPS: Array<[fromMinutes: number, toMinutes: number]> = [[30, 1440]];

export function isGapSegment(fromMinutes: number, toMinutes: number): boolean {
  return UNSOURCED_GAPS.some(([a, b]) => a === fromMinutes && b === toMinutes);
}

// ─── Industry response-time markers ────────────────────────────────────
//
// IMPORTANT — honesty note: none of the guides in this repo (including
// lib/seo/guides/average-lead-response-time-by-industry.ts) publish a
// trustworthy numeric per-industry response-time table; that guide's whole
// point is that such tables are unreliable. So these markers are NOT
// presented as "the average response time for X is Y minutes, sourced." They
// are an illustrative, clearly-labeled placement — the same posture the
// existing speed-to-lead-calculator.tsx takes with its response-time
// buckets ("a conservative, illustrative model — NOT a claim about any
// single study's numbers"). The industry names reuse the vertical framing
// already used elsewhere in the SEO surface (lib/seo/verticals.ts).

export type IndustryMarker = {
  slug: string;
  name: string;
  /** Illustrative average response-time placement, in minutes. */
  typicalResponseMinutes: number;
};

export const INDUSTRY_MARKERS: IndustryMarker[] = [
  { slug: "plumbers-hvac", name: "Plumbing / HVAC", typicalResponseMinutes: 45 },
  { slug: "home-services", name: "Home services (roofing, landscaping, electrical)", typicalResponseMinutes: 90 },
  { slug: "med-spa-wellness", name: "Med spa / wellness", typicalResponseMinutes: 120 },
  { slug: "legal-professional", name: "Legal / professional services", typicalResponseMinutes: 240 },
  { slug: "real-estate", name: "Real estate", typicalResponseMinutes: 30 },
  { slug: "auto-services", name: "Auto repair / detailing", typicalResponseMinutes: 60 },
];

/** Piecewise-linear-in-log-time interpolation of the index at an arbitrary
 *  minute mark, for placing an industry marker on the curve. Clamped to the
 *  plotted domain (5–1440 min); never extrapolates past the sourced range. */
export function indexAtMinutes(minutes: number): number {
  const clamped = Math.min(Math.max(minutes, DECAY_POINTS[0].minutes), DECAY_POINTS[DECAY_POINTS.length - 1].minutes);
  for (let i = 0; i < DECAY_POINTS.length - 1; i++) {
    const a = DECAY_POINTS[i];
    const b = DECAY_POINTS[i + 1];
    if (clamped >= a.minutes && clamped <= b.minutes) {
      if (a.minutes === b.minutes) return a.index;
      const logA = Math.log(a.minutes);
      const logB = Math.log(b.minutes);
      const logC = Math.log(clamped);
      const t = (logC - logA) / (logB - logA);
      return round1(a.index + t * (b.index - a.index));
    }
  }
  return DECAY_POINTS[DECAY_POINTS.length - 1].index;
}

// ─── Revenue-at-risk math ───────────────────────────────────────────────
//
// Same hedged-math convention as speed-to-lead-calculator.tsx /
// missed-call-calculator.tsx: a transparent, stated model, not a black box.
//   1. `indexAtMinutes(currentResponseMinutes)` gives the relative
//      contact/qualify odds vs. responding in ~5 minutes (index 100).
//   2. closedAtCurrentSpeed = leadsPerMonth * baseCloseRate * (index/100)
//   3. closedIfFast = leadsPerMonth * baseCloseRate (index 100 by definition)
//   4. revenueAtRisk = (closedIfFast - closedAtCurrentSpeed) * avgJobValue

export type RevenueAtRiskInput = {
  leadsPerMonth: number;
  avgJobValue: number;
  baseCloseRate: number; // 0-1
  currentResponseMinutes: number;
};

export type RevenueAtRiskResult = {
  indexAtCurrentSpeed: number;
  closedIfFast: number;
  closedAtCurrentSpeed: number;
  revenueIfFast: number;
  revenueAtCurrentSpeed: number;
  revenueAtRiskMonthly: number;
  revenueAtRiskYearly: number;
};

export function computeRevenueAtRisk(input: RevenueAtRiskInput): RevenueAtRiskResult {
  const leadsPerMonth = Math.max(0, safeNumber(input.leadsPerMonth));
  const avgJobValue = Math.max(0, safeNumber(input.avgJobValue));
  const baseCloseRate = clamp01(safeNumber(input.baseCloseRate));
  const currentResponseMinutes = Math.max(1, safeNumber(input.currentResponseMinutes));

  const indexAtCurrentSpeed = indexAtMinutes(currentResponseMinutes);
  const closedIfFast = leadsPerMonth * baseCloseRate;
  const closedAtCurrentSpeed = closedIfFast * (indexAtCurrentSpeed / 100);

  const revenueIfFast = Math.round(closedIfFast * avgJobValue);
  const revenueAtCurrentSpeed = Math.round(closedAtCurrentSpeed * avgJobValue);
  const revenueAtRiskMonthly = Math.max(0, revenueIfFast - revenueAtCurrentSpeed);
  const revenueAtRiskYearly = revenueAtRiskMonthly * 12;

  return {
    indexAtCurrentSpeed,
    closedIfFast,
    closedAtCurrentSpeed,
    revenueIfFast,
    revenueAtCurrentSpeed,
    revenueAtRiskMonthly,
    revenueAtRiskYearly,
  };
}

function safeNumber(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
