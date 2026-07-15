"use client";

// packages/crm/src/components/demo-scenes/docker-terminal.tsx
//
// Scene 7 (spec): for the self-host/open-source video. Reuses the vendored
// Terminal + TypingAnimation + AnimatedSpan trio exactly as the /motion-lab
// TerminalDemo does — Terminal's own `sequence` prop already staggers the
// lines (each AnimatedSpan waits for the previous item to finish before it
// starts), so this scene just supplies the copy and forwards
// forceStatic={reducedMotion} into every child, plus a blinking cursor at
// the end.

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

import { Terminal, TypingAnimation, AnimatedSpan } from "@/components/ui/magic/terminal";

const CYCLE_MS = 7000;

export function DockerTerminalScene({ loop = true }: { loop?: boolean }) {
  const reducedMotion = Boolean(useReducedMotion());
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reducedMotion || !loop) return undefined;
    const timer = setInterval(() => setCycle((c) => c + 1), CYCLE_MS);
    return () => clearInterval(timer);
  }, [reducedMotion, loop]);

  return (
    <div style={{ width: "min(90vw, 640px)" }}>
      <style>{`
        @keyframes demo-scene-cursor-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          .demo-scene-cursor { animation: none !important; opacity: 1 !important; }
        }
      `}</style>
      <Terminal key={cycle} className="w-full text-[15px]">
        <TypingAnimation forceStatic={reducedMotion} className="text-[15px]">
          $ docker compose up -d
        </TypingAnimation>
        <AnimatedSpan forceStatic={reducedMotion} delay={600} className="text-[15px] text-emerald-400">
          ✔ Pulling seldonframe/seldonframe:latest
        </AnimatedSpan>
        <AnimatedSpan forceStatic={reducedMotion} delay={900} className="text-[15px] text-emerald-400">
          ✔ Starting Postgres
        </AnimatedSpan>
        <AnimatedSpan forceStatic={reducedMotion} delay={900} className="text-[15px] text-emerald-400">
          ✔ Running migrations
        </AnimatedSpan>
        <AnimatedSpan forceStatic={reducedMotion} delay={900} className="text-[15px] font-semibold text-emerald-400">
          ✔ SeldonFrame running on http://localhost:3000
        </AnimatedSpan>
        <div style={{ display: "flex", alignItems: "center", gap: 2, marginTop: 4 }}>
          <span className="text-[15px]" style={{ color: "var(--lp-body, #9A9183)" }}>
            $
          </span>
          <span
            className="demo-scene-cursor"
            style={{
              display: "inline-block",
              width: 8,
              height: 16,
              background: "var(--lp-body, #9A9183)",
              animation: reducedMotion ? "none" : "demo-scene-cursor-blink 1s step-end infinite",
            }}
          />
        </div>
      </Terminal>
    </div>
  );
}
