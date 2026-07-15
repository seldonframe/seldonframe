"use client";

// packages/crm/src/components/demo-scenes/stat-payoff.tsx
//
// Scene 4 (spec): one row, four counted wins, "one booked job pays for it"
// as the anchor line in AnimatedShinyText. NumberTicker already has no
// internal reduced-motion guard, so it always plays its spring count —
// that's fine for a short single count-up, but for the loop we key-bump on
// an interval to re-trigger it (only when not reduced-motion and loop is
// on); reduced-motion renders the settled numbers directly instead of
// mounting NumberTicker at all.

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

import { NumberTicker } from "@/components/ui/number-ticker";
import { AnimatedShinyText } from "@/components/ui/magic/animated-shiny-text";

// Spec: "one row, four NumberTickers with labels: 1 URL → 1 website ·
// 1 AI chatbot · 1 CRM · 1 booking page" — "1 URL" is the static lead-in,
// the arrow introduces the four counted outcomes.
const LEAD_IN = "1 URL";
const STATS = [
  { value: 1, label: "website" },
  { value: 1, label: "AI chatbot" },
  { value: 1, label: "CRM" },
  { value: 1, label: "booking page" },
] as const;

const RECOUNT_MS = 5000;

export function StatPayoffScene({ loop = true }: { loop?: boolean }) {
  const reducedMotion = Boolean(useReducedMotion());
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reducedMotion || !loop) return undefined;
    const timer = setInterval(() => setCycle((c) => c + 1), RECOUNT_MS);
    return () => clearInterval(timer);
  }, [reducedMotion, loop]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        textAlign: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          justifyContent: "center",
          gap: "clamp(10px, 2vw, 24px)",
        }}
      >
        <span
          style={{
            fontSize: "clamp(28px, 4.4vw, 56px)",
            fontWeight: 700,
            color: "var(--lp-ink)",
          }}
        >
          {LEAD_IN} →
        </span>
        {STATS.map((stat, index) => (
          <div key={stat.label} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            {index > 0 && (
              <span style={{ fontSize: "clamp(20px, 2.4vw, 32px)", color: "var(--lp-faint)" }}>
                ·
              </span>
            )}
            {reducedMotion ? (
              <span
                style={{
                  fontSize: "clamp(28px, 4.4vw, 56px)",
                  fontWeight: 700,
                  color: "var(--lp-ink)",
                }}
              >
                {stat.value}
              </span>
            ) : (
              <NumberTicker
                key={cycle}
                value={stat.value}
                style={{
                  fontSize: "clamp(28px, 4.4vw, 56px)",
                  fontWeight: 700,
                  color: "var(--lp-ink)",
                }}
              />
            )}
            <span style={{ fontSize: "clamp(14px, 1.6vw, 20px)", color: "var(--lp-body)" }}>
              {stat.label}
            </span>
          </div>
        ))}
      </div>

      <AnimatedShinyText
        base="var(--lp-body)"
        shine="var(--lp-ink)"
        className="text-[clamp(16px,2vw,22px)] font-semibold"
      >
        one booked job pays for it
      </AnimatedShinyText>
    </div>
  );
}
