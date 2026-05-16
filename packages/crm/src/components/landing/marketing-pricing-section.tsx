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
    tagline: "Unlimited clients. AI agents working leads while you sleep.",
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
  // Cut B flag: ai_agents
  {
    label: "AI agents: Speed-to-Lead, Win-Back, Reviews",
    values: { free: false, growth: false, scale: true },
  },
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
    return <Minus size={16} className="mx-auto text-zinc-700" aria-label="Not included" />;
  }
  return <span className="text-sm text-zinc-200">{value}</span>;
}

export function LandingMarketingPricingSection() {
  return (
    <section
      id="pricing"
      className="mx-auto max-w-5xl border-t border-zinc-800/30 px-6 py-16 md:py-20"
    >
      <div className="text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Pricing
        </p>
        <h2 className="text-3xl font-bold text-zinc-100 md:text-4xl">
          Start free. Charge $29 the day you land your second client.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-zinc-400">
          One workspace per client. Unlimited contacts, bookings, and AI chat on every tier —
          running on your Anthropic key.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
        {TIERS.map((tier) => (
          <article
            key={tier.key}
            data-tier={tier.key}
            className={`relative flex flex-col rounded-xl border p-6 ${
              tier.highlighted
                ? "border-[#14b8a6]/50 bg-zinc-900"
                : "border-zinc-800 bg-zinc-900"
            }`}
          >
            {tier.highlighted ? (
              <span className="absolute right-4 top-4 rounded-full border border-[#14b8a6]/40 bg-[#14b8a6]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#14b8a6]">
                Recommended
              </span>
            ) : null}
            <h3 className="text-lg font-semibold text-zinc-100">{tier.name}</h3>
            <p className="mt-1 text-sm text-zinc-400">{tier.tagline}</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-bold text-zinc-100">{tier.price}</span>
              <span className="text-sm text-zinc-500">{tier.period}</span>
            </div>
            <Link
              href={tier.ctaHref}
              data-tier-cta={tier.key}
              className={`mt-6 inline-flex items-center justify-center rounded-xl px-6 py-3 font-semibold transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14b8a6] ${
                tier.highlighted
                  ? "bg-[#14b8a6] text-white hover:opacity-90"
                  : "border border-zinc-700 text-zinc-200 hover:border-zinc-500"
              }`}
            >
              {tier.ctaLabel}
            </Link>
          </article>
        ))}
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
            {FEATURES.map((row) => (
              <tr key={row.label} className="border-t border-zinc-800/60">
                <th scope="row" className="p-4 text-left font-normal text-zinc-300">
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
