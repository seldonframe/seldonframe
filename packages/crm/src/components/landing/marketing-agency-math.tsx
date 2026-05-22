// packages/crm/src/components/landing/marketing-agency-math.tsx
//
// 2026-05-22 — Port of HTML §3 AGENCY MATH. Live calculator with
// three sliders + plan toggle + four result cells. From the handoff
// README §3:
//
//   mrr        = chargePerClient * clients
//   setupPool  = setupFee * clients
//   year1      = mrr * 12 + setupPool
//   margin     = (year1 - planCost * 12) / year1
//
//   PLANS = { growth: 29, scale: 99 }
//
// Default state matches the HTML mock: Scale plan, $199/mo per
// client, $1,500 setup, 12 clients → $46,656 year-1 / 97% margin.

"use client";

import { useMemo, useState } from "react";
import { MarketingHeadlineMuted, MarketingSectionHead } from "./marketing-section-head";

const PLANS = { growth: 29, scale: 99 } as const;
type Plan = keyof typeof PLANS;

function fmtUsd(n: number): string {
  return "$" + Math.round(n).toLocaleString();
}

export function MarketingAgencyMath() {
  const [plan, setPlan] = useState<Plan>("scale");
  const [charge, setCharge] = useState(199);
  const [setup, setSetup] = useState(1500);
  const [clients, setClients] = useState(12);

  const results = useMemo(() => {
    const planCost = PLANS[plan];
    const mrr = charge * clients;
    const setupPool = setup * clients;
    const year1 = mrr * 12 + setupPool;
    const year1Cost = planCost * 12;
    const margin = year1 === 0 ? 0 : Math.max(0, (year1 - year1Cost) / year1);
    return { planCost, mrr, setupPool, year1, margin };
  }, [plan, charge, setup, clients]);

  return (
    <section
      id="math"
      aria-label="Agency math"
      className="relative isolate px-5 py-24 md:px-8 md:py-32 lg:px-12 lg:py-36"
    >
      <div className="relative mx-auto max-w-[1200px]">
        <MarketingSectionHead
          eyebrow="The agency math"
          headline={
            <>
              The recurring revenue is yours. <MarketingHeadlineMuted>We&apos;re a fixed cost.</MarketingHeadlineMuted>
            </>
          }
          sub="You charge each client a monthly fee, plus an optional setup fee upfront. We charge you one flat fee. Slide the dials."
        />

        <div className="grid grid-cols-1 items-start gap-5 min-[900px]:grid-cols-2 min-[900px]:gap-7">
          {/* Inputs card */}
          <div className="flex flex-col gap-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <div>
              <p className="m-0 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                Your plan with SeldonFrame
              </p>
              <p className="mt-1 text-[13px] text-zinc-400">Two tiers. Cancel anytime.</p>
            </div>

            <div role="tablist" className="grid grid-cols-2 gap-1 rounded-[10px] border border-zinc-800 bg-[#09090b] p-1">
              {(Object.keys(PLANS) as Plan[]).map((p) => {
                const selected = plan === p;
                return (
                  <button
                    key={p}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setPlan(p)}
                    className={`flex h-16 flex-col items-center justify-center gap-1 rounded-[7px] px-3 transition-colors ${
                      selected ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <span
                      className={`font-display text-[20px] font-semibold tracking-[-0.015em] ${
                        selected ? "text-[#5eead4]" : "text-zinc-50"
                      }`}
                    >
                      ${PLANS[p]}
                    </span>
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-zinc-500">
                      {p === "growth" ? "Growth" : "Scale · white-label"}
                    </span>
                  </button>
                );
              })}
            </div>

            <Slider
              label="Monthly fee per client"
              displayValue={`$${charge.toLocaleString()}`}
              displaySuffix="/mo"
              min={49}
              max={2000}
              step={25}
              value={charge}
              onChange={setCharge}
            />
            <Slider
              label="Upfront setup fee per client"
              displayValue={setup === 0 ? "No setup fee" : `$${setup.toLocaleString()}`}
              displaySuffix={setup === 0 ? "$0" : "one-time"}
              min={0}
              max={5000}
              step={100}
              value={setup}
              onChange={setSetup}
            />
            <Slider
              label="Number of clients"
              displayValue={String(clients)}
              min={1}
              max={50}
              step={1}
              value={clients}
              onChange={setClients}
            />
          </div>

          {/* Results card */}
          <div className="flex flex-col gap-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <div>
              <p className="m-0 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">Your numbers</p>
              <p className="mt-1 text-[13px] text-zinc-400">Live as you slide. No signup, no email gate.</p>
            </div>

            <div
              className="grid grid-cols-2 gap-3.5 rounded-2xl border border-[color-mix(in_oklab,#14b8a6_28%,#27272a)] p-5"
              style={{
                background:
                  "radial-gradient(70% 80% at 50% 0%, rgba(20,184,166,0.10), transparent 75%), #18181b",
              }}
            >
              <ResultCell
                label="Monthly recurring"
                value={fmtUsd(results.mrr)}
                sub={`${fmtUsd(results.mrr * 12)} / year`}
                positive
              />
              <ResultCell
                label="Upfront setup pool"
                value={fmtUsd(results.setupPool)}
                sub="One-time, across all clients"
              />
              <ResultCell
                label="Year-1 total"
                value={fmtUsd(results.year1)}
                sub="MRR × 12 + upfront pool"
                positive
              />
              <ResultCell
                label="Gross margin"
                value={`${Math.round(results.margin * 100)}%`}
                sub={`After $${results.planCost}/mo to SeldonFrame`}
              />
            </div>

            <p className="m-0 text-xs leading-[1.5] text-zinc-600">
              Math, not a forecast. Real margin depends on delivery cost, support, and retention — but the dial works.
            </p>
          </div>
        </div>
      </div>

      {/* Slider thumb styling — webkit + moz both need their own pseudo-element */}
      <style jsx global>{`
        .roi-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 6px;
          background: #27272a;
          border-radius: 3px;
          outline: none;
          cursor: pointer;
        }
        .roi-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 22px;
          height: 22px;
          background: #2dd4bf;
          border: 3px solid #09090b;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(20, 184, 166, 0.4), 0 0 0 1px #14b8a6;
        }
        .roi-slider::-moz-range-thumb {
          width: 22px;
          height: 22px;
          background: #2dd4bf;
          border: 3px solid #09090b;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(20, 184, 166, 0.4), 0 0 0 1px #14b8a6;
        }
      `}</style>
    </section>
  );
}

function Slider({
  label,
  displayValue,
  displaySuffix,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  displayValue: string;
  displaySuffix?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-sm font-medium tracking-tight text-zinc-200">{label}</span>
        <span className="font-mono text-base font-medium tabular-nums text-[#5eead4]">
          {displayValue}{" "}
          {displaySuffix ? <small className="text-[11px] font-medium text-zinc-500">{displaySuffix}</small> : null}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        aria-label={label}
        className="roi-slider"
      />
    </div>
  );
}

function ResultCell({
  label,
  value,
  sub,
  positive,
}: {
  label: string;
  value: string;
  sub: string;
  positive?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-[10px] border border-zinc-800 bg-[color-mix(in_oklab,#09090b_35%,transparent)] p-4">
      <span className="font-mono text-[10px] uppercase tracking-[0.10em] text-zinc-500">{label}</span>
      <span
        className={`mt-0.5 font-display text-[clamp(24px,2.8vw,34px)] font-semibold leading-none tracking-[-0.025em] tabular-nums ${
          positive ? "text-[#5eead4]" : "text-zinc-50"
        }`}
      >
        {value}
      </span>
      <span className="font-mono text-[11.5px] leading-snug text-zinc-500">{sub}</span>
    </div>
  );
}

