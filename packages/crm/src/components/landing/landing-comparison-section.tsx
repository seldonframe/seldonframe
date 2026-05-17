// Cut C onboarding-pivot — "Stop renting 5 tools" comparison section.
//
// Sits between the How-It-Works step trio and the Soul section, so the
// dream-outcome (paste a URL → workspace ready) gets followed
// immediately by the wallet math (~$1,744/mo of stitched SaaS vs.
// $29-$99/mo of SeldonFrame). The comparison is the agency-decisive
// frame: the four artifacts the workspace ships are the same four
// artifacts buyers are currently renting on five different invoices.
//
// Design-system spec (from design:design-system pass):
//   - Mirrors the FAQ / how-it-works / hero rhythm: rounded-xl,
//     border-zinc-800, bg-zinc-900 cards, zinc text scale, eyebrow
//     letter-spacing 0.2em on zinc-500.
//   - LEFT column ("escape"):  bg-zinc-900/40, border-zinc-800/60,
//     body text-zinc-400, strikethrough on the line totals via
//     <del> with decoration-rose-500/70 — keeps WCAG AA contrast
//     (zinc-400 on zinc-900 = ~7:1) while signalling "you escape
//     this."
//   - RIGHT column ("destination"): bg-zinc-900, border-[#14b8a6]/30,
//     text-zinc-100, with a soft teal glow shadow that lifts the
//     card off the page — sells "primary surface."
//   - Central arrow: lucide ArrowRight in a teal-tinted bubble,
//     absolutely positioned at the col seam on md+, hidden on
//     mobile (stacked layout makes the arrow redundant).
//
// Copy refined by design:ux-copy. H2 is action-first
// ("Stop renting 5 tools"), columns headed by the rent/ship pair
// that mirrors the operator's gut metaphor. Subtotals are explicit
// so the visual delta hits before the buyer has to do the math.

import { ArrowRight, Check, X } from "lucide-react";

type LineItem = {
  label: string;
  price?: string; // omitted for the emotional / "no dollar amount" item
  struck?: boolean; // applies strikethrough to the price on the LEFT col
};

const ESCAPE_ITEMS: readonly LineItem[] = [
  { label: "GoHighLevel Agency Pro", price: "$497/mo", struck: true },
  { label: "Zapier (15k tasks)", price: "$847/mo", struck: true },
  {
    label: "Calendly + Typeform + Mailchimp + HubSpot",
    price: "$400/mo",
    struck: true,
  },
  { label: "Tool churn, broken zaps, 5-tab context switching" },
];

const DESTINATION_ITEMS: readonly LineItem[] = [
  { label: "Growth", price: "$29/mo (3 client workspaces)" },
  { label: "Scale", price: "$99/mo (unlimited workspaces)" },
  { label: "CRM, booking, intake, chatbot, white-label", price: "included" },
  { label: "One dashboard. Zero tab-switching." },
];

export function LandingComparisonSection() {
  return (
    <section
      id="replaces"
      aria-labelledby="replaces-heading"
      className="mx-auto max-w-6xl border-t border-zinc-800/30 px-6 py-16 md:py-24"
    >
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          What it replaces
        </p>
        <h2
          id="replaces-heading"
          className="text-balance text-3xl font-bold text-zinc-100 md:text-4xl"
        >
          Stop renting 5 tools. Build the OS your client needs in 60 seconds.
        </h2>
      </div>

      <div className="relative mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-8">
        {/* LEFT — what you're renting now */}
        <div
          aria-labelledby="escape-heading"
          className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-6 md:p-7"
        >
          <h3
            id="escape-heading"
            className="text-sm font-semibold uppercase tracking-wider text-zinc-400"
          >
            What you&apos;re renting now
          </h3>
          <ul className="mt-5 space-y-3">
            {ESCAPE_ITEMS.map((item) => (
              <li
                key={item.label}
                className="flex items-start justify-between gap-3 border-b border-zinc-800/40 pb-3 last:border-b-0 last:pb-0"
              >
                <span className="flex items-start gap-2.5">
                  <X
                    className="mt-0.5 size-4 shrink-0 text-zinc-600"
                    strokeWidth={2.25}
                    aria-hidden="true"
                  />
                  <span className="text-sm text-zinc-400">{item.label}</span>
                </span>
                {item.price ? (
                  item.struck ? (
                    <del className="shrink-0 text-sm font-medium tabular-nums text-zinc-500 decoration-rose-500/70 decoration-1">
                      {item.price}
                    </del>
                  ) : (
                    <span className="shrink-0 text-sm font-medium tabular-nums text-zinc-400">
                      {item.price}
                    </span>
                  )
                ) : null}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex items-baseline justify-between border-t border-zinc-800 pt-4">
            <span className="text-xs uppercase tracking-wider text-zinc-500">
              Subtotal
            </span>
            <del className="text-2xl font-bold tabular-nums text-zinc-300 decoration-rose-500/80 decoration-2">
              ~$1,744/mo
            </del>
          </div>
        </div>

        {/* Central arrow — desktop only */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 md:block"
        >
          <div className="flex size-12 items-center justify-center rounded-full border border-[#14b8a6]/30 bg-zinc-900 shadow-[0_0_30px_-5px_rgba(20,184,166,0.35)]">
            <ArrowRight className="size-5 text-[#14b8a6]" strokeWidth={2.25} />
          </div>
        </div>

        {/* RIGHT — what you ship with SeldonFrame */}
        <div
          aria-labelledby="destination-heading"
          className="rounded-xl border border-[#14b8a6]/30 bg-zinc-900 p-6 shadow-[0_0_60px_-15px_rgba(20,184,166,0.25)] md:p-7"
        >
          <h3
            id="destination-heading"
            className="text-sm font-semibold uppercase tracking-wider text-[#14b8a6]"
          >
            What you ship with SeldonFrame
          </h3>
          <ul className="mt-5 space-y-3">
            {DESTINATION_ITEMS.map((item) => (
              <li
                key={item.label}
                className="flex items-start justify-between gap-3 border-b border-zinc-800/60 pb-3 last:border-b-0 last:pb-0"
              >
                <span className="flex items-start gap-2.5">
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-[#14b8a6]"
                    strokeWidth={2.25}
                    aria-hidden="true"
                  />
                  <span className="text-sm text-zinc-100">{item.label}</span>
                </span>
                {item.price ? (
                  <span className="shrink-0 text-sm font-medium tabular-nums text-zinc-300">
                    {item.price}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex items-baseline justify-between border-t border-[#14b8a6]/20 pt-4">
            <span className="text-xs uppercase tracking-wider text-[#14b8a6]">
              Total
            </span>
            <span className="text-2xl font-bold tabular-nums text-zinc-100">
              $29<span className="text-zinc-500">–</span>$99
              <span className="text-base font-medium text-zinc-400">/mo</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
