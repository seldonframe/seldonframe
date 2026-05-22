// Cut C Phase 4 — Marketing pricing section (Free / Growth / Scale).
//
// This is the 3-column MARKETING pricing surface on the public landing
// page. It is intentionally separate from the in-product 6-tier pricing
// component at `components/marketing/landing-pricing-section.tsx` which
// is shown to signed-in users browsing the in-product upgrade modal.
// Don't merge the two — different audiences, different copy contracts.
//
// Source of truth for the FEATURES matrix is spec §Cut B (Phase 1).
// FEATURE_FLAGS shipped by Cut B (lib/billing/feature-flags.ts):
//   - branding_hidden, custom_domain, client_portal  (Growth+)
//   - ai_agents, white_label_portal, priority_support  (Scale only)
// Workspace caps and BYOK are not feature flags — they're tier limits
// resolved at runtime from TIER_FEATURES in lib/billing/features.ts.
//
// Copy: refined by design:ux-copy (Phase 4 Task 4.3, May 2026). The
// audience is an agency owner deciding whether $29 is worth it; we
// surface what they save by upgrading (no branding shown, custom
// domain per client) without sounding pushy. CTAs say "Upgrade to X"
// rather than "Start free trial" because we have not yet committed
// to a trial length — see TRIAL_LENGTH judgment call in the Cut C
// final report.

import Link from "next/link";
import { Check, Minus } from "lucide-react";

type TierKey = "free" | "growth" | "scale";

type Tier = {
  key: TierKey;
  name: string;
  price: string;
  period: string;
  tagline: string;
  ctaLabel: string;
  ctaHref: string;
  highlighted?: boolean;
};

type FeatureRow = {
  label: string;
  values: Readonly<Record<TierKey, string | boolean>>;
};

// Tagline copy: from design:ux-copy output, May 2026. Each tagline is
// one sentence long and answers "what do I get for this price?" in
// the agency owner's own terms.
const TIERS: readonly Tier[] = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    tagline: "1 workspace. Your Anthropic key. The whole product, free forever.",
    ctaLabel: "Start free",
    ctaHref: "/signup",
  },
  {
    key: "growth",
    name: "Growth",
    price: "$29",
    period: "/month",
    tagline: "Run 3 clients without SeldonFrame branding showing anywhere.",
    ctaLabel: "Upgrade to Growth",
    ctaHref: "/signup?plan=growth",
    highlighted: true,
  },
  {
    key: "scale",
    name: "Scale",
    price: "$99",
    period: "/month",
    tagline: "Unlimited clients. Full white-label on every workspace.",
    ctaLabel: "Upgrade to Scale",
    ctaHref: "/signup?plan=scale",
  },
];

// Source of truth: spec §Cut B tier features table. Each row label is
// the refined marketing copy from design:ux-copy; the corresponding
// Cut B feature flag (where one exists) is named in the trailing
// comment so a future flag rename is obvious to the grep-er.
const FEATURES: readonly FeatureRow[] = [
  { label: "Client workspaces", values: { free: "1", growth: "3", scale: "Unlimited" } },
  { label: "Bring your own Anthropic key", values: { free: true, growth: true, scale: true } },
  { label: "Unlimited contacts per client", values: { free: true, growth: true, scale: true } },
  // Cut B flag: branding_hidden
  {
    label: "No SeldonFrame branding shown to clients",
    values: { free: false, growth: true, scale: true },
  },
  // Cut B flag: custom_domain
  {
    label: "Custom domain per client (theirs, not yours)",
    values: { free: false, growth: true, scale: true },
  },
  // Cut B flag: client_portal
  { label: "Branded client portal", values: { free: false, growth: true, scale: true } },
  // Cut B flag: white_label_portal
  {
    label: "Full white-label (your logo, your domain)",
    values: { free: false, growth: false, scale: true },
  },
  // Cut B flag: priority_support — dropped the SLA promise from the
  // copy since no SLA is committed yet (see SLA judgment call in
  // Cut C final report).
  { label: "Priority support", values: { free: false, growth: false, scale: true } },
  { label: "Claude Code MCP (power-user CLI)", values: { free: true, growth: true, scale: true } },
];

function renderCell(value: string | boolean) {
  if (value === true) {
    return <Check size={16} className="mx-auto text-[#14b8a6]" aria-label="Included" />;
  }
  if (value === false) {
    // a11y May 2026: bumped from zinc-700 (1.5:1) to zinc-500 (3.1:1)
    // to clear WCAG 2.1 AA 1.4.11 non-text contrast on zinc-900 +
    // zebra-strip rows. Label switched from "Not included" to "Not
    // available" — clearer inside a feature comparison row.
    return (
      <Minus
        size={16}
        className="mx-auto text-zinc-500"
        aria-label="Not available"
      />
    );
  }
  return <span className="text-sm text-zinc-200">{value}</span>;
}

