// packages/crm/src/components/landing/marketing-pricing-section.tsx
//
// Redesign 2026-06-18 — flat 3-tier pricing (seat-based, no metered wallet).
// Warm light aesthetic: paper/card surfaces, SeldonFrame green accent.
//
// Tier spec (locked 2026-06-18):
//   Builder   $19/mo — up to 10 landing pages, own domain, no CRM/booking
//   Workspace $49/mo — 1 full workspace (website + booking + intake + CRM + chat)
//   Agency    $297/mo — white-label, 10 client workspaces included (+$10/ea beyond)
//
// One optional add-on (Workspace + Agency): AI voice receptionist, $99/mo per
// agent, 500 talk-minutes included. No metered usage wallet — flat + predictable.
//
// The original dark-theme pricing component is preserved verbatim in
// marketing-pricing-section-dark.tsx (unused) for rollback reference.

import Link from "next/link";
import { Check, Minus } from "lucide-react";

type TierKey = "builder" | "workspace" | "agency";

type Tier = {
  key: TierKey;
  name: string;
  price: string;
  period: string;
  tagline: string;
  ctaLabel: string;
  ctaHref: string;
  highlighted?: boolean;
  badge?: string;
};

type FeatureRow = {
  label: string;
  values: Readonly<Record<TierKey, string | boolean>>;
};

const TIERS: readonly Tier[] = [
  {
    key: "builder",
    name: "Builder",
    price: "$19",
    period: "/month",
    tagline: "Up to 10 landing pages on your own domain. Capture leads without the full workspace.",
    ctaLabel: "Start with Builder",
    ctaHref: "/signup?plan=builder",
  },
  {
    key: "workspace",
    name: "Workspace",
    price: "$49",
    period: "/month",
    tagline: "1 full workspace — website, booking, intake form, CRM, and AI chatbot. Everything wired.",
    ctaLabel: "Start with Workspace",
    ctaHref: "/signup?plan=workspace",
    highlighted: true,
    badge: "Most popular",
  },
  {
    key: "agency",
    name: "Agency",
    price: "$297",
    period: "/month",
    tagline: "White-label the whole platform under your brand. Resell to clients at your own markup.",
    ctaLabel: "Start the Agency plan",
    ctaHref: "/signup?plan=agency",
  },
];

const FEATURES: readonly FeatureRow[] = [
  {
    label: "Client workspaces",
    values: { builder: "Landing pages only", workspace: "1", agency: "10 included" },
  },
  {
    label: "Landing pages",
    values: { builder: "Up to 10", workspace: "Included", agency: "Included" },
  },
  { label: "Own domain + branding", values: { builder: true, workspace: true, agency: true } },
  { label: "CRM", values: { builder: false, workspace: true, agency: true } },
  { label: "Booking page (Cal.diy)", values: { builder: false, workspace: true, agency: true } },
  { label: "Intake form", values: { builder: false, workspace: true, agency: true } },
  { label: "AI chatbot", values: { builder: false, workspace: true, agency: true } },
  { label: "White-label platform (your brand)", values: { builder: false, workspace: false, agency: true } },
  { label: "Resell at your own markup", values: { builder: false, workspace: false, agency: true } },
  { label: "Priority support", values: { builder: false, workspace: false, agency: true } },
  { label: "AI voice receptionist (add-on)", values: { builder: false, workspace: "Add-on", agency: "Add-on" } },
];

function renderCell(value: string | boolean) {
  if (value === true) {
    return <Check size={16} className="mx-auto text-[#00897B]" aria-label="Included" />;
  }
  if (value === false) {
    return <Minus size={16} className="mx-auto text-[#9A9183]" aria-label="Not available" />;
  }
  return <span className="text-[13px] text-[#221D17]">{value}</span>;
}

