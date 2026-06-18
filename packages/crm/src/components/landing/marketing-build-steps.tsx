// packages/crm/src/components/landing/marketing-build-steps.tsx
//
// Redesign 2026-06-18 — warm light aesthetic.
// "How it works" — 3-step flow. Paper/card surface, Newsreader italic
// accent numbers, SeldonFrame green (#00897B) for active/done dots.

"use client";

import type { ReactNode } from "react";

type MockRow = { tone: "idle" | "active" | "done"; label: ReactNode };
type Step = {
  num: string;
  title: string;
  body: string;
  mock: readonly MockRow[];
};

const STEPS: readonly Step[] = [
  {
    num: "1",
    title: "Paste a URL — or describe the business.",
    body: "Your client's website, or a quick Google Maps description. We'll build from either.",
    mock: [
      { tone: "idle", label: "URL or business info" },
      { tone: "idle", label: <span className="font-mono text-[#221D17]">https://stocktonheating.com</span> },
      { tone: "active", label: "Scanning business info…" },
      { tone: "idle", label: "Soul compiled" },
    ],
  },
  {
    num: "2",
    title: "Watch it spin up in 60 seconds.",
    body: "The build runs live — website, booking, AI chat, intake form, CRM. Everything wired together.",
    mock: [
      { tone: "done", label: "Website live" },
      { tone: "done", label: "Booking page live" },
      { tone: "done", label: "AI receptionist trained" },
      { tone: "done", label: "CRM ready" },
    ],
  },
  {
    num: "3",
    title: "Hand it over — or keep it for yourself.",
    body: "Agencies resell it under their own brand. SMBs run it directly. Either way, you own it.",
    mock: [
      { tone: "done", label: "yourcompany.com ↗" },
      { tone: "done", label: "Custom domain connected" },
      { tone: "done", label: "White-label branding" },
      { tone: "done", label: "Client hands-free" },
    ],
  },
];

export function MarketingBuildSteps() {
  return (
    <section
      id="build"
      aria-label="How it works"
      className="border-t border-[rgba(34,29,23,.08)] bg-[#F6F2EA] px-5 py-20 md:px-8 md:py-28 lg:px-12"
    >
      <div className="mx-auto max-w-[1120px]">
        {/* Section head */}
        <div className="max-w-[600px]">
          <div className="inline-flex items-center gap-2.5 text-[12px] font-[600] uppercase tracking-[0.09em] text-[#00897B]">
            <span className="h-px w-4 bg-[#00897B] opacity-50" aria-hidden />
            How it works
          </div>
          <h2 className="mt-3.5 text-[clamp(27px,4.2vw,42px)] font-[500] leading-[1.08] tracking-[-0.025em] text-[#221D17]">
            Paste a URL.{" "}
            <em className="font-[Newsreader,Georgia,serif] font-normal not-italic">
              Done in 60 seconds.
            </em>
          </h2>
          <p className="mt-4 max-w-[54ch] text-[clamp(15.5px,1.9vw,18px)] leading-[1.55] text-[#6E665A]">
            Whether you&rsquo;re setting up your own front office or onboarding a client,
            the flow is identical — and it takes under a minute.
          </p>
        </div>

        {/* Step cards */}
        <div className="mt-12 grid grid-cols-1 gap-4 min-[900px]:grid-cols-3 min-[900px]:gap-5">
          {STEPS.map((step) => (
            <div
              key={step.num}
              className="relative flex flex-col gap-4 overflow-hidden rounded-[18px] border border-[rgba(34,29,23,.08)] bg-[#FFFDFA] p-6 shadow-[0_1px_2px_rgba(34,29,23,.05),0_10px_30px_rgba(34,29,23,.07)]"
            >
              {/* Newsreader italic step number */}
              <span className="font-[Newsreader,Georgia,serif] text-2xl italic text-[#00897B]">
                {step.num}
              </span>
              <h3 className="m-0 text-[16px] font-[600] leading-tight tracking-[-0.01em] text-[#221D17]">
                {step.title}
              </h3>
              <p className="m-0 text-[13.5px] leading-[1.5] text-[#6E665A]">{step.body}</p>

              {/* Mock build log */}
              <div className="mt-auto flex min-h-[130px] flex-col gap-2 rounded-[10px] border border-[rgba(34,29,23,.08)] bg-[#F6F2EA] p-4 font-mono text-[11.5px] text-[#6E665A]">
                {step.mock.map((row, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 ${row.tone === "active" ? "sf-row-active" : ""}`}
                  >
                    <span
                      className={`size-1.5 shrink-0 rounded-sm ${
                        row.tone === "done"
                          ? "bg-[#00897B] shadow-[0_0_6px_rgba(0,137,123,.5)]"
                          : row.tone === "active"
                          ? "sf-blink-dot bg-[#00897B]"
                          : "bg-[#9A9183]/40"
                      }`}
                      aria-hidden
                    />
                    <span className="flex-1">{row.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Summary note */}
        <div className="mt-6 rounded-[16px] border border-[rgba(34,29,23,.08)] bg-[#EFE9DD] px-6 py-5 text-[15px] leading-[1.5] text-[#221D17]">
          Miss a call mid-job?{" "}
          <strong className="font-[600] text-[#00897B]">The AI receptionist texts them back before they dial a competitor</strong> — so every lead stays yours. And once the job&rsquo;s done, the review follow-up quietly asks for a 5-star Google review.
        </div>
      </div>

      <style jsx>{`
        .sf-blink-dot {
          box-shadow: 0 0 0 3px color-mix(in oklab, #00897B 22%, transparent);
          animation: sf-blink 1.4s ease-in-out infinite;
        }
        @keyframes sf-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @media (prefers-reduced-motion: reduce) {
          .sf-blink-dot { animation: none; }
        }
      `}</style>
    </section>
  );
}
