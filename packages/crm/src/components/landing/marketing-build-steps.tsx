// packages/crm/src/components/landing/marketing-build-steps.tsx
//
// Redesign 2026-06-18 — warm light aesthetic + ANIMATED build log.
// "How it works" — 3-step flow. Paper/card surface, Newsreader italic
// accent numbers, SeldonFrame green (#1F2B24) for active/done dots.
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

import { IntegrationBeam } from "@/components/landing/integration-beam";

// Shared spring-ish ease used everywhere (the brief's cubic-bezier).
const EASE = [0.22, 1, 0.36, 1] as const;

// Two on-ramps. Path A: describe the agent you're MISSING → Seldon generates it.
// Path B: record the workflow you already DO → Seldon compiles it.
type Path = {
  kicker: string;
  arrow: string;
  title: ReactNode;
  steps: readonly string[];
  mock: ReactNode;
  figure?: ReactNode;
};

const PATHS: readonly Path[] = [
  {
    kicker: "Describe it",
    arrow: "we generate it",
    title: (
      <>
        You know what the client needs.{" "}
        <em className="font-[Newsreader,Georgia,serif] font-normal not-italic">Describe it.</em>
      </>
    ),
    steps: ["Paste your client's URL or describe their business", "Watch it build — site, booking, CRM, agent", "Go live on your client's domain"],
    mock: <ScanMock />,
    figure: <IntegrationBeam />,
  },
  {
    kicker: "Record it",
    arrow: "we compile it",
    title: (
      <>
        You already do it for clients.{" "}
        <em className="font-[Newsreader,Georgia,serif] font-normal not-italic">Record it.</em>
      </>
    ),
    steps: ["Screen-record the workflow — on desktop or mobile", "Answer what the recording didn't show", "Get a tested agent you can switch on — for any client"],
    mock: <RecordMock />,
    figure: <RecordFigure />,
  },
];

