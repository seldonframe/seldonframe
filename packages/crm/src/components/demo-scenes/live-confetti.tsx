"use client";

// packages/crm/src/components/demo-scenes/live-confetti.tsx
//
// Scene 6 (spec): "<slug>.app.seldonframe.com is live." headline + a
// ~48-particle CSS confetti burst. Particle transforms come from a
// module-level deterministic formula (golden-angle spread + index-derived
// distance/delay/size/color) — NOT Math.random() — so server and client
// render the identical particle set and there's no hydration mismatch, and
// no canvas-confetti dependency.

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

const HEADLINE = "zen-flow-hydration.app.seldonframe.com is live.";

const PARTICLE_COUNT = 48;
const COLORS = ["#1F2B24", "#F6F2EA", "#D9C9A3", "#7C8B7A", "#B7AE9C"];
const GOLDEN_ANGLE = 137.508;

interface Particle {
  id: number;
  txVw: number;
  tyVh: number;
  rotateDeg: number;
  delayMs: number;
  sizePx: number;
  color: string;
}

// Deterministic — computed once at module load from index math only, so
// this is safe to reuse verbatim on the server and the client. The trig
// results are rounded to 2 decimals: Math.cos/sin are NOT guaranteed
// bit-identical across JS engines (Node vs browser differ in the last ulp),
// and an unrounded value serialized into the --tx/--ty style strings caused
// a real hydration mismatch at the 15th decimal in dev.
const round2 = (n: number): number => Math.round(n * 100) / 100;

const PARTICLES: Particle[] = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
  const angleRad = ((i * GOLDEN_ANGLE) % 360) * (Math.PI / 180);
  const distance = 18 + ((i * 53) % 55); // 18-73
  return {
    id: i,
    txVw: round2(Math.cos(angleRad) * distance * 0.55),
    tyVh: round2(Math.sin(angleRad) * distance * 0.35 + 22), // downward bias, confetti falls
    rotateDeg: (i * 47) % 360,
    delayMs: (i % 12) * 35,
    sizePx: 6 + (i % 4) * 2,
    color: COLORS[i % COLORS.length],
  };
});

const CYCLE_MS = 4200;

export function LiveConfettiScene({ loop = true }: { loop?: boolean }) {
  const reducedMotion = Boolean(useReducedMotion());
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reducedMotion || !loop) return undefined;
    const timer = setInterval(() => setCycle((c) => c + 1), CYCLE_MS);
    return () => clearInterval(timer);
  }, [reducedMotion, loop]);

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
      }}
    >
      <style>{`
        @keyframes demo-scene-confetti-burst {
          0% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate(var(--tx), var(--ty)) rotate(var(--rot)); opacity: 0; }
        }
      `}</style>

      {!reducedMotion && (
        <div
          key={cycle}
          aria-hidden
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          {PARTICLES.map((p) => (
            <span
              key={p.id}
              style={
                {
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  width: p.sizePx,
                  height: p.sizePx * 0.4,
                  background: p.color,
                  borderRadius: 2,
                  "--tx": `${p.txVw}vw`,
                  "--ty": `${p.tyVh}vh`,
                  "--rot": `${p.rotateDeg}deg`,
                  animation: `demo-scene-confetti-burst 1400ms ease-out ${p.delayMs}ms both`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}

      <h1
        style={{
          margin: 0,
          textAlign: "center",
          fontSize: "clamp(26px, 4vw, 46px)",
          fontWeight: 700,
          color: "var(--lp-ink)",
          padding: "0 24px",
        }}
      >
        {HEADLINE}
      </h1>
    </div>
  );
}
