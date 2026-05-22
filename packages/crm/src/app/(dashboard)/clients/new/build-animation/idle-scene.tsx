"use client";

// idle-scene.tsx — pre-submit "calm before the launch" state.
// Stage 720x960, 6s ambient loop. All helpers (IdleBackdrop, ParticleDrift,
// RegisterMarks, UrlInput, Kbd, BuildCta, PhaseAside, IdleFooter, HeroColumn)
// are internal — same pattern as index.tsx.
//
// External API:
//   <IdleScene url={...} onUrlChange={...} onSubmit={...} disabled={...} errorOverlay={...} />
//
// Ported from Claude Design export (C:\Users\maxim\AppData\Local\Temp\phases-early.jsx)
// with the following changes from the brief:
//   - IdleHeader + IdleWordmark dropped (dashboard chrome already has them)
//   - url lifted to props; focused/warm stay internal
//   - Input: type="url", id="client-url", required, accessible label
//   - BuildCta: <button type="submit">; wrapped in <form> for native semantics
//   - Skip link: <Link href="/dashboard"> via next/link
//   - Geist font variables prepended to every fontFamily
//   - Stage reducedMotionFreezeAt={3} for the 6s loop
//   - Top padding adjusted to 60px (no header row)

import { useState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { Stage, useTime } from "./stage";
import { clamp } from "./easing";

// ── Constants ────────────────────────────────────────────────────────────────

const IDLE_PHASES = [
  { n: 1, name: "Scan",       hint: "reading the site"               },
  { n: 2, name: "Identity",   hint: "pulling brand"                  },
  { n: 3, name: "Structure",  hint: "mapping entities"               },
  { n: 4, name: "Modules",    hint: "wiring CRM · bookings · intake" },
  { n: 5, name: "Activation", hint: "seeding data"                   },
  { n: 6, name: "Reveal",     hint: "workspace ready"                },
] as const;

// Sequential shimmer: each phase glows for 1s; total cycle = 6s, matches loop.
const SHIMMER_CYCLE = 6;
const SHIMMER_STEP = SHIMMER_CYCLE / IDLE_PHASES.length; // 1.0s
// Halo breathes at 2s cadence
const HALO_PERIOD = 2.0;
// Grid breathes at 4s cadence
const GRID_PERIOD = 4.0;
// Input glow breathes at 2.4s
const INPUT_PERIOD = 2.4;

// Scoped keyframe for the live-dot pulse in PhaseAside
const KEYFRAMES = `
  @keyframes sf-idle-pulse {
    0%   { opacity: 1; transform: scale(1); }
    50%  { opacity: 0.55; transform: scale(0.85); }
    100% { opacity: 1; transform: scale(1); }
  }
`;

// ── IdleBackdrop ─────────────────────────────────────────────────────────────
// Radial gradients + breathing grid, warmth shift on focus.

function IdleBackdrop({ warm = 0 }: { warm?: number }) {
  const time = useTime();
  const gridPulse = 0.014 + 0.006 * Math.sin((time / GRID_PERIOD) * Math.PI * 2);
  const warmAmt = clamp(warm, 0, 1);

  const glow1 = 0.06 + warmAmt * 0.04;
  const glow2 = 0.04 + warmAmt * 0.03;
  const wash  = warmAmt * 0.025;

  return (
    <div style={{
      position: "absolute", inset: 0,
      background: `
        radial-gradient(circle at 22% 28%, rgba(16,185,129,${glow1}), transparent 52%),
        radial-gradient(circle at 82% 78%, rgba(167,243,208,${glow2}), transparent 58%),
        radial-gradient(circle at 50% 50%, rgba(246,244,239,${wash}), transparent 65%),
        #06100D
      `,
      transition: "background 280ms ease-out",
    }}>
      {/* Faint pulsing grid */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `
          linear-gradient(rgba(255,255,255,${gridPulse}) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,${gridPulse}) 1px, transparent 1px)
        `,
        backgroundSize: "32px 32px",
        maskImage: "radial-gradient(ellipse at center, black 30%, transparent 82%)",
        WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 82%)",
      }} />
    </div>
  );
}

// ── ParticleDrift ────────────────────────────────────────────────────────────
// 4 mint specks on independent Lissajous-ish paths. Deterministic from useTime().