export function MarketingBuildSteps() {
  return (
    <section
      id="build"
      aria-label="How it works"
      className="border-t border-[rgba(34,29,23,.08)] px-5 py-20 md:px-8 md:py-28 lg:px-12"
    >
      <div className="mx-auto max-w-[1120px]">
        {/* Section head */}
        <div className="mx-auto max-w-[680px] text-center">
          <div className="inline-flex items-center gap-2.5 text-[12px] font-[600] uppercase tracking-[0.09em] text-[#1F2B24]">
            <span className="h-px w-4 bg-[#1F2B24] opacity-50" aria-hidden />
            How it works
          </div>
          <h2 className="mt-3.5 text-[clamp(27px,4.2vw,42px)] font-[500] leading-[1.08] tracking-[-0.025em] text-[#221D17]">
            Two ways in.{" "}
            <em className="font-[Newsreader,Georgia,serif] font-normal not-italic">
              Both live in minutes.
            </em>
          </h2>
        </div>

        {/* Two path cards */}
        <div className="mt-12 grid grid-cols-1 gap-5 min-[900px]:grid-cols-2">
          {PATHS.map((path) => (
            <div
              key={path.kicker}
              className="relative flex flex-col gap-4 overflow-hidden rounded-[20px] border border-[rgba(34,29,23,.08)] bg-[#FFFDFA] p-7 shadow-[0_1px_2px_rgba(34,29,23,.05),0_10px_30px_rgba(34,29,23,.07)]"
            >
              {/* Path badge */}
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[rgba(31, 43, 36,.1)] px-2.5 py-1 text-[11px] font-[700] uppercase tracking-[0.06em] text-[#1F2B24]">
                  {path.kicker}
                </span>
                <span className="text-[12px] font-[500] text-[#9A9183]">→ {path.arrow}</span>
              </div>

              <h3 className="m-0 text-[clamp(19px,2.4vw,23px)] font-[500] leading-[1.12] tracking-[-0.02em] text-[#221D17]">
                {path.title}
              </h3>

              {/* Three mini-steps */}
              <ol className="m-0 flex flex-col gap-2 p-0">
                {path.steps.map((s, i) => (
                  <li key={s} className="flex items-center gap-2.5 text-[13px] text-[#221D17]">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[rgba(31, 43, 36,.1)] text-[11px] font-[700] text-[#1F2B24]">
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>

              {/* Animated mock */}
              <div className="mt-2">{path.mock}</div>
              {path.figure ? <div className="mt-2">{path.figure}</div> : null}
            </div>
          ))}
        </div>

      </div>

      <style jsx>{`
        .sf-blink-dot {
          box-shadow: 0 0 0 3px color-mix(in oklab, #1F2B24 22%, transparent);
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
          ? "bg-[#1F2B24] shadow-[0_0_6px_rgba(31, 43, 36,.5)]"
          : tone === "active"
          ? "sf-blink-dot bg-[#1F2B24]"
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
              className="ml-0.5 inline-block h-3 w-px translate-y-[2px] bg-[#1F2B24] align-middle"
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
   RECORD — the Path-B mock: REC (red, pulsing) → reads frames + narration →
   compiles → agent ready. Same LogFrame + step-clock idiom as ScanMock.
   ════════════════════════════════════════════════════════════════════════ */

// 0 idle → 1 recording → 2 compiling (dot blinks) → 3 compiled (done) → 4 hold
function RecordMock() {
  const reduce = useReducedMotion() ?? false;
  const [ref, inView] = useInViewRef<HTMLDivElement>();
  const step = useStepClock(5, 1100, inView, reduce);

  const recording = reduce || step >= 1;
  const compiling = !reduce && step === 2;
  const compiled = reduce || step >= 3;

  return (
    <LogFrame innerRef={ref}>
      {/* recording row — red dot pulses while capturing */}
      <div className="flex items-center gap-2">
        <motion.span
          className="size-1.5 shrink-0 rounded-sm bg-[#E5484D]"
          animate={recording && !reduce ? { opacity: [1, 0.35, 1] } : { opacity: recording ? 1 : 0.4 }}
          transition={{ duration: 1.2, repeat: recording && !reduce ? Infinity : 0, ease: "easeInOut" }}
          aria-hidden
        />
        <span className={`flex-1 ${recording ? "text-[#221D17]" : ""}`}>
          {recording ? "REC — capturing your workflow" : "Ready to record"}
        </span>
      </div>

      {/* reading → compiled */}
      <motion.div
        className="flex items-center gap-2"
        animate={{ opacity: recording ? 1 : 0.35 }}
        transition={{ duration: 0.3, ease: EASE }}
      >
        <StatusDot tone={compiled ? "done" : compiling ? "active" : "idle"} />
        <span className={`flex-1 ${compiled ? "text-[#221D17]" : ""}`}>
          {compiled ? "Steps + tools compiled" : "Reading frames + narration…"}
        </span>
      </motion.div>

      {/* agent ready */}
      <motion.div
        className="flex items-center gap-2"
        animate={{ opacity: compiled ? 1 : 0.35 }}
        transition={{ duration: 0.3, ease: EASE }}
      >
        <StatusDot tone={compiled ? "done" : "idle"} />
        <span className={`flex-1 ${compiled ? "text-[#221D17]" : ""}`}>
          {compiled ? "Agent ready to test" : "Agent"}
        </span>
      </motion.div>
    </LogFrame>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   RECORD figure — the Path-B counterpart to the IntegrationBeam box: a small
   "screen recording → compiled agent" still, so both path cards carry equal
   visual weight.
   ════════════════════════════════════════════════════════════════════════ */

function RecordFigure() {
  const CAPTURED = [
    "Opened Gmail, read the thread",
    "Labeled + archived 4 messages",
    "Logged the lead to the sheet",
  ];
  return (
    <div className="flex min-h-[220px] w-full flex-col justify-between overflow-hidden rounded-[10px] border border-[rgba(34,29,23,.08)] bg-[#F6F2EA] p-5">
      {/* window chrome + REC badge */}
      <div className="flex items-center justify-between">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2 rounded-full bg-[#E5484D]/70" />
          <span className="size-2 rounded-full bg-[#FEBC2E]/70" />
          <span className="size-2 rounded-full bg-[#28C840]/70" />
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(229,72,77,.1)] px-2 py-0.5 text-[10.5px] font-[700] uppercase tracking-[0.06em] text-[#E5484D]">
          <span className="size-1.5 rounded-full bg-[#E5484D]" /> REC 0:14
        </span>
      </div>

      {/* captured steps */}
      <div className="flex flex-col gap-1.5 font-mono text-[11.5px] text-[#6E665A]">
        {CAPTURED.map((c) => (
          <div key={c} className="flex items-center gap-2">
            <span className="size-1.5 shrink-0 rounded-sm bg-[#1F2B24]" aria-hidden />
            <span className="truncate">{c}</span>
          </div>
        ))}
      </div>

      {/* compiled result */}
      <div className="flex items-center gap-2 rounded-[9px] border border-[rgba(31, 43, 36,.28)] bg-[rgba(31, 43, 36,.06)] px-3 py-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#1F2B24] text-[11px] font-[800] text-[#FFFDFA]" aria-hidden>✓</span>
        <span className="text-[12.5px] font-[600] text-[#221D17]">Inbox-triage agent — compiled, ready to test</span>
      </div>
    </div>
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
