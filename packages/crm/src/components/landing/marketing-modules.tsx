"use client";

// packages/crm/src/components/landing/marketing-modules.tsx
//
// Redesign 2026-06-18 — warm light aesthetic + ANIMATED product demos.
// "What you get" — feature cards. White card surfaces on paper background,
// SeldonFrame green (#1F2B24) accent icons, Newsreader italic headline.
//
// Each feature card holds a faithful, self-contained animated replica of the
// real product surface (CRM table row, booking page + operator calendar, intake
// form, AI chat, SMS thread, review request). The mocks mirror the styling of
// the real components (contacts-table-view, week-calendar, booking-card,
// public-form) without importing those heavy client trees.
//
// Motion contract (matches landing-r1/_shared/motion.tsx idiom):
//   • framer-motion, transform + opacity only (GPU-friendly), ~150–450ms,
//     ease cubic-bezier(.22,1,.36,1).
//   • Looping scenes run on a small step-clock that only ticks while the card
//     is in view (useInView) — calm, ambient, with a clean reset each cycle.
//   • prefers-reduced-motion → every scene renders its meaningful END state
//     statically (rows present, "Booked", form submitted, full threads). Gated
//     via useReducedMotion() so no motion components mount at all.

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { motion, useInView, useReducedMotion } from "framer-motion";
import {
  Calendar,
  FileText,
  MessageSquare,
  Phone,
  Star,
  Users,
} from "lucide-react";
import { BentoGrid, BentoCard } from "@/components/ui/magic/bento-grid";
import { MarketingAgentMarquee } from "@/components/landing/marketing-agent-marquee";
import { AnimatedShinyText } from "@/components/ui/magic/animated-shiny-text";

// Shared spring-ish ease used everywhere (the brief's cubic-bezier).
const EASE = [0.22, 1, 0.36, 1] as const;

const FEATURES = [
  {
    icon: Users,
    title: "CRM",
    body: "Leads, deals, tasks, and notes — all tied to the contact, not a spreadsheet. Built for local service businesses.",
    mock: <CrmMock />,
  },
  {
    icon: Calendar,
    title: "Booking page",
    body: "Calendar-first booking tied to live availability. Confirmed bookings flow straight into the CRM.",
    mock: <BookingMock />,
  },
  {
    icon: FileText,
    title: "Intake form",
    body: "Pre-qualified leads with full context — logic-aware fields adapt by service type.",
    mock: <FormMock />,
  },
  {
    icon: MessageSquare,
    title: "A receptionist that books",
    body: "Not just a chatbot — it answers, qualifies, and books the job straight into your calendar, in your own voice. Never miss a lead.",
    mock: <ChatMock />,
  },
  {
    icon: Phone,
    title: "Missed-call text-back",
    body: "Can't pick up? It texts them back in seconds — before they dial the next company.",
    mock: <SmsMock />,
  },
  {
    icon: Star,
    title: "Review Requester",
    body: "After a good job, it quietly asks happy customers for a 5-star Google review at exactly the right moment.",
    mock: <ReviewMock />,
  },
] as const;


