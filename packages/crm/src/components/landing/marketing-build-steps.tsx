// packages/crm/src/components/landing/marketing-build-steps.tsx
//
// Redesign 2026-06-18 — warm light aesthetic + ANIMATED build log.
// "How it works" — 3-step flow. Paper/card surface, Newsreader italic
// accent numbers, SeldonFrame green (#00897B) for active/done dots.
//
// Each step card's terminal-style "mock" rows now animate, mirroring the
// motion idiom shipped in marketing-modules.tsx:
//   • framer-motion, transform + opacity only (GPU-friendly), ~250–550ms,
//     ease cubic-bezier(.22,1,.36,1).
//   • A small step-clock loops each scene, ticking only while the card is in
//     view (useInView, once:false) so off-screen cards burn no timers and the
//     loop replays cleanly each time the card scrolls back into view.
//   • prefers-reduced-motion → every scene renders its meaningful END state
//     statically (URL typed + soul compiled; all rows present + done). Gated
//     via useReducedMotion() so the clock pins the final step.
// The section chrome, step numbers, titles, and copy are unchanged.

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";

// Shared spring-ish ease used everywhere (the brief's cubic-bezier).
const EASE = [0.22, 1, 0.36, 1] as const;

type Step = {
  num: string;
  title: string;
  body: string;
  mock: ReactNode;
};