const PARTICLE_SPECS = [
  { cx: 180, cy: 320, ax: 60, ay: 40, px: 7.3, py: 5.1, phx: 0.0, phy: 1.7, r: 1.6, op: 0.22 },
  { cx: 520, cy: 240, ax: 90, ay: 55, px: 9.1, py: 6.4, phx: 1.2, phy: 0.5, r: 1.2, op: 0.30 },
  { cx: 380, cy: 720, ax: 70, ay: 45, px: 6.7, py: 8.2, phx: 2.4, phy: 1.1, r: 2.0, op: 0.18 },
  { cx: 620, cy: 600, ax: 50, ay: 65, px: 8.8, py: 7.5, phx: 0.7, phy: 2.2, r: 1.4, op: 0.26 },
] as const;

function ParticleDrift() {
  const time = useTime();
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {PARTICLE_SPECS.map((s, i) => {
        const x = s.cx + s.ax * Math.sin((time / s.px) * Math.PI * 2 + s.phx);
        const y = s.cy + s.ay * Math.cos((time / s.py) * Math.PI * 2 + s.phy);
        return (
          <div key={i} style={{
            position: "absolute",
            left: x - s.r, top: y - s.r,
            width: s.r * 2, height: s.r * 2,
            borderRadius: s.r,
            background: "#a7f3d0",
            opacity: s.op,
            boxShadow: `0 0 ${s.r * 4}px rgba(167,243,208,${s.op * 1.4})`,
            willChange: "transform",
          }} />
        );
      })}
    </div>
  );
}

// ── RegisterMarks ────────────────────────────────────────────────────────────
// Corner crosshair ticks around the hero panel.

function RegisterMarks({
  inset = 28,
  size = 10,
  color = "rgba(167,243,208,0.22)",
}: {
  inset?: number;
  size?: number;
  color?: string;
}) {
  const tickStyle = (style: React.CSSProperties): React.ReactNode => (
    <div style={{ position: "absolute", ...style }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: size, height: 1, background: color }} />
      <div style={{ position: "absolute", left: 0, top: 0, width: 1, height: size, background: color }} />
    </div>
  );
  // suppress unused variable; corners are rendered inline below
  void tickStyle;

  return (
    <>
      {/* Top-left */}
      <div style={{ position: "absolute", left: inset, top: inset, width: size, height: size }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: size, height: 1, background: color }} />
        <div style={{ position: "absolute", left: 0, top: 0, width: 1, height: size, background: color }} />
      </div>
      {/* Top-right */}
      <div style={{ position: "absolute", right: inset, top: inset, width: size, height: size }}>
        <div style={{ position: "absolute", right: 0, top: 0, width: size, height: 1, background: color }} />
        <div style={{ position: "absolute", right: 0, top: 0, width: 1, height: size, background: color }} />
      </div>
      {/* Bottom-left */}
      <div style={{ position: "absolute", left: inset, bottom: inset, width: size, height: size }}>
        <div style={{ position: "absolute", left: 0, bottom: 0, width: size, height: 1, background: color }} />
        <div style={{ position: "absolute", left: 0, bottom: 0, width: 1, height: size, background: color }} />
      </div>
      {/* Bottom-right */}
      <div style={{ position: "absolute", right: inset, bottom: inset, width: size, height: size }}>
        <div style={{ position: "absolute", right: 0, bottom: 0, width: size, height: 1, background: color }} />
        <div style={{ position: "absolute", right: 0, bottom: 0, width: 1, height: size, background: color }} />
      </div>
    </>
  );
}

// ── Kbd ──────────────────────────────────────────────────────────────────────
// Small mono keycap badge.

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minWidth: 18, height: 18,
      padding: "0 4px",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(246,244,239,0.06)",
      border: "1px solid rgba(246,244,239,0.12)",
      borderRadius: 4,
      color: "rgba(246,244,239,0.55)",
      fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
      fontSize: 10,
      lineHeight: 1,
    }}>
      {children}
    </div>
  );
}

// ── UrlInput ─────────────────────────────────────────────────────────────────
// Glowing breathing URL input with lock icon, JetBrains-Mono caret, ⌘↵ key
// hint, and focus-only scan-line.

type UrlInputProps = {
  value: string;
  onChange: (next: string) => void;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
};

