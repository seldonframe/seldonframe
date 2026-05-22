// packages/crm/src/components/landing/marketing-replace.tsx
//
// 2026-05-22 — Port of HTML §6 WHAT YOU'RE REPLACING. Two-column
// list: LEFT is the dashed-border "current stack" with line-through
// item names; RIGHT is the solid SeldonFrame card with checkmarks
// and the green "60 seconds" highlight on the last row.

import { Check, X } from "lucide-react";
import { MarketingHeadlineMuted, MarketingSectionHead } from "./marketing-section-head";

type Item = { name: string; meta: string; highlight?: boolean };

const CURRENT: readonly Item[] = [
  { name: "GoHighLevel agency seat", meta: "$497/mo" },
  { name: "Calendly + scheduling glue", meta: "$15–30/mo" },
  { name: "Typeform / Jotform intake", meta: "$25–99/mo" },
  { name: "Custom WordPress site", meta: "2–4 weeks build" },
  { name: "Zapier glue between all of them", meta: "$30+/mo" },
  { name: "Time to onboard each new client", meta: "2–4 weeks" },
];

const SELDON: readonly Item[] = [
  { name: "CRM, booking, intake, chatbot in one workspace", meta: "included" },
  { name: "Landing page tuned to the archetype", meta: "included" },
  { name: "White-label at your own domain", meta: "Scale tier" },
  { name: "One source of truth — edit once, propagates", meta: "included" },
  { name: "Workspace ownership stays with the agency", meta: "native" },
  { name: "Time to onboard each new client", meta: "60 seconds", highlight: true },
];

export function MarketingReplace() {
  return (
    <section
      id="replace"
      aria-label="Stack replaced"
      className="relative isolate border-y border-zinc-900 bg-[#0c0c0e] px-5 py-24 md:px-8 md:py-32 lg:px-12 lg:py-36"
    >
      <div className="mx-auto max-w-[1200px]">
        <MarketingSectionHead
          eyebrow="What you're replacing"
          headline={
            <>
              One workspace. <MarketingHeadlineMuted>No five-tool stack.</MarketingHeadlineMuted>
            </>
          }
          sub="Most agencies rent five tools, glue them with Zapier, and re-build the same workspace every onboarding. Cancel them."
        />

        <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2 md:gap-6">
          {/* Current stack — dashed border, strike list */}
          <div className="rounded-2xl border border-dashed border-zinc-800 p-6">
            <div className="mb-5 flex items-center gap-2.5">
              <span className="inline-flex size-7 items-center justify-center rounded-md bg-[color-mix(in_oklab,#ef4444_18%,transparent)] text-[#f87171]">
                <X size={14} aria-hidden />
              </span>
              <h3 className="m-0 font-display text-base font-semibold tracking-[-0.015em] text-zinc-100">
                Your current stack
                <small className="mt-0.5 block font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                  What you cancel
                </small>
              </h3>
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {CURRENT.map((it, i) => (
                <li
                  key={it.name}
                  className={`grid grid-cols-[18px_1fr_auto] items-center gap-2.5 py-2.5 ${
                    i > 0 ? "border-t border-zinc-800" : ""
                  }`}
                >
                  <X className="text-[#f87171]" size={16} strokeWidth={2.4} aria-hidden />
                  <span className="text-sm text-zinc-500 line-through decoration-zinc-600">{it.name}</span>
                  <span className="font-mono text-[11px] text-zinc-500">{it.meta}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* SeldonFrame — solid card */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <div className="mb-5 flex items-center gap-2.5">
              <span className="inline-flex size-7 items-center justify-center rounded-md bg-[color-mix(in_oklab,#14b8a6_18%,#27272a)] text-[#5eead4]">
                <Check size={14} aria-hidden />
              </span>
              <h3 className="m-0 font-display text-base font-semibold tracking-[-0.015em] text-zinc-100">
                SeldonFrame
                <small className="mt-0.5 block font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                  What replaces it
                </small>
              </h3>
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {SELDON.map((it, i) => (
                <li
                  key={it.name}
                  className={`grid grid-cols-[18px_1fr_auto] items-center gap-2.5 py-2.5 ${
                    i > 0 ? "border-t border-zinc-800" : ""
                  }`}
                >
                  <Check className="text-[#2dd4bf]" size={16} strokeWidth={2.4} aria-hidden />
                  <span className="text-sm text-zinc-200">{it.name}</span>
                  <span className={`font-mono text-[11px] ${it.highlight ? "text-[#5eead4]" : "text-zinc-500"}`}>
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