const STEPS: readonly Step[] = [
  {
    num: "1",
    title: "Paste a URL — or describe the business.",
    body: "Your client's website, or a quick Google Maps description. We'll build from either.",
    mock: <ScanMock />,
  },
  {
    num: "2",
    title: "Watch it spin up in 60 seconds.",
    body: "The build runs live — website, booking, intake, CRM, and a 24/7 AI agent that answers across voice, SMS, chat, and email. Everything wired together.",
    mock: (
      <ArriveMock
        rows={[
          "Website live",
          "Booking page live",
          "AI receptionist trained",
          "CRM ready",
        ]}
      />
    ),
  },
  {
    num: "3",
    title: "Hand it over — or keep it for yourself.",
    body: "Agencies resell it under their own brand. SMBs run it directly. Either way, you own it.",
    mock: (
      <ArriveMock
        rows={[
          { label: "Custom domain connected", emphasis: true },
          "Your branding applied",
          "Hands-free",
        ]}
      />
    ),
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

              {/* Animated build log */}
              <div className="mt-auto">{step.mock}</div>
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
          box-shadow: 0 0 0 3px color-mix(in oklab, #00897b 22%, transparent);
          animation: sf-blink 1.4s ease-in-out infinite;
        }
        @keyframes sf-blink {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.4;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .sf-blink-dot {
            animation: none;
          }
        }
      `}</style>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Motion plumbing (self-contained copies of the marketing-modules idiom)
   ════════════════════════════════════════════════════════════════════════ */

/** Ref + boolean: is this node currently in the viewport? Gates the step-clock
 *  so off-screen cards don't burn timers, and so loops restart cleanly each
 *  time the card scrolls back in (viewport once:false). */
function useInViewRef<T extends Element>(amount = 0.4) {
  const ref = useRef<T>(null);
  const inView = useInView(ref, { amount });
  return [ref, inView] as const;
}

/**
 * Step-clock for a looping scene. Returns the current `step` (0…steps-1).
 * Advances on `intervalMs` only while `active`. The counter resets the render
 * an inactive→active transition happens (React's sanctioned "adjust state
 * during render" pattern) so the scene replays from step 0 each re-entry.
 * When `reduce` is true the value short-circuits to the final step — callers
 * also render the static end-state for reduced motion.
 */
function useStepClock(steps: number, intervalMs: number, active: boolean, reduce: boolean) {
  const [tick, setTick] = useState(0);
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setTick(0);
  }

  useEffect(() => {
    if (reduce || !active) return;
    const id = window.setInterval(() => {
      setTick((t) => (t + 1) % steps);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [steps, intervalMs, active, reduce]);

  if (reduce) return steps - 1; // pin final state for reduced motion
  if (!active) return 0; // off-screen → reset to the top
  return tick;
}

/** Shared terminal-log frame for every step mock. */
function LogFrame({
  children,
  innerRef,
}: {
  children: ReactNode;
  innerRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={innerRef}
      className="flex min-h-[130px] flex-col gap-2 rounded-[10px] border border-[rgba(34,29,23,.08)] bg-[#F6F2EA] p-4 font-mono text-[11.5px] text-[#6E665A]"
    >
      {children}
    </div>
  );
}

/** Status dot, matching the original tones (idle / active / done). The active
 *  tone reuses the existing sf-blink-dot keyframe; done glows green. */
function StatusDot({ tone }: { tone: "idle" | "active" | "done" }) {
  return (
    <span
      className={`size-1.5 shrink-0 rounded-sm ${
        tone === "done"
          ? "bg-[#00897B] shadow-[0_0_6px_rgba(0,137,123,.5)]"
          : tone === "active"
          ? "sf-blink-dot bg-[#00897B]"
          : "bg-[#9A9183]/40"
      }`}
      aria-hidden
    />
  );
}

/* ════════════════════════════════════════════════════════════════════════
   STEP 1 — Scan: idle prompt → URL types in → "Scanning…" (blinks) → compiled
   ════════════════════════════════════════════════════════════════════════ */

// Steps (one clock, 5 × ~1100ms ≈ 5.5s):
//   0 idle prompt only ("URL or business info")
//   1 URL row types in
//   2 "Scanning business info…" turns active (dot blinks)
//   3 resolves to "Soul compiled" (done/green)
//   4 hold → loop resets to 0
const SCAN_URL = "https://stocktonheating.com";

function ScanMock() {
  const reduce = useReducedMotion() ?? false;
  const [ref, inView] = useInViewRef<HTMLDivElement>();
  const step = useStepClock(5, 1100, inView, reduce);

  const urlIn = reduce || step >= 1;
  const scanning = !reduce && step === 2;
  const compiled = reduce || step >= 3;

  return (
    <LogFrame innerRef={ref}>
      {/* idle prompt */}
      <div className="flex items-center gap-2">
        <StatusDot tone="idle" />
        <span className="flex-1">URL or business info</span>
      </div>

      {/* URL typed into the input row */}
      <div className="flex items-center gap-2" aria-hidden={!urlIn}>
        <StatusDot tone={urlIn ? "active" : "idle"} />
        <span className="flex-1 truncate text-[#221D17]">
          {urlIn ? <TypedText text={SCAN_URL} animate={!reduce && step === 1} /> : <span className="opacity-0">.</span>}
          {!reduce && step === 1 ? (
            <motion.span
              aria-hidden
              className="ml-0.5 inline-block h-3 w-px translate-y-[2px] bg-[#00897B] align-middle"
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }}
            />
          ) : null}
        </span>
      </div>

      {/* Scanning → Soul compiled (the row swaps tone + label) */}
      <motion.div
        className="flex items-center gap-2"
        animate={{ opacity: urlIn ? 1 : 0.35 }}
        transition={{ duration: 0.3, ease: EASE }}
      >
        <StatusDot tone={compiled ? "done" : scanning ? "active" : "idle"} />
        <span className={`flex-1 ${compiled ? "text-[#221D17]" : ""}`}>
          {compiled ? "Soul compiled" : "Scanning business info…"}
        </span>
      </motion.div>
    </LogFrame>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   STEPS 2 & 3 — Arrive: done-rows slide in from the left, staggered, each with
   a green-dot pulse on arrival, then settle. Reusable for both cards.
   ════════════════════════════════════════════════════════════════════════ */

type ArriveRow = string | { label: string; emphasis?: boolean };

function normalizeRow(row: ArriveRow): { label: string; emphasis: boolean } {
  return typeof row === "string" ? { label: row, emphasis: false } : { label: row.label, emphasis: !!row.emphasis };
}

function ArriveMock({ rows }: { rows: readonly ArriveRow[] }) {
  const reduce = useReducedMotion() ?? false;
  const [ref, inView] = useInViewRef<HTMLDivElement>();
  // One tick per row arrival (~700ms apart → close to the ~200ms-stagger feel
  // once you account for each row's own slide), then a hold before resetting.
  const HOLD = 2;
  const steps = rows.length + HOLD;
  const step = useStepClock(steps, 700, inView, reduce);

  return (
    <LogFrame innerRef={ref}>
      {rows.map((raw, i) => {
        const { label, emphasis } = normalizeRow(raw);
        const visible = reduce || step >= i;
        // The row "just arrived" on the exact tick it appears → pulse the dot.
        const justArrived = !reduce && step === i;
        return (
          <motion.div
            key={label}
            initial={false}
            animate={{ opacity: visible ? 1 : 0, x: visible ? 0 : -10 }}
            transition={{ duration: 0.34, ease: EASE }}
            className="flex items-center gap-2"
          >
            <motion.span
              className="flex size-1.5 shrink-0 items-center justify-center"
              animate={justArrived ? { scale: [1, 1.5, 1] } : { scale: 1 }}
              transition={{ duration: 0.45, ease: EASE }}
            >
              <StatusDot tone={visible ? "done" : "idle"} />
            </motion.span>
            <span className={`flex-1 ${visible ? "text-[#221D17]" : ""}`}>{label}</span>
            {emphasis ? (
              <motion.span
                aria-hidden
                className="shrink-0 text-[#00897B]"
                initial={false}
                animate={{ opacity: visible ? 1 : 0, scale: visible ? 1 : 0.6 }}
                transition={{ duration: 0.32, ease: EASE, delay: justArrived ? 0.12 : 0 }}
              >
                <LinkCheck className="size-3.5" />
              </motion.span>
            ) : null}
          </motion.div>
        );
      })}
    </LogFrame>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Small shared bits
   ════════════════════════════════════════════════════════════════════════ */

/** Reveals `text` left-to-right via a GPU-composited clip when `animate`;
 *  static otherwise. (clip-path inset doesn't reflow or distort glyphs.) */
function TypedText({ text, animate }: { text: string; animate: boolean }) {
  if (!animate) return <span>{text}</span>;
  return (
    <motion.span
      initial={{ clipPath: "inset(0 100% 0 0)" }}
      animate={{ clipPath: "inset(0 0% 0 0)" }}
      transition={{ duration: 0.55, ease: EASE }}
      className="inline-block whitespace-nowrap align-middle"
    >
      {text}
    </motion.span>
  );
}

/** Tiny link + check cue for the custom-domain emphasis row. */
function LinkCheck({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M9 17H7A5 5 0 0 1 7 7h2m6 0h2a5 5 0 0 1 1.5 9.75M9 12h6"
        stroke="#00897B"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