export function MarketingModules() {
  return (
    <section
      id="modules"
      aria-label="Features"
      className="border-t border-[rgba(34,29,23,.08)] px-5 py-20 md:px-8 md:py-28 lg:px-12"
    >
      <div className="mx-auto max-w-[1120px]">
        {/* Section head */}
        <div className="section-head-center text-center">
          <div className="inline-flex items-center justify-center gap-2.5 text-[12px] font-[600] uppercase tracking-[0.09em] text-[#1F2B24]">
            <span className="h-px w-4 bg-[#1F2B24] opacity-50" aria-hidden />
            Run your business
            <span className="h-px w-4 bg-[#1F2B24] opacity-50" aria-hidden />
          </div>
          <h2 className="mx-auto mt-3.5 max-w-[20ch] text-[clamp(27px,4.2vw,42px)] font-[500] leading-[1.08] tracking-[-0.025em] text-[#221D17]">
            Your whole front office —{" "}
            <em className="font-[Newsreader,Georgia,serif] font-normal not-italic">
              wired together.
            </em>
          </h2>
          <p className="mx-auto mt-4 max-w-[56ch] text-[clamp(15.5px,1.9vw,18px)] leading-[1.55] text-[#6E665A]">
            <AnimatedShinyText base="rgba(110,102,90,1)" shine="#221D17">
              A multi-page website, booking page, intake form, CRM, payments, and a 24/7
              receptionist that books the job
            </AnimatedShinyText>{" "}
            — one connected system, so you never miss a lead. Change a phone number once
            and everything updates, instantly.
          </p>
        </div>

        {/* Feature grid — one BentoCard per module (Task 9 reflow) */}
        <BentoGrid className="mt-12 grid-cols-1 auto-rows-auto gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feat) => (
            <BentoCard
              key={feat.title}
              name={feat.title}
              description={feat.body}
              Icon={feat.icon}
              className="col-span-1"
              background={<div className="p-6 pb-0">{feat.mock}</div>}
              forceStatic
            />
          ))}
        </BentoGrid>

      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   "Hire agents" — the demand-side rung of the ladder.
   Promoted out of the Modules section (2026-06-22 positioning v2) into its
   own section so the homepage holds one idea per rung. Deep-green #1F2B24
   slab (the seldonstudio dark-block pattern), SeldonFrame green accents.
   ════════════════════════════════════════════════════════════════════════ */