function UrlInput({ value, onChange, focused, onFocus, onBlur }: UrlInputProps) {
  const time = useTime();
  const breath = 0.5 + 0.5 * Math.sin((time / INPUT_PERIOD) * Math.PI * 2);
  const baseGlow = focused ? 0.55 : 0.22;
  const glowOpacity = baseGlow + (focused ? 0.15 : 0.08) * breath;
  const borderColor = focused
    ? `rgba(16,185,129,${0.55 + 0.20 * breath})`
    : `rgba(246,244,239,${0.10 + 0.04 * breath})`;
  const haloPx = focused ? 28 + 6 * breath : 14 + 3 * breath;
  const iconColor = focused ? "#10b981" : "rgba(246,244,239,0.55)";

  return (
    <div style={{ position: "relative" }}>
      {/* Accessible label — visually hidden */}
      <label htmlFor="client-url" className="sr-only">
        Client website URL
      </label>

      {/* Outer glow halo */}
      <div style={{
        position: "absolute",
        inset: -2,
        borderRadius: 10,
        boxShadow: `0 0 ${haloPx}px rgba(16,185,129,${glowOpacity * 0.5}), inset 0 0 ${haloPx * 0.4}px rgba(16,185,129,${glowOpacity * 0.18})`,
        pointerEvents: "none",
        transition: "box-shadow 280ms ease-out",
      }} />

      {/* Input shell */}
      <div style={{
        position: "relative",
        display: "flex", alignItems: "center",
        gap: 14,
        padding: "0 18px",
        height: 60,
        background: "rgba(6,16,13,0.65)",
        backdropFilter: "blur(2px)",
        border: `1px solid ${borderColor}`,
        borderRadius: 10,
        transition: "border-color 220ms ease-out",
      }}>
        {/* Globe / lock indicator */}
        <div style={{
          width: 18, height: 18,
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: focused ? 0.85 : 0.5,
          transition: "opacity 200ms",
          flexShrink: 0,
        }}>
          <div style={{
            width: 10, height: 10,
            borderRadius: 5,
            border: `1.2px solid ${iconColor}`,
            position: "relative",
          }}>
            <div style={{
              position: "absolute",
              left: -1, top: 3, right: -1, height: 1,
              background: iconColor,
            }} />
            <div style={{
              position: "absolute",
              left: 3, top: -1, bottom: -1, width: 1,
              background: iconColor,
            }} />
          </div>
        </div>

        <input
          id="client-url"
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder="https://your-client-business.com"
          spellCheck={false}
          autoComplete="off"
          required
          style={{
            flex: 1,
            height: "100%",
            border: "none",
            outline: "none",
            background: "transparent",
            color: "#f6f4ef",
            fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
            fontSize: 14,
            letterSpacing: "0.01em",
            caretColor: "#10b981",
          }}
        />

        {/* ⌘↵ hint */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          opacity: focused ? 1 : 0.55,
          transition: "opacity 220ms",
          flexShrink: 0,
        }}>
          <Kbd>⌘</Kbd>
          <Kbd>↵</Kbd>
        </div>
      </div>

      {/* Focus scan-line — travels left-to-right under the input */}
      {focused && (
        <div style={{
          position: "absolute",
          left: 14, right: 14, bottom: -1,
          height: 1,
          background: `linear-gradient(90deg,
            transparent 0%,
            rgba(16,185,129,0) ${((time * 60) % 100)}%,
            #10b981 ${((time * 60) % 100 + 4) % 100}%,
            rgba(16,185,129,0) ${((time * 60) % 100 + 14) % 100}%,
            transparent 100%
          )`,
          opacity: 0.6,
          pointerEvents: "none",
        }} />
      )}
    </div>
  );
}

// ── BuildCta ─────────────────────────────────────────────────────────────────
// Emerald CTA with pulse ring + halo + specular sweep + arrow.
// Must be type="submit" so the wrapping <form> owns submission.

