// packages/crm/src/components/landing/marketing-build-steps.tsx
//
// 2026-05-22 — Port of HTML §4 60-SECOND BUILD. Three side-by-side
// step cards (sign-up, paste URL, hand it over) with a mock "build
// log" panel at the bottom of each card. The caret on step 1's
// workspace name is the blinking text caret from the HTML; step 2's
// "Building workspace…" row carries the active dot (sf-blink); step
// 3's rows are all done (solid teal dots).
//
// "use client" is required because the component uses <style jsx>
// for the caret + dot blink keyframes; styled-jsx can't be imported
// from a server module. No client-side state — could be a pure
// server component otherwise.

"use client";

import { MarketingHeadlineMuted, MarketingSectionHead } from "./marketing-section-head";

type MockRow = { tone: "idle" | "active" | "done"; label: React.ReactNode };
type Step = {
  num: "01" | "02" | "03";
  title: string;
  body: string;
  mock: readonly MockRow[];
};

const STEPS: readonly Step[] = [
  {
    num: "01",
    title: "Sign up.",
    body: "One screen. Email and a workspace name. No demo call, no sales rep.",
    mock: [
      { tone: "idle", label: "Email" },
      { tone: "idle", label: <span className="font-mono text-zinc-100">you@youragency.com</span> },
      { tone: "idle", label: "Workspace" },
      {
        tone: "idle",
        label: (
          <span className="font-mono text-zinc-100">
            northstar-digital<span className="sf-caret ml-0.5 inline-block h-3.5 w-px align-middle bg-[#2dd4bf]" aria-hidden />
          </span>
        ),
      },
    ],
  },
  {
    num: "02",
    title: "Paste your client's URL.",
    body: "Or paste their business info from Google Maps — we'll figure out the rest.",
    mock: [
      { tone: "idle", label: "URL" },
      { tone: "idle", label: <span className="font-mono text-zinc-100">https://stocktonheating.com</span> },
      { tone: "active", label: "Building workspace…" },
      { tone: "idle", label: "Soul compiled" },
    ],
  },
  {
    num: "03",
    title: "Hand it over.",
    body: "Workspace is yours to brand, edit, and resell. White-labeled on Scale.",
    mock: [
      { tone: "done", label: "CRM live" },
      { tone: "done", label: "Booking page live" },
      { tone: "done", label: "Intake form live" },
      { tone: "done", label: "AI chatbot trained" },
    ],
  },
];

export function MarketingBuildSteps() {
  return (
    <section
      id="build"
      aria-label="60-second build"
      className="relative isolate border-y border-zinc-900 bg-[#0c0c0e] px-5 py-24 md:px-8 md:py-32 lg:px-12 lg:py-36"
    >
      <div className="mx-auto max-w-[1200px]">
        <MarketingSectionHead
          eyebrow="From URL to workspace"
          headline={
            <>
              Three clicks. <MarketingHeadlineMuted>Sub-minute build.</MarketingHeadlineMuted>
            </>
          }
          sub="You watch the build run live so you can hand it off, not babysit it. Same flow whether you paste a URL or business info."
        />

        <div className="grid grid-cols-1 gap-[18px] min-[900px]:grid-cols-3 min-[900px]:gap-[22px]">
          {STEPS.map((step) => (
            <div
              key={step.num}
              className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
            >
              <span className="inline-flex size-8 items-center justify-center rounded-lg border border-[color-mix(in_oklab,#14b8a6_30%,transparent)] bg-[color-mix(in_oklab,#14b8a6_14%,#27272a)] font-mono text-[13px] font-semibold text-[#5eead4]">
                {step.num}
              </span>
              <h3 className="m-0 font-display text-xl font-semibold leading-tight tracking-[-0.018em] text-zinc-50">
                {step.title}
              </h3>
              <p className="m-0 text-sm leading-[1.55] text-zinc-400">{step.body}</p>

              <div className="mt-auto flex min-h-[140px] flex-col gap-2 rounded-[10px] border border-zinc-800 bg-[#09090b] p-4 font-mono text-[11.5px] text-zinc-400">
                {step.mock.map((row, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 ${row.tone === "active" ? "sf-row-active" : ""}`}
                  >
                    <span
                      className={`size-1.5 shrink-0 rounded-sm ${
                        row.tone === "done"
                          ? "bg-[#2dd4bf] shadow-[0_0_8px_#2dd4bf]"
                          : row.tone === "active"
                          ? "sf-blink-dot bg-[#2dd4bf]"
                          : "bg-zinc-700"
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
      </div>

      <style jsx>{`
        .sf-caret {
          animation: blink-caret 1s infinite;
        }
        .sf-blink-dot {
          box-shadow: 0 0 0 3px color-mix(in oklab, #2dd4bf 22%, transparent);
          animation: sf-blink 1.4s ease-in-out infinite;
        }
        @keyframes blink-caret {
          50% {
            opacity: 0;
          }
        }
        @keyframes sf-blink {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.45;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .sf-caret,
          .sf-blink-dot {
            animation: none;
          }
        }
      `}</style>
    </section>
  );
}