export function LandingMarketingPricingSection() {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="border-t border-[rgba(34,29,23,.08)] bg-[#F6F2EA] px-5 py-20 md:px-8 md:py-28 lg:px-12"
    >
      <div className="mx-auto max-w-[1120px]">
        {/* Section head */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center gap-2.5 text-[12px] font-[600] uppercase tracking-[0.09em] text-[#00897B]">
            <span className="h-px w-4 bg-[#00897B] opacity-50" aria-hidden />
            Pricing
            <span className="h-px w-4 bg-[#00897B] opacity-50" aria-hidden />
          </div>
          <h2
            id="pricing-heading"
            className="mx-auto mt-3.5 max-w-[18ch] text-[clamp(27px,4.2vw,42px)] font-[500] leading-[1.08] tracking-[-0.025em] text-[#221D17]"
          >
            One flat price.{" "}
            <em className="font-[Newsreader,Georgia,serif] font-normal not-italic text-[#6E665A]">
              Absurd value.
            </em>
          </h2>
          <p className="mx-auto mt-4 max-w-[52ch] text-[16px] leading-[1.55] text-[#6E665A]">
            Less than a part-time hire — and a single booked job pays for the year. One flat
            monthly price: no metered bills, no surprise fees.
          </p>
        </div>

        {/* Tier cards */}
        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          {TIERS.map((tier) => {
            const isHighlighted = Boolean(tier.highlighted);
            return (
              <article
                key={tier.key}
                data-tier={tier.key}
                aria-labelledby={`pricing-tier-${tier.key}-name`}
                className={`relative flex flex-col rounded-[20px] p-6 transition-shadow ${
                  isHighlighted
                    ? "border border-[rgba(0,137,123,.35)] bg-[#FFFDFA] shadow-[0_24px_60px_rgba(34,29,23,.12)]"
                    : "border border-[rgba(34,29,23,.08)] bg-[#FFFDFA] shadow-[0_1px_2px_rgba(34,29,23,.05),0_10px_30px_rgba(34,29,23,.07)]"
                }`}
              >
                {tier.badge ? (
                  <span className="absolute -top-3 right-5 rounded-full border border-[rgba(0,137,123,.25)] bg-[rgba(0,137,123,.12)] px-3 py-1 text-[10.5px] font-[600] uppercase tracking-wider text-[#00897B] ring-2 ring-[#F6F2EA]">
                    {tier.badge}
                  </span>
                ) : null}

                <h3 id={`pricing-tier-${tier.key}-name`} className="text-[17px] font-[600] text-[#221D17]">
                  {tier.name}
                </h3>
                <p className="mt-1.5 min-h-[3rem] text-[13.5px] leading-[1.5] text-[#6E665A]">{tier.tagline}</p>

                <div className="mt-5 flex items-baseline gap-1">
                  <span className="font-sans text-[clamp(40px,5.5vw,52px)] font-[600] leading-none tracking-[-0.03em] text-[#221D17]">
                    {tier.price}
                  </span>
                  <span className="text-[14px] text-[#9A9183]">{tier.period}</span>
                </div>

                <Link
                  href={tier.ctaHref}
                  data-tier-cta={tier.key}
                  className={`mt-6 inline-flex items-center justify-center gap-2.5 rounded-full px-6 py-3.5 text-[14px] font-[500] transition-all hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00897B] ${
                    isHighlighted
                      ? "bg-[#1F2B24] text-[#F6F2EA] shadow-[0_1px_2px_rgba(34,29,23,.10),0_6px_16px_rgba(34,29,23,.10),inset_0_1.5px_0_rgba(255,255,255,.12)]"
                      : "border border-[rgba(34,29,23,.18)] bg-transparent text-[#221D17] hover:border-[rgba(34,29,23,.28)]"
                  }`}
                >
                  {isHighlighted ? (
                    <span className="size-[7px] rounded-full bg-[#00897B] shadow-[0_0_0_3px_rgba(0,137,123,.22)]" aria-hidden />
                  ) : null}
                  {tier.ctaLabel}
                </Link>
              </article>
            );
          })}
        </div>

        {/* Feature comparison table */}
        <div className="mt-8 overflow-x-auto rounded-[16px] border border-[rgba(34,29,23,.10)] bg-[#FFFDFA] shadow-[0_1px_2px_rgba(34,29,23,.05)]">
          <table className="w-full min-w-[640px] text-[13px]">
            <caption className="sr-only">Tier feature comparison</caption>
            <thead>
              <tr className="border-b border-[rgba(34,29,23,.08)] bg-[#EFE9DD]">
                <th scope="col" className="p-4 text-left text-[11px] font-[600] uppercase tracking-wider text-[#9A9183]">
                  Feature
                </th>
                {TIERS.map((tier) => (
                  <th
                    key={tier.key}
                    scope="col"
                    className="p-4 text-center text-[11px] font-[600] uppercase tracking-wider text-[#9A9183]"
                  >
                    {tier.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((row, i) => (
                <tr
                  key={row.label}
                  className={`border-t border-[rgba(34,29,23,.06)] ${i % 2 === 0 ? "bg-[#FFFDFA]" : "bg-[#F6F2EA]/50"}`}
                >
                  <th scope="row" className="p-4 text-left font-[400] text-[#221D17]">
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

        {/* Optional add-on */}
        <div className="mt-6 rounded-[16px] border border-[rgba(34,29,23,.08)] bg-[#EFE9DD] p-6">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="m-0 text-[14px] font-[600] text-[#221D17]">One optional add-on</h3>
            <span className="rounded-full border border-[rgba(34,29,23,.12)] bg-[#FFFDFA] px-2.5 py-0.5 text-[11px] font-[500] text-[#6E665A]">
              Workspace &amp; Agency
            </span>
          </div>
          <p className="text-[13.5px] leading-[1.55] text-[#6E665A]">
            <strong className="font-[600] text-[#221D17]">AI voice receptionist — $99/mo</strong> per agent,
            500 talk-minutes included. It answers every call, books jobs, and texts back missed calls 24/7.
            Everything else — website, booking, intake, CRM, and chat — is included in your plan.
          </p>
        </div>
      </div>
    </section>
  );
}