function BuildCta({ disabled }: { disabled?: boolean }) {
  const time = useTime();
  const breath = 0.5 + 0.5 * Math.sin((time / HALO_PERIOD) * Math.PI * 2);
  const ringT = (time % HALO_PERIOD) / HALO_PERIOD;
  const ringScale = 1 + ringT * 0.06;
  const ringOpacity = (1 - ringT) * 0.35;
  const haloBase = 30 + 14 * breath;

  return (
    <div style={{ position: "relative" }}>
      {/* Expanding pulse ring */}
      <div style={{
        position: "absolute",
        inset: 0,
        borderRadius: 10,
        border: "1px solid #10b981",
        opacity: disabled ? 0 : ringOpacity,
        transform: `scale(${ringScale})`,
        pointerEvents: "none",
      }} />
      {/* Soft halo */}
      <div style={{
        position: "absolute",
        inset: -1,
        borderRadius: 11,
        boxShadow: `0 0 ${haloBase}px rgba(16,185,129,${0.30 + 0.15 * breath}),
                    0 8px 32px rgba(16,185,129,0.18),
                    inset 0 1px 0 rgba(255,255,255,0.22)`,
        pointerEvents: "none",
        opacity: disabled ? 0 : 1,
        transition: "opacity 220ms",
      }} />
      {/* Button surface */}
      <button
        type="submit"
        disabled={disabled}
        style={{
          position: "relative",
          width: "100%",
          height: 60,
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 10,
          background: "linear-gradient(180deg, #14c995 0%, #10b981 60%, #0f9f70 100%)",
          border: "none",
          borderRadius: 10,
          color: "#06100D",
          fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: "-0.005em",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.55 : 1,
          transition: "opacity 220ms",
          overflow: "hidden",
        }}
      >
        {/* Specular sweep */}
        <div style={{
          position: "absolute",
          top: 0, bottom: 0,
          width: 120,
          left: `${-30 + ((time * 8) % 130)}%`,
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)",
          pointerEvents: "none",
        }} />
        <span style={{ position: "relative" }}>Build workspace</span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ position: "relative" }}>
          <path
            d="M3 7h7M7 3.5l3.5 3.5L7 10.5"
            stroke="#06100D"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

// ── PhaseAside ───────────────────────────────────────────────────────────────
// Vertical timeline of 6 phases with sequential green shimmer (1s/phase, 6s cycle).

function PhaseAside() {
  const time = useTime();
  const cyclePos = (time % SHIMMER_CYCLE) / SHIMMER_STEP; // 0..6
  const activeIdx = Math.floor(cyclePos);
  const localT = cyclePos - activeIdx; // 0..1 within the active step
  // Triangle pulse — rises 0..0.5, falls 0.5..1
  const pulse = localT < 0.5 ? localT * 2 : (1 - localT) * 2;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Aside heading */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div style={{
            width: 6, height: 6, borderRadius: 3,
            background: "#10b981",
            boxShadow: "0 0 8px rgba(16,185,129,0.7)",
            animation: "sf-idle-pulse 1.6s ease-in-out infinite",
          }} />
          <div style={{
            fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
            fontSize: 10,
            color: "#a7f3d0",
            letterSpacing: "0.22em",
            fontWeight: 500,
          }}>
            LIVE BUILD
          </div>
        </div>
        <div style={{
          fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
          fontSize: 13,
          color: "rgba(246,244,239,0.55)",
          letterSpacing: "-0.005em",
          lineHeight: 1.35,
        }}>
          We&apos;ll narrate every step.
        </div>
      </div>

      {/* Phase list */}
      <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
        {/* Vertical timeline rail */}
        <div style={{
          position: "absolute",
          left: 4.5, top: 12, bottom: 12,
          width: 1,
          background: "linear-gradient(180deg, transparent, rgba(246,244,239,0.10) 12%, rgba(246,244,239,0.10) 88%, transparent)",
        }} />

        {IDLE_PHASES.map((ph, i) => {
          const isActive = i === activeIdx;
          const glow = isActive ? pulse : 0;
          const labelColor = `rgba(246,244,239,${0.28 + 0.42 * glow})`;
          const numberColor = `rgba(246,244,239,${0.40 + 0.40 * glow})`;
          const greenMix = glow * 0.85;

          return (
            <div key={ph.n} style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 14,
              padding: "11px 0",
              position: "relative",
            }}>
              {/* Dot */}
              <div style={{
                width: 10, height: 10,
                flexShrink: 0,
                marginTop: 4,
                borderRadius: 5,
                background: "#06100D",
                border: `1px solid rgba(167,243,208,${0.22 + 0.55 * glow})`,
                position: "relative",
                zIndex: 1,
              }}>
                <div style={{
                  position: "absolute",
                  inset: 2,
                  borderRadius: 2,
                  background: `rgba(16,185,129,${greenMix})`,
                  boxShadow: greenMix > 0.1
                    ? `0 0 ${10 + 12 * glow}px rgba(16,185,129,${greenMix * 0.9})`
                    : "none",
                  transition: "background 80ms linear",
                }} />
              </div>

              {/* Text block */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <div style={{
                    fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
                    fontSize: 9,
                    color: numberColor,
                    letterSpacing: "0.18em",
                  }}>
                    {String(ph.n).padStart(2, "0")}
                  </div>
                  <div style={{
                    fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
                    fontSize: 11,
                    fontWeight: 500,
                    color: isActive
                      ? `oklch(${85 - 5 * (1 - glow)}% ${0.14 * glow} 165)`
                      : labelColor,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    transition: "color 80ms linear",
                  }}>
                    {ph.name}
                  </div>
                </div>
                <div style={{
                  marginTop: 3,
                  fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
                  fontSize: 11,
                  color: `rgba(246,244,239,${0.22 + 0.18 * glow})`,
                  letterSpacing: "-0.005em",
                  lineHeight: 1.3,
                  transition: "color 80ms linear",
                }}>
                  {ph.hint}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Aside footer note */}
      <div style={{
        marginTop: 6,
        paddingTop: 14,
        borderTop: "1px dashed rgba(246,244,239,0.10)",
        fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
        fontSize: 9,
        color: "rgba(246,244,239,0.40)",
        letterSpacing: "0.18em",
        display: "flex", justifyContent: "space-between",
      }}>
        <span>~60S TOTAL</span>
        <span>FULLY EDITABLE AFTER</span>
      </div>
    </div>
  );
}

// ── IdleFooter ───────────────────────────────────────────────────────────────
// "READY · PRESS ⌘↵ TO LAUNCH" with drifting underline.

function IdleFooter() {
  const time = useTime();
  const drift = ((time * 30) % 120);
  return (
    <div style={{
      padding: "0 40px 36px",
      display: "flex", alignItems: "center", gap: 14,
      position: "relative",
    }}>
      <div style={{
        flex: 1, height: 1,
        background: `linear-gradient(90deg,
          transparent 0%,
          rgba(255,255,255,0.10) ${drift - 20}%,
          rgba(255,255,255,0.10) ${drift}%,
          transparent ${drift + 20}%
        )`,
      }} />
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
        fontSize: 9,
        color: "rgba(246,244,239,0.40)",
        letterSpacing: "0.20em",
      }}>
        <span>READY</span>
        <span style={{ color: "rgba(246,244,239,0.20)" }}>·</span>
        <span>PRESS ⌘↵ TO LAUNCH</span>
      </div>
      <div style={{
        flex: 1, height: 1,
        background: `linear-gradient(90deg,
          transparent 0%,
          rgba(255,255,255,0.10) ${100 - drift}%,
          transparent ${120 - drift}%
        )`,
      }} />
    </div>
  );
}

