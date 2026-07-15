"use client";

// packages/crm/src/components/demo-scenes/grounded-chat.tsx
//
// Scene 3 (spec): a chat playback proving the "never-lies" grounded reply +
// booking confirmation loop. Adapts the phase-machine idiom from
// components/landing/edit-by-chat-demo.tsx (a `step` counter driving a
// setTimeout chain) rather than importing that component directly — this
// scene is chat-panel only, full-viewport, bigger type for 1080p video.
// Bubbles: customer = light card, agent = forest bubble.

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

type Step =
  | { kind: "typing-customer" }
  | { kind: "msg-customer"; text: string }
  | { kind: "typing-agent" }
  | { kind: "msg-agent"; text: string }
  | { kind: "confirm"; text: string }
  | { kind: "hold" };

const STEPS: { step: Step; ms: number }[] = [
  { step: { kind: "typing-customer" }, ms: 900 },
  { step: { kind: "msg-customer", text: "Do you do Saturday appointments?" }, ms: 700 },
  { step: { kind: "typing-agent" }, ms: 900 },
  {
    step: { kind: "msg-agent", text: "Yes — we're open Saturday 9–2. Want me to book you in?" },
    ms: 1500,
  },
  { step: { kind: "typing-customer" }, ms: 700 },
  { step: { kind: "msg-customer", text: "Yes, 10am" }, ms: 600 },
  { step: { kind: "typing-agent" }, ms: 800 },
  { step: { kind: "confirm", text: "Booked — Saturday 10:00 AM. See you then!" }, ms: 2600 },
];

function TypingDots() {
  return (
    <div
      style={{
        display: "flex",
        gap: 5,
        padding: "14px 16px",
        borderRadius: 16,
        borderBottomLeftRadius: 4,
        background: "var(--lp-card)",
        border: "1px solid var(--lp-border, rgba(34,29,23,.12))",
        width: "fit-content",
      }}
    >
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "var(--lp-faint)",
            animation: "demo-scene-typing-dot 1s ease-in-out infinite",
            animationDelay: `${dot * 0.15}s`,
          }}
        />
      ))}
      <style>{`@keyframes demo-scene-typing-dot { 0%, 60%, 100% { opacity: .3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-3px); } }`}</style>
    </div>
  );
}

function Bubble({ from, children }: { from: "customer" | "agent"; children: React.ReactNode }) {
  const isAgent = from === "agent";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      style={{
        alignSelf: isAgent ? "flex-start" : "flex-end",
        maxWidth: "min(80vw, 520px)",
        padding: "16px 20px",
        borderRadius: 18,
        borderBottomLeftRadius: isAgent ? 4 : 18,
        borderBottomRightRadius: isAgent ? 18 : 4,
        background: isAgent ? "var(--lp-accent)" : "var(--lp-card)",
        color: isAgent ? "var(--lp-on-accent, #F6F2EA)" : "var(--lp-ink)",
        border: isAgent ? "none" : "1px solid var(--lp-border, rgba(34,29,23,.12))",
        fontSize: "clamp(16px, 1.8vw, 22px)",
        lineHeight: 1.4,
      }}
    >
      {children}
    </motion.div>
  );
}

const CALENDAR_CHIP = (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      marginTop: 10,
      padding: "6px 12px",
      borderRadius: 999,
      background: "rgba(246,242,234,.16)",
      fontSize: "0.7em",
      fontWeight: 600,
    }}
  >
    {/* eslint-disable-next-line @next/next/no-img-element -- static vendored brand icon */}
    <img src="/brand/integrations/google-calendar.svg" alt="" width={14} height={14} />
    Sat, 10:00 AM
  </span>
);

export function GroundedChatScene({ loop = true }: { loop?: boolean }) {
  const reducedMotion = Boolean(useReducedMotion());
  const [index, setIndex] = useState(0);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reducedMotion) return undefined;
    if (index >= STEPS.length) {
      if (!loop) return undefined;
      const resetTimer = setTimeout(() => {
        setIndex(0);
        setCycle((c) => c + 1);
      }, 300);
      return () => clearTimeout(resetTimer);
    }
    const timer = setTimeout(() => setIndex((n) => n + 1), STEPS[index].ms);
    return () => clearTimeout(timer);
  }, [index, reducedMotion, loop]);

  const visible = reducedMotion ? STEPS.map((s) => s.step) : STEPS.slice(0, index).map((s) => s.step);
  const current = reducedMotion ? null : index < STEPS.length ? STEPS[index].step : null;

  return (
    <div
      key={cycle}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        width: "min(90vw, 560px)",
        padding: 24,
      }}
    >
      {visible
        .filter((s) => s.kind === "msg-customer" || s.kind === "msg-agent" || s.kind === "confirm")
        .map((s, i) => {
          if (s.kind === "msg-customer") return <Bubble key={`c-${i}`} from="customer">{s.text}</Bubble>;
          if (s.kind === "msg-agent") return <Bubble key={`a-${i}`} from="agent">{s.text}</Bubble>;
          return (
            <Bubble key={`x-${i}`} from="agent">
              {s.text}
              <br />
              {CALENDAR_CHIP}
            </Bubble>
          );
        })}
      {!reducedMotion && current?.kind === "typing-customer" && (
        <div style={{ alignSelf: "flex-end" }}>
          <TypingDots />
        </div>
      )}
      {!reducedMotion && current?.kind === "typing-agent" && (
        <div style={{ alignSelf: "flex-start" }}>
          <TypingDots />
        </div>
      )}
    </div>
  );
}