export function LandingMarketingPricingSection() {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="mx-auto max-w-5xl border-t border-zinc-800/30 px-6 py-16 md:py-20"
    >
      <div className="text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Pricing
        </p>
        <h2
          id="pricing-heading"
          className="text-3xl font-bold text-zinc-100 md:text-4xl"
        >
          Start free. Charge $29 the day you land your second client.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-zinc-400">
          One workspace per client. Unlimited contacts, bookings, and AI chat on every tier —
          running on your Anthropic key.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
        {TIERS.map((tier) => {
          // design-critique May 2026: Scale cannot visually compete
          // with Growth (the "obvious next step"). Free and Scale both
          // run at slightly demoted background opacity so the eye
          // catches Growth's teal border first; Growth stays at full
          // opacity to anchor the row.
          const cardSurface = tier.highlighted
            ? "border-[#14b8a6]/60 bg-zinc-900 shadow-lg shadow-[#14b8a6]/5"
            : "border-zinc-800/80 bg-zinc-900/60";
          // a11y May 2026: chain the article → badge so SRs announce
          // "Growth tier, Recommended" instead of just "Growth tier"
          // (the visual-only badge is otherwise invisible to AT).
          const badgeId = `pricing-tier-${tier.key}-badge`;
          const nameId = `pricing-tier-${tier.key}-name`;
          return (
            <article
              key={tier.key}
              data-tier={tier.key}
              aria-labelledby={
                tier.highlighted ? `${nameId} ${badgeId}` : nameId
              }
              className={`relative flex flex-col rounded-xl border p-6 ${cardSurface}`}
            >
              {tier.highlighted ? (
                // Lifted above the card top edge so it reads as a
                // stamp, not part of the H3. ring of page-bg color
                // creates a punch-through effect.
                <span
                  id={badgeId}
                  className="absolute -top-2.5 right-4 rounded-full border border-[#14b8a6]/50 bg-[#14b8a6]/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#14b8a6] ring-2 ring-[#09090b]"
                >
                  Recommended
                </span>
              ) : null}
              <h3 id={nameId} className="text-lg font-semibold text-zinc-100">
                {tier.name}
              </h3>
              {/* min-h holds the price baseline aligned across all 3
                  cards even when one tagline wraps to 2 lines. */}
              <p className="mt-1 min-h-[2.5rem] text-sm text-zinc-400">{tier.tagline}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-zinc-100">{tier.price}</span>
                <span className="text-sm text-zinc-500">{tier.period}</span>
              </div>
              <Link
                href={tier.ctaHref}
                data-tier-cta={tier.key}
                /* a11y May 2026: white-on-teal #14b8a6 was 2.6:1 — fails
                   WCAG 2.1 AA 1.4.3 (4.5:1 normal text). zinc-950 on
                   teal is ~7.2:1, well clear. Outline tier CTA stays
                   zinc-200 on dark which already passes. */
                className={`mt-6 inline-flex items-center justify-center rounded-xl px-6 py-3 font-semibold transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14b8a6] ${
                  tier.highlighted
                    ? "bg-[#14b8a6] text-zinc-950 hover:opacity-90"
                    : "border border-zinc-700 text-zinc-200 hover:border-zinc-500"
                }`}
              >
                {tier.ctaLabel}
              </Link>
            </article>
          );
        })}
      </div>

      <div className="mt-10 overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">Tier feature comparison</caption>
          <thead>
            <tr className="bg-zinc-900/50">
              <th scope="col" className="p-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Feature
              </th>
              {TIERS.map((tier) => (
                <th
                  key={tier.key}
                  scope="col"
                  className="p-4 text-center text-xs font-semibold uppercase tracking-wider text-zinc-500"
                >
                  {tier.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Zebra-stripe rows so the eye tracks horizontally without
                losing the row at 1366px on long feature labels. */}
            {FEATURES.map((row) => (
              <tr
                key={row.label}
                className="border-t border-zinc-800/60 odd:bg-zinc-900/30"
              >
                <th scope="row" className="p-4 text-left font-normal text-zinc-200">
                  {row.label}
                </th>
                {TIERS.map((tier) => (
                  <td key={tier.key} className="p-4 text-center">
                    {renderCell(row.values[tier.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
