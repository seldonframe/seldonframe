// packages/crm/src/components/landing/marketing-outreach-math.tsx
//
// 2026-05-22 — Port of HTML §3B OUTREACH MATH. Three side-by-side
// funnel cards (cold email, cold call, LinkedIn DM) with citation
// sources at the bottom. Numbers are sourced from named research
// publications — see the .note text on each card and the sources
// strip at the bottom.

import type { ReactNode } from "react";
import { Mail, Phone } from "lucide-react";
import { MarketingHeadlineMuted, MarketingSectionHead } from "./marketing-section-head";

// lucide-react@1.x doesn't export a LinkedIn glyph; inline the same
// stylized rectangle the HTML mock used (matches the visual rhythm
// of the cold-email + cold-call icons).
const LinkedinGlyph = (
  <svg
    width={18}
    height={18}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <line x1="8" y1="10" x2="8" y2="16" />
    <circle cx="8" cy="7.5" r="0.6" fill="currentColor" />
    <path d="M12 16v-3a2 2 0 1 1 4 0v3" />
    <line x1="12" y1="10" x2="12" y2="16" />
  </svg>
);

type Stage = { qty: string; name: string; rate: string; result?: boolean };
type Channel = {
  icon: ReactNode;
  title: string;
  volume: string;
  stages: readonly Stage[];
  note: string;
};

const CHANNELS: readonly Channel[] = [
  {
    icon: <Mail size={18} aria-hidden />,
    title: "Cold email",
    volume: "Per 1,000 sent",
    stages: [
      { qty: "1,000", name: "Emails delivered", rate: "deliverability ≥ 95%" },
      { qty: "~50", name: "Replies", rate: "5% reply rate" },
      { qty: "~13", name: "Meetings booked", rate: "25% of replies qualify" },
      { qty: "~3", name: "New clients", rate: "25% meeting-to-close", result: true },
    ],
    note:
      "Belkins' 2024 study of 16.5M B2B emails reported a 5.1% reply rate; Backlinko's 11M-email outreach study reported 8.5%.",
  },
  {
    icon: <Phone size={18} aria-hidden />,
    title: "Cold call",
    volume: "Per 1,000 dials",
    stages: [
      { qty: "1,000", name: "Dials", rate: "~8 attempts to reach 1 prospect" },
      { qty: "~54", name: "Live connects", rate: "5.4% connect rate (Gong)" },
      { qty: "~25", name: "Meetings booked", rate: "2.5% dial-to-meeting" },
      { qty: "~6", name: "New clients", rate: "25% meeting-to-close", result: true },
    ],
    note:
      "Gong Labs (300M+ calls), Apollo State of Outbound 2026, and Cleverly's 2026 benchmarks converge on 2–3% dial-to-meeting.",
  },
  {
    icon: LinkedinGlyph,
    title: "Cold LinkedIn DM",
    volume: "Per 1,000 sent",
    stages: [
      { qty: "1,000", name: "DMs sent", rate: "after connection accept" },
      { qty: "~70", name: "Replies", rate: "~7% reply rate" },
      { qty: "~14", name: "Meetings booked", rate: "20% of replies qualify" },
      { qty: "~3", name: "New clients", rate: "25% meeting-to-close", result: true },
    ],
    note:
      "LinkedIn outreach typically reports 2–3× the reply rate of cold email; multi-channel sequences outperform single-channel 2–3× (LinkedIn State of Sales).",
  },
];

export function MarketingOutreachMath() {
  return (
    <section
      id="outreach"
      aria-label="Outreach funnel math"
      className="relative isolate border-y border-zinc-900 bg-[#0c0c0e] px-5 py-24 md:px-8 md:py-32 lg:px-12 lg:py-36"
    >
      <div className="mx-auto max-w-[1200px]">
        <MarketingSectionHead
          eyebrow="Now: filling the book"
          headline={
            <>
              What the cold-outreach funnel actually looks like.{" "}
              <MarketingHeadlineMuted>For agencies selling to local SMBs.</MarketingHeadlineMuted>
            </>
          }
          sub="Conservative industry benchmarks for 2024–2026, sourced below. Numbers are averages — tight ICP, warm signals, and disciplined follow-up can 2–3× them."
        />

        <div className="grid grid-cols-1 gap-[18px] min-[900px]:grid-cols-3 min-[900px]:gap-[22px]">
          {CHANNELS.map((c) => (
            <Card key={c.title} channel={c} />
          ))}
        </div>

        <p className="mt-7 border-t border-zinc-800 pt-[22px] font-mono text-[11.5px] leading-[1.65] tracking-tight text-zinc-500">
          <b className="font-medium text-zinc-200 tracking-wider">Sources:</b> Backlinko 11M-email outreach study ·
          Belkins 16.5M-email B2B benchmark (2024) · Instantly 2026 Cold Email Benchmark Report · Gong Labs 300M+
          cold-call dataset · Apollo State of Outbound (2026) · Cleverly 2026 Cold Calling Statistics · LinkedIn
          State of Sales (2024). 25% meeting-to-close is a conservative agency-services norm; your real close rate
          depends on offer, niche, and sales motion.
        </p>
      </div>
    </section>
  );
}

function Card({ channel }: { channel: Channel }) {
  return (
    <article className="flex flex-col gap-[18px] rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[9px] border border-[color-mix(in_oklab,#14b8a6_28%,transparent)] bg-[color-mix(in_oklab,#14b8a6_18%,#27272a)] text-[#5eead4]">
          {channel.icon}
        </span>
        <div>
          <h3 className="m-0 font-display text-[17px] font-semibold leading-tight tracking-[-0.015em] text-zinc-50">
            {channel.title}
          </h3>
          <div className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.10em] text-zinc-500">{channel.volume}</div>
        </div>
      </div>

      <div className="flex flex-col">
        {channel.stages.map((s, i) => (
          <div
            key={i}
            className={`grid grid-cols-[84px_1fr] items-baseline gap-4 py-3 ${
              i > 0 ? "border-t border-zinc-800" : ""
            }`}
          >
            <span
              className={`text-right font-display font-semibold leading-none tracking-[-0.02em] tabular-nums ${
                s.result ? "text-[26px] text-[#5eead4]" : "text-[22px] text-zinc-100"
              }`}
            >
              {s.qty}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span
                className={`text-[13.5px] tracking-tight ${
                  s.result ? "font-semibold text-zinc-50" : "font-medium text-zinc-200"
                }`}
              >
                {s.name}
              </span>
              <span className="font-mono text-[10.5px] tracking-tight text-zinc-500">{s.rate}</span>
            </span>
          </div>
        ))}
      </div>

      <p className="m-0 pt-1 text-[12.5px] leading-[1.55] text-zinc-500">{channel.note}</p>
    </article>
  );
}
