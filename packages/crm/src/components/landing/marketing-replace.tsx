// packages/crm/src/components/landing/marketing-replace.tsx
//
// Redesign 2026-06-18 — warm light aesthetic.
// "Why not just…" comparison section. Paper surface, dashed vs solid
// card pattern from seldonstudio.com's comparison block.

import { Check, X } from "lucide-react";

type Item = { name: string; meta: string; highlight?: boolean };

const CURRENT: readonly Item[] = [
  { name: "GoHighLevel agency seat", meta: "$497/mo" },
  { name: "Calendly + scheduling glue", meta: "$15–30/mo" },
  { name: "Typeform / Jotform intake", meta: "$25–99/mo" },
  { name: "Custom site build", meta: "2–4 weeks" },
  { name: "Zapier glue between all of them", meta: "$30+/mo" },
  { name: "Time to onboard each new client", meta: "2–4 weeks" },
];

const SELDON: readonly Item[] = [
  { name: "CRM, booking, intake, chatbot in one workspace", meta: "included" },
  { name: "Landing page tuned to the business", meta: "included" },
  { name: "White-label at your own domain", meta: "Agency tier" },
  { name: "One source of truth — edit once, propagates", meta: "included" },
  { name: "Workspace ownership stays with the agency", meta: "native" },
  { name: "Time to onboard each new client", meta: "60 seconds", highlight: true },
];

export function MarketingReplace() {
  return (
    <section
      id="replace"
      aria-label="Stack replaced"
      className="border-t border-[rgba(34,29,23,.08)] bg-[#EFE9DD] px-5 py-20 md:px-8 md:py-28 lg:px-12"
    >
      <div className="mx-auto max-w-[1120px]">
        {/* Section head */}
        <div className="max-w-[600px]">
          <div className="inline-flex items-center gap-2.5 text-[12px] font-[600] uppercase tracking-[0.09em] text-[#1F2B24]">
            <span className="h-px w-4 bg-[#1F2B24] opacity-50" aria-hidden />
            Why not just…
          </div>
          <h2 className="mt-3.5 text-[clamp(27px,4.2vw,42px)] font-[500] leading-[1.08] tracking-[-0.025em] text-[#221D17]">
            One workspace.{" "}
            <em className="font-[Newsreader,Georgia,serif] font-normal not-italic text-[#6E665A]">
              No five-tool stack.
            </em>
          </h2>
          <p className="mt-4 max-w-[54ch] text-[clamp(15.5px,1.9vw,18px)] leading-[1.55] text-[#6E665A]">
            Most agencies rent five tools, glue them with Zapier, and re-build the same
            workspace every onboarding. SeldonFrame replaces the whole stack —
            at roughly 5× under GoHighLevel.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
          {/* Current stack — dashed border */}
          <div className="rounded-[18px] border border-dashed border-[rgba(34,29,23,.18)] p-6">
            <div className="mb-5 flex items-center gap-2.5">
              <span className="inline-flex size-7 items-center justify-center rounded-md bg-[rgba(239,68,68,.12)] text-[#dc2626]">
                <X size={14} aria-hidden />
              </span>
              <h3 className="m-0 text-[15px] font-[600] tracking-[-0.015em] text-[#221D17]">
                Your current stack
                <small className="mt-0.5 block font-sans text-[11px] font-[500] uppercase tracking-[0.06em] text-[#9A9183]">
                  What you cancel
                </small>
              </h3>
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {CURRENT.map((it, i) => (
                <li
                  key={it.name}
                  className={`grid grid-cols-[18px_1fr_auto] items-center gap-2.5 py-2.5 ${
                    i > 0 ? "border-t border-[rgba(34,29,23,.08)]" : ""
                  }`}
                >
                  <X className="text-[#dc2626]" size={15} strokeWidth={2.4} aria-hidden />
                  <span className="text-[13.5px] text-[#9A9183] line-through decoration-[#9A9183]/50">{it.name}</span>
                  <span className="font-mono text-[11px] text-[#9A9183]">{it.meta}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* SeldonFrame — solid card */}
          <div className="rounded-[18px] border border-[rgba(34,29,23,.08)] bg-[#FFFDFA] p-6 shadow-[0_1px_2px_rgba(34,29,23,.05),0_10px_30px_rgba(34,29,23,.07)]">
            <div className="mb-5 flex items-center gap-2.5">
              <span className="inline-flex size-7 items-center justify-center rounded-md bg-[rgba(31, 43, 36,.12)] text-[#1F2B24]">
                <Check size={14} aria-hidden />
              </span>
              <h3 className="m-0 text-[15px] font-[600] tracking-[-0.015em] text-[#221D17]">
                SeldonFrame
                <small className="mt-0.5 block font-sans text-[11px] font-[500] uppercase tracking-[0.06em] text-[#9A9183]">
                  What replaces it
                </small>
              </h3>
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {SELDON.map((it, i) => (
                <li
                  key={it.name}
                  className={`grid grid-cols-[18px_1fr_auto] items-center gap-2.5 py-2.5 ${
                    i > 0 ? "border-t border-[rgba(34,29,23,.08)]" : ""
                  }`}
                >
                  <Check className="text-[#1F2B24]" size={15} strokeWidth={2.4} aria-hidden />
                  <span className="text-[13.5px] text-[#221D17]">{it.name}</span>
                  <span className={`font-mono text-[11px] ${it.highlight ? "font-[600] text-[#1F2B24]" : "text-[#9A9183]"}`}>
                    {it.meta}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
