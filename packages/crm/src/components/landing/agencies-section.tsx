// "For Agencies" — GoHighLevel-aware positioning.
//
// This section channels the demand that pushes agencies to GHL (one
// platform per client, white-label, recurring revenue) and answers
// the three reasons agencies leave: GHL is complex, GHL's pricing
// scales against you, GHL is closed source. Numbers cited:
//   - GHL Agency Pro published price: $497/mo (externally verifiable)
//   - SeldonFrame tiers: $29/mo Growth (3 clients), $99/mo Scale
//     (unlimited) — matches marketing-pricing-section.tsx as of
//     May 2026. If those tiers move, update this section too so the
//     comparison row stays honest.

import Link from "next/link";

type Row = {
  label: string;
  ghl: string;
  sf: string;
  sfHighlight?: boolean;
};

const COMPARISON: readonly Row[] = [
  {
    label: "Onboarding per client",
    ghl: "2–4 weeks",
    sf: "60 seconds",
    sfHighlight: true,
  },
  {
    label: "Starting agency price",
    ghl: "$497/mo (Agency Pro)",
    sf: "$29/mo (3 clients) · $99/mo (unlimited)",
    sfHighlight: true,
  },
  {
    label: "Tools to wire up",
    ghl: "Zapier + Calendly + Mailchimp + Typeform",
    sf: "CRM + booking + intake + chatbot, already connected",
  },
  {
    label: "White-label",
    ghl: "Yes — after setup",
    sf: "Yes — out of the box",
  },
  {
    label: "AI",
    ghl: "Bolted on",
    sf: "Native — agents read the client's site and run their business",
  },
  {
    label: "Source",
    ghl: "Closed",
    sf: "AGPL-3.0 — fork it if pricing ever changes",
  },
  {
    label: "Email deliverability",
    ghl: "Manual DNS wiring",
    sf: "Wired by default",
  },
];

export function LandingAgenciesSection() {
  return (
    <section className="mx-auto max-w-5xl border-t border-zinc-800/30 px-6 py-16 md:py-24">
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">For Agencies</p>
        <h2 className="text-3xl font-bold text-zinc-100 md:text-4xl">
          The GoHighLevel alternative that actually scales.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-zinc-400">
          GoHighLevel was the first all-in-one platform for agencies — but it&apos;s $497/mo, takes weeks to onboard
          each client, and the AI is bolted on. SeldonFrame is built AI-native: paste a URL, get a complete Business
          OS in 60 seconds. Open-source. Yours to brand.
        </p>
      </div>

      <div className="mt-12 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <div className="grid grid-cols-3 gap-px bg-zinc-800/60 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
          <div className="bg-zinc-900 px-4 py-3"> </div>
          <div className="bg-zinc-900 px-4 py-3">GoHighLevel</div>
          <div className="bg-zinc-900 px-4 py-3 text-[#14b8a6]">SeldonFrame</div>
        </div>
        <div className="divide-y divide-zinc-800/80">
          {COMPARISON.map((row) => (
            <div key={row.label} className="grid grid-cols-3 gap-px">
              <div className="px-4 py-4 text-sm font-medium text-zinc-300">{row.label}</div>
              <div className="px-4 py-4 text-sm text-zinc-500">{row.ghl}</div>
              <div
                className={
                  row.sfHighlight
                    ? "px-4 py-4 text-sm font-semibold text-zinc-100"
                    : "px-4 py-4 text-sm text-zinc-200"
                }
              >
                {row.sf}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
          <h3 className="text-base font-semibold text-zinc-100">One workspace per client</h3>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Opinionated defaults pulled straight from their URL — no Zapier patchwork, no eight dashboards to babysit.
            Their CRM, booking, forms, chatbot, and automations all read from one source of truth.
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
          <h3 className="text-base font-semibold text-zinc-100">Flat pricing that scales with you</h3>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            $29 to $99/mo whether you run three clients or thirty. AI usage, advanced automations, and unlimited
            sub-accounts included. No per-seat surcharges, no overage anxiety.
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
          <h3 className="text-base font-semibold text-zinc-100">Open source. Yours to brand.</h3>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            AGPL-3.0 — fork it, self-host it, never get held hostage to someone else&apos;s billing decisions.
            White-label out of the box: your logo, your domain, your customers&apos; trust in you.
          </p>
        </div>
      </div>

      <div className="mt-12 flex flex-col items-center gap-3 text-center">
        <Link
          href="/signup"
          className="inline-flex items-center rounded-lg bg-[#14b8a6] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0d9488]"
        >
          Start your agency free
        </Link>
        <Link
          href="https://github.com/seldonframe/seldonframe/"
          target="_blank"
          rel="noreferrer noopener"
          className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-300"
        >
          Read the architecture →
        </Link>
      </div>
    </section>
  );
}