export function MarketingAgents() {
  return (
    <section
      id="agents"
      aria-label="Hire agents"
      className="overflow-hidden border-t border-[rgba(34,29,23,.08)] bg-[#1F2B24] px-5 py-20 md:px-8 md:py-28 lg:px-12"
    >
      <div className="mx-auto max-w-[1120px]">
        {/* Section head — the two on-ramps */}
        <div className="mx-auto max-w-[680px] text-center">
          <div className="inline-flex items-center gap-2.5 text-[12px] font-[700] uppercase tracking-[0.09em] text-[#F6F2EA]">
            <span className="h-px w-4 bg-[rgba(246, 242, 234,.6)]" aria-hidden />
            Hire agents
          </div>
          <h2 className="mt-3.5 text-[clamp(27px,4.2vw,42px)] font-[500] leading-[1.08] tracking-[-0.025em] text-[#F6F2EA]">
            Two ways to build an agent.
          </h2>
          <p className="mx-auto mt-4 max-w-[58ch] text-[clamp(15.5px,1.9vw,18px)] leading-[1.55] text-[rgba(246,242,234,.9)]">
            <strong className="font-[500] text-[#FFFDFA]">Describe what you&apos;re missing</strong> and Seldon generates it,
            or <strong className="font-[500] text-[#FFFDFA]">record what you already do</strong> and Seldon compiles it. Either
            way you get a 24/7 worker for pennies — not an employee or an agency.
          </p>
        </div>

        {/* The two catalogs, scrolling */}
        <MarketingAgentMarquee />

        {/* CTAs */}
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 rounded-[11px] bg-[#F6F2EA] px-5 py-3 text-[14px] font-[600] text-[#1F2B24] transition-transform hover:-translate-y-px"
          >
            Browse the agent marketplace →
          </Link>
          <Link
            href="/build"
            className="inline-flex items-center gap-2 rounded-[11px] border border-[rgba(255,255,255,.22)] bg-transparent px-5 py-3 text-[14px] font-[500] text-[rgba(246,242,234,.9)] transition-colors hover:border-[rgba(255,255,255,.4)]"
          >
            Or build your own in the Studio →
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Motion plumbing
   ════════════════════════════════════════════════════════════════════════ */

/** Ref + boolean: is this node currently in the viewport? Used to gate the
 *  step-clocks so off-screen cards don't burn timers (and so loops restart
 *  cleanly each time the card scrolls back in — viewport once:false). */
function useInViewRef<T extends Element>(amount = 0.4) {
  const ref = useRef<T>(null);
  const inView = useInView(ref, { amount });
  return [ref, inView] as const;
}

/**
 * Step-clock for a looping scene. Returns the current `step` (0…steps-1).
 * Advances on `intervalMs` only while `active`; the ticking counter is reset
 * by the effect re-running when `active` flips, so the next entry replays from
 * the top. When `reduce` is true (or the card is off-screen) the *derived*
 * value below short-circuits — callers also render the static end-state for
 * reduced motion, so the final step is pinned. We never call setState
 * synchronously in the effect body (only inside the interval callback, the one
 * legitimate external-system subscription), so there are no cascading renders.
 */
function useStepClock(steps: number, intervalMs: number, active: boolean, reduce: boolean) {
  const [tick, setTick] = useState(0);
  // Reset the counter the render an inactive→active transition happens, using
  // React's sanctioned "adjust state during render" pattern (preferable to a
  // setState-in-effect, which lint flags as a cascading-render risk). This
  // guarantees a clean replay from step 0 every time the card re-enters view.
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

/** Shared frame for every mock — the inset "screen" panel. */
function MockFrame({
  children,
  className = "",
  innerRef,
}: {
  children: ReactNode;
  className?: string;
  innerRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={innerRef}
      className={`rounded-[10px] border border-[rgba(34,29,23,.08)] bg-[#F6F2EA] p-3.5 ${className}`}
    >
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   1 — CRM  (mini /contacts table; 4 rows arrive staggered, one badge updates)
   ════════════════════════════════════════════════════════════════════════ */

type CrmTone = "new" | "warm" | "book";

const CRM_TAG: Record<CrmTone, string> = {
  // sky = new, amber = warm, emerald = booked — light tint bg + dark same-family
  // text, mirroring contacts-table-view STAGE_PALETTE.
  new: "bg-[rgba(2,132,199,.12)] text-[#0369a1]",
  warm: "bg-[rgba(234,179,8,.14)] text-[#a16207]",
  book: "bg-[rgba(16,185,129,.14)] text-[#16201B]",
};

function crmTagLabel(tone: CrmTone) {
  return tone === "book" ? "BOOKED" : tone.toUpperCase();
}

function CrmMock() {
  const reduce = useReducedMotion() ?? false;
  const [ref, inView] = useInViewRef<HTMLDivElement>();

  const rows: { name: string; tone: CrmTone; amount: string }[] = [
    { name: "Diane M.", tone: "new", amount: "$1,840" },
    { name: "Marcus V.", tone: "warm", amount: "$4,200" },
    { name: "Hartmann Fmly.", tone: "book", amount: "$2,650" },
    { name: "Reyes Co.", tone: "new", amount: "$980" },
  ];

  // Phased loop: land 4 rows (steps 0–3), then a beat, then the last "NEW" row
  // (Reyes Co.) promotes to WARM with a pulse (step 5), hold, reset.
  // 7 steps × ~900ms ≈ 6.3s cycle.
  const step = useStepClock(7, 900, inView, reduce);
  const promoted = reduce || step >= 5;

  return (
    <MockFrame innerRef={ref} className="flex flex-col gap-2 font-mono text-[11.5px]">
      {rows.map((row, i) => {
        const visible = reduce || step >= i;
        const isPromoteRow = i === rows.length - 1; // Reyes Co.
        const tone: CrmTone = isPromoteRow && promoted ? "warm" : row.tone;
        return (
          <motion.div
            key={row.name}
            initial={false}
            animate={{
              opacity: visible ? 1 : 0,
              y: visible ? 0 : 8,
            }}
            transition={{ duration: 0.32, ease: EASE }}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-2.5 rounded-md border border-[rgba(34,29,23,.08)] bg-[#FFFDFA] px-2 py-1.5"
          >
            <span className="font-[500] text-[#221D17]">{row.name}</span>
            <motion.span
              // Soft pulse on the row that flips NEW → WARM.
              animate={
                isPromoteRow && promoted && !reduce
                  ? { scale: [1, 1.14, 1] }
                  : { scale: 1 }
              }
              transition={{ duration: 0.45, ease: EASE }}
              className={`rounded px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.06em] ${CRM_TAG[tone]}`}
            >
              {crmTagLabel(tone)}
            </motion.span>
            <span className="tabular-nums text-[#6E665A]">{row.amount}</span>
          </motion.div>
        );
      })}
    </MockFrame>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   2 — BOOKING  (showcase: public booking page → operator calendar)
   ════════════════════════════════════════════════════════════════════════ */

// Sequence (one shared clock, ~8 steps × 950ms ≈ 7.6s):
//   0 week row shown, Wed highlighting
//   1 slot pills fade in
//   2 "4:15" selects (fills green)
//   3 Confirm → "Booked — Wed 4:15 PM"
//   4 event block scales/slides into the operator calendar at Wed 4:15
//   5 "just arrived" green ring flash on the event
//   6 hold (both halves settled)
//   7 hold → loop resets to 0
const BOOKING_DAYS = [
  { d: "Mon", n: "16" },
  { d: "Tue", n: "17" },
  { d: "Wed", n: "18" },
  { d: "Thu", n: "19" },
  { d: "Fri", n: "20" },
] as const;
const BOOKING_SLOTS = ["3:30", "4:15", "5:00"] as const;
const WED_INDEX = 2;

function BookingMock() {
  const reduce = useReducedMotion() ?? false;
  const [ref, inView] = useInViewRef<HTMLDivElement>();
  const step = useStepClock(8, 950, inView, reduce);

  const slotsIn = reduce || step >= 1;
  const selected = reduce || step >= 2;
  const booked = reduce || step >= 3;
  const eventIn = reduce || step >= 4;
  const justArrived = !reduce && step === 5;

  return (
    <MockFrame innerRef={ref} className="flex flex-col gap-2.5">
      {/* ── TOP: public booking page ─────────────────────────────────── */}
      <div className="rounded-[8px] border border-[rgba(34,29,23,.08)] bg-[#FFFDFA] p-2.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-sans text-[10px] font-[600] uppercase tracking-[0.08em] text-[#9A9183]">
            Pick a time
          </span>
          <span className="font-sans text-[10px] text-[#9A9183]">Jun 16–20</span>
        </div>

        {/* Mini week row — Wed highlights */}
        <div className="grid grid-cols-5 gap-1">
          {BOOKING_DAYS.map((day, i) => {
            const isWed = i === WED_INDEX;
            return (
              <div
                key={day.d}
                className={`flex flex-col items-center gap-0.5 rounded-md border py-1 transition-colors duration-300 ${
                  isWed
                    ? "border-[rgba(31, 43, 36,.45)] bg-[rgba(31, 43, 36,.10)]"
                    : "border-[rgba(34,29,23,.07)] bg-[#F6F2EA]"
                }`}
              >
                <span
                  className={`font-sans text-[8.5px] uppercase tracking-[0.06em] ${
                    isWed ? "text-[#0F6E56]" : "text-[#9A9183]"
                  }`}
                >
                  {day.d}
                </span>
                <span
                  className={`font-mono text-[12px] font-[600] leading-none ${
                    isWed ? "text-[#0F6E56]" : "text-[#221D17]"
                  }`}
                >
                  {day.n}
                </span>
              </div>
            );
          })}
        </div>

        {/* Slot pills — fade in, then 4:15 selects */}
        <div className="mt-2 grid grid-cols-3 gap-1.5" aria-hidden={!slotsIn}>
          {BOOKING_SLOTS.map((slot, i) => {
            const isPick = slot === "4:15";
            const filled = isPick && selected;
            return (
              <motion.div
                key={slot}
                initial={false}
                animate={{
                  opacity: slotsIn ? 1 : 0,
                  y: slotsIn ? 0 : 6,
                }}
                transition={{ duration: 0.3, ease: EASE, delay: reduce ? 0 : i * 0.06 }}
                className={`flex items-center justify-center rounded-md border py-1 font-mono text-[11px] font-[500] transition-colors duration-300 ${
                  filled
                    ? "border-[#1F2B24] bg-[#1F2B24] text-[#F6F2EA]"
                    : "border-[rgba(34,29,23,.14)] bg-[#FFFDFA] text-[#221D17]"
                }`}
              >
                {slot}
              </motion.div>
            );
          })}
        </div>

        {/* Confirm button → green confirmation */}
        <div className="mt-2">
          {booked ? (
            <motion.div
              initial={reduce ? false : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.34, ease: EASE }}
              className="flex h-[28px] items-center justify-center gap-1.5 rounded-md bg-[rgba(31, 43, 36,.12)] font-sans text-[11px] font-[600] text-[#0F6E56]"
            >
              <CheckMark className="size-3" />
              Booked — Wed 4:15 PM
            </motion.div>
          ) : (
            <div
              className={`flex h-[28px] items-center justify-center rounded-md font-sans text-[11px] font-[600] transition-colors duration-300 ${
                selected
                  ? "bg-[#1F2B24] text-[#FFFDFA]"
                  : "bg-[rgba(31, 43, 36,.45)] text-[#FFFDFA]"
              }`}
            >
              Confirm booking
            </div>
          )}
        </div>
      </div>

      {/* ── Connector: "lands in your dashboard" ─────────────────────── */}
      <div className="flex items-center gap-1.5 px-0.5">
        <span className="h-px flex-1 bg-[rgba(34,29,23,.10)]" aria-hidden />
        <span className="font-sans text-[9px] uppercase tracking-[0.10em] text-[#9A9183]">
          Your dashboard
        </span>
        <span className="h-px flex-1 bg-[rgba(34,29,23,.10)]" aria-hidden />
      </div>

      {/* ── BOTTOM: mini operator calendar ───────────────────────────── */}
      <div className="rounded-[8px] border border-[rgba(34,29,23,.08)] bg-[#FFFDFA] p-2">
        <div className="grid grid-cols-[20px_1fr_1fr_1fr] gap-x-1">
          {/* hour gutter */}
          <div className="flex flex-col">
            {["4", "5"].map((h) => (
              <div
                key={h}
                className="relative h-[34px] pr-1 text-right font-mono text-[8px] text-[#9A9183]"
              >
                <span className="absolute right-1 -top-1">{h}</span>
              </div>
            ))}
          </div>
          {/* 3 day columns; Wed (middle) receives the event */}
          {(["Tue", "Wed", "Thu"] as const).map((col) => {
            const isWed = col === "Wed";
            return (
              <div key={col} className="flex flex-col">
                <div className="mb-0.5 text-center font-sans text-[8.5px] uppercase tracking-[0.05em] text-[#9A9183]">
                  {col}
                </div>
                <div className="relative">
                  {/* hour ticks */}
                  {[0, 1].map((row) => (
                    <div
                      key={row}
                      className="h-[34px] border-t border-[rgba(34,29,23,.07)]"
                    />
                  ))}
                  {/* the booked event, on Wed at 4:15 */}
                  {isWed && eventIn ? (
                    <motion.div
                      initial={reduce ? false : { opacity: 0, scale: 0.9, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: EASE }}
                      className="absolute inset-x-0.5 rounded-[5px] border border-l-[3px] border-[rgba(34,29,23,.10)] border-l-[#1F2B24] bg-[#FFFDFA] px-1 py-0.5 shadow-[0_1px_3px_rgba(34,29,23,.10)]"
                      style={{
                        top: 8, // ~quarter past the 4 o'clock row
                        height: 30,
                        boxShadow: justArrived
                          ? "0 0 0 3px rgba(31, 43, 36,.30), 0 1px 3px rgba(34,29,23,.10)"
                          : undefined,
                      }}
                    >
                      <p className="truncate font-sans text-[8.5px] font-[600] leading-tight text-[#221D17]">
                        Diane M.
                      </p>
                      <p className="truncate font-sans text-[8px] leading-tight text-[#6E665A]">
                        AC Repair · 4:15–4:45
                      </p>
                    </motion.div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </MockFrame>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   3 — INTAKE  (mini intake form fills itself, then success state)
   ════════════════════════════════════════════════════════════════════════ */

const FORM_FIELDS = [
  { label: "Full name", value: "Diane M." },
  { label: "Phone", value: "(209) 555-0144" },
  { label: "Service needed", value: "AC repair · same day" },
] as const;

function FormMock() {
  const reduce = useReducedMotion() ?? false;
  const [ref, inView] = useInViewRef<HTMLDivElement>();
  // 0–2 fill the three fields, 3 Send pulses, 4 success, 5 hold → loop.
  const step = useStepClock(6, 850, inView, reduce);

  const sending = !reduce && step === 3;
  const done = reduce || step >= 4;

  if (done && reduce) {
    // Reduced-motion end state: success card.
    return (
      <MockFrame innerRef={ref}>
        <FormSuccess />
      </MockFrame>
    );
  }

  return (
    <MockFrame innerRef={ref}>
      {done ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.34, ease: EASE }}
        >
          <FormSuccess />
        </motion.div>
      ) : (
        <div className="flex flex-col gap-2">
          {FORM_FIELDS.map((field, i) => {
            const active = step === i;
            const filled = step > i;
            const shown = step >= i;
            return (
              <div key={field.label} className="flex flex-col gap-1">
                <span className="font-sans text-[9px] uppercase tracking-[0.06em] text-[#9A9183]">
                  {field.label}
                </span>
                <div
                  className={`flex h-7 items-center rounded-md border px-2.5 font-mono text-[11px] transition-colors duration-200 ${
                    active
                      ? "border-[#1F2B24] bg-[#FFFDFA] text-[#221D17] shadow-[0_0_0_2px_rgba(31, 43, 36,.15)]"
                      : filled
                      ? "border-[rgba(34,29,23,.12)] bg-[#FFFDFA] text-[#221D17]"
                      : "border-[rgba(34,29,23,.08)] bg-[#FFFDFA] text-[#9A9183]"
                  }`}
                >
                  {shown ? (
                    <TypedText text={field.value} animate={active} />
                  ) : (
                    <span className="opacity-0">.</span>
                  )}
                  {active ? (
                    <motion.span
                      aria-hidden
                      className="ml-0.5 inline-block h-3.5 w-px bg-[#1F2B24]"
                      animate={{ opacity: [1, 0, 1] }}
                      transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
          <motion.div
            animate={sending ? { scale: [1, 1.04, 1] } : { scale: 1 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="mt-1 flex h-[30px] items-center justify-center rounded-md bg-[#1F2B24] font-sans text-[11px] font-[600] text-[#FFFDFA]"
          >
            {sending ? "Sending…" : "Send"}
          </motion.div>
        </div>
      )}
    </MockFrame>
  );
}

function FormSuccess() {
  return (
    <div className="flex min-h-[150px] flex-col items-center justify-center gap-2 py-4 text-center">
      <span className="inline-flex size-10 items-center justify-center rounded-full bg-[rgba(31, 43, 36,.12)]">
        <CheckMark className="size-5" />
      </span>
      <p className="m-0 font-sans text-[13px] font-[600] text-[#221D17]">Lead captured</p>
      <p className="m-0 font-sans text-[11px] text-[#6E665A]">
        Diane M. added to your CRM
      </p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   4 — AI RECEPTIONIST  (chat thread types in, typing dots before bot lines)
   ════════════════════════════════════════════════════════════════════════ */

type ChatLine = { who: "bot" | "user"; text: string };

const CHAT_LINES: ChatLine[] = [
  { who: "bot", text: "How can I help with your HVAC today?" },
  { who: "user", text: "My AC is out" },
  { who: "bot", text: "Got it — when can a tech come by?" },
  { who: "user", text: "Tonight?" },
];

function ChatMock() {
  return (
    <ThreadMock
      lines={CHAT_LINES}
      typingBeforeBot
      className="font-mono"
    />
  );
}

/* ════════════════════════════════════════════════════════════════════════
   5 — MISSED-CALL TEXT-BACK  (SMS thread w/ header + "replied in 47s" footer)
   ════════════════════════════════════════════════════════════════════════ */

const SMS_LINES: ChatLine[] = [
  { who: "bot", text: "Hey — sorry we missed you! Want a quick callback? Two slots open today:" },
  { who: "bot", text: "Wed 10:30 AM · Wed 4:15 PM" },
  { who: "user", text: "Wed 4:15 works" },
  { who: "bot", text: "Booked for Wed 4:15. See you then!" },
];

function SmsMock() {
  return (
    <ThreadMock
      lines={SMS_LINES}
      header="Today 2:14 PM"
      footer="Replied in 47 seconds"
    />
  );
}

/* ── Shared chat/SMS thread engine ─────────────────────────────────────────
   Bubbles slide in staggered. When `typingBeforeBot`, a 3-dot indicator shows
   for a beat before each bot line resolves. Drives off a step-clock where each
   message gets one (or, for typing bots, two) steps. Reduced-motion → full
   thread + footer rendered statically. */
function ThreadMock({
  lines,
  header,
  footer,
  typingBeforeBot = false,
  className = "",
}: {
  lines: ChatLine[];
  header?: string;
  footer?: string;
  typingBeforeBot?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion() ?? false;
  const [ref, inView] = useInViewRef<HTMLDivElement>();

  // Build a timeline of "ticks". Each bot line (when typingBeforeBot) costs two
  // ticks: [typing, resolved]; user lines (and all lines when no typing) cost
  // one. Then a trailing hold + footer reveal + a final pause before reset.
  const ticks: Array<{ index: number; phase: "typing" | "show" }> = [];
  lines.forEach((line, index) => {
    if (typingBeforeBot && line.who === "bot") {
      ticks.push({ index, phase: "typing" });
    }
    ticks.push({ index, phase: "show" });
  });
  const FOOTER_TICK = ticks.length; // footer appears
  const HOLD_TICKS = 2; // breathe before looping
  const totalSteps = ticks.length + 1 + HOLD_TICKS;

  const step = useStepClock(totalSteps, 900, inView, reduce);

  // Resolve, for the current step, how far the thread has progressed.
  // shownCount = number of fully-shown bubbles; typingIndex = a bot line
  // currently showing its dots (or null).
  let shownCount = 0;
  let typingIndex: number | null = null;
  if (reduce) {
    shownCount = lines.length;
  } else {
    const current = ticks[Math.min(step, ticks.length - 1)];
    // Everything strictly before the current tick is fully shown.
    for (let t = 0; t < Math.min(step, ticks.length); t++) {
      if (ticks[t].phase === "show") shownCount = Math.max(shownCount, ticks[t].index + 1);
    }
    if (step < ticks.length && current) {
      if (current.phase === "typing") {
        typingIndex = current.index;
      } else {
        shownCount = Math.max(shownCount, current.index + 1);
      }
    } else {
      shownCount = lines.length;
    }
  }

  const footerShown = reduce || step >= FOOTER_TICK;

  return (
    <MockFrame innerRef={ref} className={className}>
      {header ? (
        <div className="mb-2 text-center font-sans text-[10.5px] text-[#9A9183]">{header}</div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        {lines.map((line, i) => {
          if (i >= shownCount && typingIndex !== i) return null;
          if (typingIndex === i) {
            return <TypingBubble key={`typing-${i}`} />;
          }
          return (
            <motion.div
              key={i}
              initial={reduce ? false : { opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3, ease: EASE }}
              className={
                line.who === "user"
                  ? "flex justify-end"
                  : "flex justify-start"
              }
            >
              <ChatBubble who={line.who}>{line.text}</ChatBubble>
            </motion.div>
          );
        })}
      </div>

      {footer ? (
        <motion.div
          initial={false}
          animate={{ opacity: footerShown ? 1 : 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="mt-2 text-center font-sans text-[10.5px] font-[500] text-[#1F2B24]"
        >
          {footer}
        </motion.div>
      ) : null}
    </MockFrame>
  );
}

function ChatBubble({ who, children }: { who: "bot" | "user"; children: ReactNode }) {
  return (
    <div
      className={`max-w-[82%] rounded-[14px] px-3 py-2 text-[11px] leading-[1.4] ${
        who === "bot"
          ? "rounded-bl-[4px] bg-[#FFFDFA] text-[#221D17] shadow-[0_1px_3px_rgba(34,29,23,.08)]"
          : "rounded-br-[4px] bg-[#1F2B24] text-[#F6F2EA]"
      }`}
    >
      {children}
    </div>
  );
}

function TypingBubble() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: EASE }}
      className="flex justify-start"
    >
      <div className="flex items-center gap-1 rounded-[14px] rounded-bl-[4px] bg-[#FFFDFA] px-3 py-2.5 shadow-[0_1px_3px_rgba(34,29,23,.08)]">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="inline-block size-1.5 rounded-full bg-[#9A9183]"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
            transition={{
              duration: 0.9,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.15,
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   6 — REVIEW REQUESTER  (message → 5 stars pop in → "Leave a review" pill)
   ════════════════════════════════════════════════════════════════════════ */

function ReviewMock() {
  const reduce = useReducedMotion() ?? false;
  const [ref, inView] = useInViewRef<HTMLDivElement>();
  // 0 message in, 1–5 stars pop one-by-one, 6 pill appears, 7–8 hold → loop.
  const step = useStepClock(9, 650, inView, reduce);

  const messageIn = reduce || step >= 0;
  const starsShown = reduce ? 5 : Math.max(0, Math.min(5, step)); // step 1→1 star … step 5→5
  const pillIn = reduce || step >= 6;

  return (
    <MockFrame innerRef={ref}>
      <div className="mb-2 text-center font-sans text-[10.5px] text-[#9A9183]">
        2 days after job completion
      </div>

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: messageIn ? 1 : 0, y: messageIn ? 0 : 8 }}
        transition={{ duration: 0.3, ease: EASE }}
        className="flex justify-start"
      >
        <ChatBubble who="bot">
          Hi Marcus — hope the AC repair went well! If you have 30 seconds, a
          quick Google review would mean a lot to us.
        </ChatBubble>
      </motion.div>

      {/* Stars pop in one-by-one */}
      <div className="mt-2.5 flex items-center justify-center gap-1">
        {[0, 1, 2, 3, 4].map((i) => {
          const lit = i < starsShown;
          return (
            <motion.div
              key={i}
              initial={false}
              animate={{ scale: lit ? 1 : 0, opacity: lit ? 1 : 0 }}
              transition={{ duration: 0.32, ease: EASE }}
            >
              <Star
                size={18}
                strokeWidth={1.5}
                className="text-[#f5a623]"
                fill="#f5a623"
                aria-hidden
              />
            </motion.div>
          );
        })}
      </div>

      {/* "Leave a review" pill */}
      <div className="mt-2.5 flex justify-center">
        <motion.div
          initial={false}
          animate={{ opacity: pillIn ? 1 : 0, y: pillIn ? 0 : 6 }}
          transition={{ duration: 0.32, ease: EASE }}
          className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(34,29,23,.12)] bg-[#FFFDFA] px-3.5 py-1.5 font-sans text-[11px] font-[600] text-[#221D17] shadow-[0_1px_3px_rgba(34,29,23,.06)]"
        >
          <GoogleG className="size-3.5" />
          Leave a review
        </motion.div>
      </div>
    </MockFrame>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Small shared bits
   ════════════════════════════════════════════════════════════════════════ */

/** Reveals `text` left-to-right via a clip when `animate`; static otherwise.
 *  Transform/opacity-only (width via scaleX would distort glyphs, so we use a
 *  clip-path inset which is GPU-composited and doesn't reflow). */
function TypedText({ text, animate }: { text: string; animate: boolean }) {
  if (!animate) return <span>{text}</span>;
  return (
    <motion.span
      initial={{ clipPath: "inset(0 100% 0 0)" }}
      animate={{ clipPath: "inset(0 0% 0 0)" }}
      transition={{ duration: 0.55, ease: EASE }}
      className="inline-block whitespace-nowrap"
    >
      {text}
    </motion.span>
  );
}

function CheckMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M5 13l4 4L19 7"
        stroke="#1F2B24"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Tiny multi-colour Google "G" for the review pill. */
function GoogleG({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.55-5.17 3.55-8.87Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29A7.21 7.21 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.38l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}
