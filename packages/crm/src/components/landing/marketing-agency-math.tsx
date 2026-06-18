// packages/crm/src/components/landing/marketing-agency-math.tsx
//
// Redesign 2026-06-18 — warm light aesthetic.
// Agency / white-label section. Deep green (#1F2B24) callout block
// (seldonstudio.com's dark-block pattern), live margin calculator
// with SeldonFrame green slider thumbs. Agency-first reseller pitch.

"use client";

import { useMemo, useState } from "react";

// New Agency plan pricing (per the spec)
const AGENCY_PLAN_COST = 297; // $297/mo

function fmtUsd(n: number): string {
  return "$" + Math.round(n).toLocaleString();
}

export function MarketingAgencyMath() {
  const [charge, setCharge] = useState(199);
  const [setup, setSetup] = useState(1500);
  const [clients, setClients] = useState(12);

  const results = useMemo(() => {
    const mrr = charge * clients;
    const setupPool = setup * clients;
    const year1 = mrr * 12 + setupPool;
    const year1Cost = AGENCY_PLAN_COST * 12;
    const margin = year1 === 0 ? 0 : Math.max(0, (year1 - year1Cost) / year1);
    return { mrr, setupPool, year1, margin };
  }, [charge, setup, clients]);

  return (
    <section
      id="agencies"
      aria-label="For agencies"
      className="border-t border-[rgba(34,29,23,.08)] bg-[#1F2B24] px-5 py-20 md:px-8 md:py-28 lg:px-12"
    >
      <div className="mx-auto max-w-[1120px]">
        {/* Section head */}
        <div className="grid grid-cols-1 items-start gap-10 min-[900px]:grid-cols-[1.1fr_.9fr] min-[900px]:gap-14">
          <div>
            <div className="inline-flex items-center gap-2.5 text-[12px] font-[600] uppercase tracking-[0.09em] text-[rgba(111,194,143,.9)]">
              <span className="h-px w-4 bg-[rgba(111,194,143,.5)]" aria-hidden />
              For agencies
            </div>
            <h2 className="mt-3.5 text-[clamp(27px,4.2vw,40px)] font-[500] leading-[1.08] tracking-[-0.025em] text-[#F6F2EA]">
              Resell it under{" "}
              <em className="font-[Newsreader,Georgia,serif] font-normal not-italic text-[rgba(246,242,234,.75)]">
                your brand.
              </em>{" "}
              Keep the spread.
            </h2>
            <p className="mt-4 max-w-[48ch] text-[15.5px] leading-[1.55] text-[rgba(246,242,234,.74)]">
              The Agency plan ($297/mo) white-labels SeldonFrame under your brand — your logo,
              your domain, your pricing. You set the markup, you keep the margin.
              Agencies are running this at $149–$397/mo per client.
            </p>

            {/* Agency perks list */}
            <ul className="mt-6 flex flex-col gap-3">
              {[
                "Your brand on the entire platform — clients never see SeldonFrame",
                "Set your own per-client markup and keep the spread",
                "Metered usage (SMS, AI calls, phone numbers) — rebill at your markup",
                "Included usage credit every month",
                "Many client workspaces — no per-seat limits",
                "Priority support + partner onboarding",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-[14px] leading-[1.5] text-[rgba(246,242,234,.82)]">
                  <span className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full bg-[#1F2B24] border border-[rgba(111,194,143,.35)]">
                    <span className="text-[10px] font-[700] text-[#6fc28f]">✓</span>
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            <a
              href="/signup?plan=agency"
              className="mt-8 inline-flex items-center gap-2.5 rounded-full bg-[#F6F2EA] px-6 py-3.5 text-[15px] font-[500] text-[#1F2B24] shadow-[0_1px_2px_rgba(0,0,0,.2),0_12px_30px_rgba(0,0,0,.25),inset_0_1.5px_0_rgba(255,255,255,.6)] transition-all hover:-translate-y-[1.5px]"
            >
              <span className="size-[7px] rounded-full bg-[#00897B]" aria-hidden />
              Start the Agency plan
            </a>
          </div>

          {/* Calculator */}
          <div className="rounded-[24px] border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.05)] p-6 shadow-[0_24px_60px_rgba(0,0,0,.25)]">
            <p className="m-0 font-sans text-[11px] font-[600] uppercase tracking-[0.12em] text-[rgba(111,194,143,.8)]">
              The agency math
            </p>
            <p className="mt-1 text-[13px] text-[rgba(246,242,234,.55)]">
              Slide the dials — see your margin live.
            </p>

            <div className="mt-5 flex flex-col gap-5">
              <Slider
                label="Monthly fee per client"
                displayValue={`$${charge.toLocaleString()}/mo`}
                min={49}
                max={1000}
                step={25}
                value={charge}
                onChange={setCharge}
              />
              <Slider
                label="Setup fee per client"
                displayValue={setup === 0 ? "No setup fee" : `$${setup.toLocaleString()}`}
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

            <div className="mt-6 grid grid-cols-2 gap-3 rounded-[16px] border border-[rgba(255,255,255,.08)] bg-[rgba(0,0,0,.2)] p-5">
              <ResultCell label="Monthly recurring" value={fmtUsd(results.mrr)} sub={`${fmtUsd(results.mrr * 12)} / year`} />
              <ResultCell label="Setup pool" value={fmtUsd(results.setupPool)} sub="One-time" />
              <ResultCell label="Year-1 total" value={fmtUsd(results.year1)} sub="MRR × 12 + setup" positive />
              <ResultCell label="Gross margin" value={`${Math.round(results.margin * 100)}%`} sub={`After $${AGENCY_PLAN_COST}/mo to SF`} positive />
            </div>

            <p className="mt-3 text-[11.5px] leading-[1.5] text-[rgba(246,242,234,.35)]">
              Math, not a forecast. Real margin depends on delivery cost and retention.
            </p>
          </div>
        </div>
      </div>

      {/* Slider styling */}
      <style jsx global>{`
        .roi-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 6px;
          background: rgba(255,255,255,.15);
          border-radius: 3px;
          outline: none;
          cursor: pointer;
        }
        .roi-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 22px;
          height: 22px;
          background: #00897B;
          border: 3px solid #1F2B24;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(0,137,123,.4);
        }
        .roi-slider::-moz-range-thumb {
          width: 22px;
          height: 22px;
          background: #00897B;
          border: 3px solid #1F2B24;
          border-radius: 50%;
          cursor: pointer;
        }
      `}</style>
    </section>
  );
}

function Slider({
  label,
  displayValue,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  displayValue: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-[13.5px]">
        <span className="text-[rgba(246,242,234,.6)]">{label}</span>
        <strong className="font-[600] text-[#FFFDFA] tabular-nums">{displayValue}</strong>
      </div>
      <input
        type="range"
        className="roi-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
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
    <div className="flex flex-col gap-0.5">
      <span className="font-sans text-[10px] font-[500] uppercase tracking-[0.08em] text-[rgba(246,242,234,.45)]">
        {label}
      </span>
      <span className={`font-sans text-[clamp(22px,3vw,28px)] font-[600] leading-none tracking-[-0.02em] tabular-nums ${positive ? "text-[#6fc28f]" : "text-[#FFFDFA]"}`}>
        {value}
      </span>
      <span className="font-sans text-[11px] text-[rgba(246,242,234,.40)]">{sub}</span>
    </div>
  );
}