// ── HeroColumn ───────────────────────────────────────────────────────────────
// Kicker + h1 + subtext + form (UrlInput + BuildCta) + skip link.
// The <form> wraps input + button so Enter in the input triggers submit naturally.

type HeroColumnProps = {
  url: string;
  onUrlChange: (next: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
};

function HeroColumn({
  url,
  onUrlChange,
  onSubmit,
  disabled = false,
  focused,
  onFocus,
  onBlur,
}: HeroColumnProps) {
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      gap: 0,
      flex: 1, minWidth: 0,
    }}>
      {/* Kicker */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        marginBottom: 22,
      }}>
        <div style={{
          width: 18, height: 1,
          background: "rgba(16,185,129,0.55)",
        }} />
        <div style={{
          fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
          fontSize: 10,
          color: "#a7f3d0",
          letterSpacing: "0.22em",
          fontWeight: 500,
        }}>
          NEW CLIENT WORKSPACE
        </div>
      </div>

      {/* Headline */}
      <h1 style={{
        margin: 0,
        fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
        fontSize: 44,
        fontWeight: 600,
        color: "#f6f4ef",
        letterSpacing: "-0.025em",
        lineHeight: 1.05,
      }}>
        Spin up a client workspace<br />
        <span style={{ color: "rgba(246,244,239,0.40)", fontWeight: 500 }}>
          in 60 seconds.
        </span>
      </h1>

      {/* Subtext */}
      <p style={{
        margin: "20px 0 0",
        maxWidth: 380,
        fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
        fontSize: 14,
        color: "rgba(246,244,239,0.55)",
        letterSpacing: "-0.005em",
        lineHeight: 1.55,
      }}>
        Paste your client&apos;s website. We&apos;ll build their CRM, booking page,
        intake form, and AI chatbot in one pass.
      </p>

      {/* Form: input + CTA. Native form submit handles Enter key. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!url.trim()) return;
          onSubmit();
        }}
        style={{ marginTop: 36 }}
      >
        <UrlInput
          value={url}
          onChange={onUrlChange}
          focused={focused}
          onFocus={onFocus}
          onBlur={onBlur}
        />

        <div style={{ marginTop: 14 }}>
          <BuildCta disabled={disabled || !url.trim()} />
        </div>
      </form>

      {/* Skip link */}
      <div style={{
        marginTop: 16,
        display: "flex",
        justifyContent: "flex-end",
      }}>
        <Link
          href="/dashboard"
          style={{
            fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
            fontSize: 12,
            color: "rgba(246,244,239,0.40)",
            letterSpacing: "-0.005em",
            textDecoration: "none",
            display: "inline-flex", alignItems: "center", gap: 6,
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color = "rgba(246,244,239,0.70)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color = "rgba(246,244,239,0.40)";
          }}
        >
          <span style={{ borderBottom: "1px dotted rgba(246,244,239,0.30)", paddingBottom: 1 }}>
            Skip and set one up by hand
          </span>
          <span style={{ opacity: 0.7 }}>→</span>
        </Link>
      </div>
    </div>
  );
}

