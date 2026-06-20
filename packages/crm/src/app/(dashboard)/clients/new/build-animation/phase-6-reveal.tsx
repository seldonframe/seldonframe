"use client";

import { useSprite } from "./sprite";
import { clamp } from "./easing";

// ── Phase 6: Reveal ───────────────────────────────────────────────────────────
// Everything condenses into a tidy workspace card with a checkmark, summary
// readout, and a pulsing "Open dashboard" CTA.

export function BuildPhase6Reveal() {
  const { localTime } = useSprite();
  const t = localTime;

  // Check ring draws 0.2s → 1.4s
  const ringP = clamp((t - 0.2) / 1.2, 0, 1);
  const checkP = clamp((t - 1.0) / 0.5, 0, 1);

  // Title 1.4s
  const titleP = clamp((t - 1.4) / 0.7, 0, 1);

  // Summary rows stagger 2.2s →
  const summaryStart = 2.2;
  const summary = [
    { k: "Workspace",    v: "maloney.seldonframe.com" },
    { k: "Modules",      v: "5 active" },
    { k: "Customers",    v: "24 seeded" },
    { k: "Integrations", v: "5 linked" },
    { k: "Pages",        v: "home · book · contact" },
  ];

  // CTA appears 5.5s and pulses gently
  const ctaP = clamp((t - 5.5) / 0.7, 0, 1);
  const pulseT = Math.max(0, t - 6.0);
  const pulseScale = 1 + 0.02 * Math.sin(pulseT * Math.PI / 1.2);
  const pulseGlow = 0.5 + 0.5 * Math.abs(Math.sin(pulseT * Math.PI / 1.2));

  return (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: 32,
      gap: 18,
    }}>
      {/* Check */}
      <div style={{ position: "relative", width: 84, height: 84 }}>
        {/* Pulsing halo */}
        <div style={{
          position: "absolute", inset: -16,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(16,185,129,0.22), transparent 70%)",
          opacity: 0.5 + 0.5 * Math.abs(Math.sin(t * 1.5)),
          transition: "opacity 100ms linear",
        }} />
        <svg width="84" height="84" viewBox="0 0 84 84" style={{ position: "absolute", inset: 0 }}>
          <circle
            cx="42" cy="42" r="38"
            fill="rgba(16,185,129,0.08)"
            stroke="#10b981"
            strokeWidth="1.5"
            pathLength="1"
            strokeDasharray="1 1"
            strokeDashoffset={1 - ringP}
            transform="rotate(-90 42 42)"
          />
          <path
            d="M28 43 L38 53 L57 32"
            fill="none"
            stroke="#10b981"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="1"
            strokeDasharray="1 1"
            strokeDashoffset={1 - checkP}
          />
        </svg>
      </div>

      {/* Title */}
      <div style={{
        opacity: titleP,
        transform: `translateY(${(1 - titleP) * 8}px)`,
        textAlign: "center",
      }}>
        <div style={{
          fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
          fontSize: 10,
          color: "rgba(16,185,129,0.85)",
          letterSpacing: "0.22em",
          marginBottom: 8,
        }}>
          ◢ WORKSPACE READY
        </div>
        <div style={{
          fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
          fontSize: 30,
          fontWeight: 600,
          color: "#f6f4ef",
          letterSpacing: "-0.02em",
          lineHeight: 1.05,
        }}>
          Maloney Plumbing
        </div>
      </div>

      {/* Summary */}
      <div style={{
        width: 380,
        display: "flex", flexDirection: "column",
        gap: 6,
        padding: "14px 18px",
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 10,
      }}>
        {summary.map((row, i) => {
          const rStart = summaryStart + i * 0.32;
          const rP = clamp((t - rStart) / 0.45, 0, 1);
          return (
            <div key={i} style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              opacity: rP,
              transform: `translateX(${(1 - rP) * -6}px)`,
            }}>
              <div style={{
                fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
                fontSize: 10,
                color: "rgba(246,244,239,0.4)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}>{row.k}</div>
              <div style={{
                fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
                fontSize: 12,
                color: "rgba(246,244,239,0.92)",
                fontWeight: 500,
                letterSpacing: "-0.005em",
              }}>{row.v}</div>
            </div>
          );
        })}
      </div>

      {/* CTA */}
      <button style={{
        marginTop: 4,
        opacity: ctaP,
        transform: `translateY(${(1 - ctaP) * 8}px) scale(${ctaP === 1 ? pulseScale : 1})`,
        padding: "14px 26px",
        background: "#10b981",
        border: "none",
        borderRadius: 999,
        color: "#06100D",
        fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
        fontSize: 14,
        fontWeight: 600,
        letterSpacing: "-0.005em",
        cursor: "pointer",
        boxShadow: `0 0 ${20 + pulseGlow * 20}px rgba(16,185,129,${0.30 + pulseGlow * 0.25})`,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        Open dashboard
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 7h8M7 3l4 4-4 4" stroke="#06100D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  );
}