// ── Scene — rendered inside Stage (has access to TimelineContext) ─────────────

type SceneProps = {
  url: string;
  onUrlChange: (next: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  warm: number;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  errorOverlay?: ReactNode;
};

function Scene({
  url,
  onUrlChange,
  onSubmit,
  disabled,
  warm,
  focused,
  onFocus,
  onBlur,
  errorOverlay,
}: SceneProps) {
  return (
    <>
      <IdleBackdrop warm={warm} />
      <ParticleDrift />

      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
      }}>
        {/* Main content region — top padding increased to 60px (no header row) */}
        <div style={{
          flex: 1,
          padding: "60px 40px 40px",
          display: "flex",
          gap: 40,
          alignItems: "stretch",
          position: "relative",
        }}>
          {/* Corner registers around the hero panel */}
          <div style={{ position: "absolute", inset: "40px 40px 24px" }}>
            <RegisterMarks inset={0} size={8} color="rgba(167,243,208,0.16)" />
          </div>

          <HeroColumn
            url={url}
            onUrlChange={onUrlChange}
            onSubmit={onSubmit}
            disabled={disabled}
            focused={focused}
            onFocus={onFocus}
            onBlur={onBlur}
          />

          {/* Column divider */}
          <div style={{
            width: 1,
            background: "linear-gradient(180deg, transparent, rgba(246,244,239,0.10) 18%, rgba(246,244,239,0.10) 82%, transparent)",
            flexShrink: 0,
          }} />

          <div style={{ width: 200, flexShrink: 0 }}>
            <PhaseAside />
          </div>
        </div>

        <IdleFooter />
      </div>

      {/* Vignette — matches scene.jsx so crossfade lines up */}
      <div style={{
        position: "absolute", inset: 0,
        pointerEvents: "none",
        boxShadow: "inset 0 0 120px rgba(0,0,0,0.55)",
      }} />

      {/* Error overlay slot */}
      {errorOverlay && (
        <div style={{
          position: "absolute",
          left: 32, right: 32, bottom: 48,
          pointerEvents: "auto",
          zIndex: 10,
        }}>
          {errorOverlay}
        </div>
      )}
    </>
  );
}

// ── IdleScene — public export ─────────────────────────────────────────────────

export type IdleSceneProps = {
  url: string;
  onUrlChange: (next: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  errorOverlay?: ReactNode;
};

export function IdleScene({
  url,
  onUrlChange,
  onSubmit,
  disabled = false,
  errorOverlay,
}: IdleSceneProps) {
  const [focused, setFocused] = useState(false);
  // Smoothed warmth value (0..1) driven by focus state via RAF
  const [warm, setWarm] = useState(0);

  useEffect(() => {
    let raf: number;
    const target = focused ? 1 : 0;
    const step = () => {
      setWarm((w) => {
        const next = w + (target - w) * 0.08;
        if (Math.abs(target - next) < 0.005) return target;
        raf = requestAnimationFrame(step);
        return next;
      });
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [focused]);

  return (
    <>
      {/* Scoped keyframes for the sf-idle-pulse dot in PhaseAside */}
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

      <Stage
        width={720}
        height={960}
        duration={6}
        background="#06100D"
        active={true}
        loop
        reducedMotionFreezeAt={3}
      >
        <Scene
          url={url}
          onUrlChange={onUrlChange}
          onSubmit={onSubmit}
          disabled={disabled}
          warm={warm}
          focused={focused}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          errorOverlay={errorOverlay}
        />
      </Stage>
    </>
  );
}
