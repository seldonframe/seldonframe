"use client";

// idle-scene.tsx — pre-submit "calm before the launch" state.
// Stage 720x960, 6s ambient loop. All helpers (IdleBackdrop, ParticleDrift,
// RegisterMarks, UrlInput, Kbd, BuildCta, PhaseAside, IdleFooter, HeroColumn)
// are internal — same pattern as index.tsx.
//
// Phase Q update (Claude Design v3):
//   - Added SegmentedTabs component (pill switcher: "Paste website URL" / "No website? Paste business info")
//   - Added BizInfoTextarea component (breathing focus glow + label strip + char counter)
//   - HeroColumn now accepts tab + tab handlers and conditionally renders UrlInput vs BizInfoTextarea
//   - Subtext swaps based on active tab
//   - Updated IdleScene external API to expose two submit callbacks (onUrlSubmit + onBizInfoSubmit)
//     and two input pairs (url/onUrlChange, bizInfo/onBizInfoChange); tab state is INTERNAL
//   - Build CTA wires to the active tab's submit handler
//
// Original external API (Phase P):
//   <IdleScene url={...} onUrlChange={...} onSubmit={...} disabled={...} errorOverlay={...} />
//
// Phase Q external API:
//   <IdleScene
//     url={...} onUrlChange={...} onUrlSubmit={...} urlDisabled={...}
//     bizInfo={...} onBizInfoChange={...} onBizInfoSubmit={...} bizInfoDisabled={...}
//     errorOverlay={...}
//   />
//
// Ported from Claude Design export (C:\Users\maxim\AppData\Local\Temp\phases-early.jsx)
// with the following changes from the brief:
//   - IdleHeader + IdleWordmark dropped (dashboard chrome already has them)
//   - url lifted to props; focused/warm/tab stay internal
//   - Input: type="url", id="client-url", required, accessible label
//   - BuildCta: <button type="button"> wired to active submit handler
//   - Skip link: <Link href="/dashboard"> via next/link
//   - Geist font variables prepended to every fontFamily
//   - Stage reducedMotionFreezeAt={3} for the 6s loop
//   - Top padding adjusted to 60px (no header row)

import { useState, useEffect, useCallback, type ReactNode } from "react";
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

// ── SegmentedTabs ────────────────────────────────────────────────────────────
// Two equal-weight tabs. Active gets a subtle elevated surface; inactive sits
// flat in the muted track.
// Ported from Claude Design v3 (idle-state-v2.jsx V2SegmentedTabs).
// Colors adapted from CSS-var design to dark-canvas palette used by the rest
// of this file.

type TabItem = {
  id: string;
  label: string;
  icon?: React.ReactNode;
};

type SegmentedTabsProps = {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
};

function SegmentedTabs({ tabs, value, onChange }: SegmentedTabsProps) {
  return (
    <div
      role="tablist"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
        gap: 3,
        padding: 3,
        background: "rgba(246,244,239,0.06)",
        border: "1px solid rgba(246,244,239,0.10)",
        borderRadius: 10,
      }}
    >
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            style={{
              position: "relative",
              height: 34,
              padding: "0 10px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              background: active ? "rgba(246,244,239,0.09)" : "transparent",
              border: active ? "1px solid rgba(246,244,239,0.12)" : "1px solid transparent",
              borderRadius: 7,
              boxShadow: active ? "0 1px 2px rgba(0,0,0,0.22)" : "none",
              color: active ? "#f6f4ef" : "rgba(246,244,239,0.50)",
              fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
              fontSize: 12,
              fontWeight: active ? 550 : 500,
              letterSpacing: "-0.005em",
              cursor: "pointer",
              transition: "color 160ms ease, background-color 180ms ease, box-shadow 180ms ease",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              overflow: "hidden",
            }}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── BizInfoTextarea ───────────────────────────────────────────────────────────
// Operator pastes Google Maps text, Business Profile dump, free-form notes.
// Breathing focus glow mirrors UrlInput. Label strip + char counter at top.
// Ported from Claude Design v3 (idle-state-v2.jsx V2BizInfoTextarea).

type BizInfoTextareaProps = {
  value: string;
  onChange: (next: string) => void;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
};

function BizInfoTextarea({ value, onChange, focused, onFocus, onBlur }: BizInfoTextareaProps) {
  const time = useTime();
  const breath = 0.5 + 0.5 * Math.sin((time / INPUT_PERIOD) * Math.PI * 2);
  const baseGlow = focused ? 0.55 : 0.22;
  const glowOpacity = baseGlow + (focused ? 0.15 : 0.08) * breath;
  const borderColor = focused
    ? `rgba(16,185,129,${0.55 + 0.20 * breath})`
    : `rgba(246,244,239,${0.10 + 0.04 * breath})`;
  const haloPx = focused ? 28 + 6 * breath : 14 + 3 * breath;

  return (
    <div style={{ position: "relative" }}>
      {/* Accessible label — visually hidden */}
      <label htmlFor="client-bizinfo" className="sr-only">
        Business information
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

      {/* Textarea shell */}
      <div style={{
        position: "relative",
        background: "rgba(6,16,13,0.65)",
        backdropFilter: "blur(2px)",
        border: `1px solid ${borderColor}`,
        borderRadius: 10,
        transition: "border-color 220ms ease-out",
        overflow: "hidden",
      }}>
        {/* Top label strip — mirrors the URL input's icon row */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 14px 6px",
          borderBottom: `1px solid rgba(246,244,239,${focused ? 0.10 : 0.07})`,
          transition: "border-color 220ms ease-out",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Lines icon */}
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M2.5 3.5h11M2.5 7.5h11M2.5 11.5h7"
                stroke={focused ? "#10b981" : "rgba(246,244,239,0.45)"}
                strokeWidth="1.4"
                strokeLinecap="round"
                style={{ transition: "stroke 220ms" }}
              />
            </svg>
            <span style={{
              fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
              fontSize: 12,
              fontWeight: 500,
              color: focused ? "rgba(246,244,239,0.80)" : "rgba(246,244,239,0.45)",
              letterSpacing: "-0.005em",
              transition: "color 220ms",
            }}>
              Business details
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{
              fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
              fontSize: 11,
              color: "rgba(246,244,239,0.35)",
              fontVariantNumeric: "tabular-nums",
            }}>
              {value.length.toLocaleString()}
            </span>
            <span style={{
              fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
              fontSize: 11,
              color: "rgba(246,244,239,0.35)",
            }}>
              chars
            </span>
          </div>
        </div>

        <textarea
          id="client-bizinfo"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          rows={5}
          spellCheck={false}
          placeholder="Paste everything you&apos;ve got — name, address, hours, services, reviews. Add a note at the end if you want me to lean a certain way."
          style={{
            display: "block",
            width: "100%",
            border: "none",
            outline: "none",
            resize: "none",
            background: "transparent",
            color: "#f6f4ef",
            fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
            fontSize: 13,
            lineHeight: 1.55,
            padding: "10px 14px 12px",
            caretColor: "#10b981",
            boxSizing: "border-box",
          }}
        />
      </div>
    </div>
  );
}

// ── BuildCta ─────────────────────────────────────────────────────────────────
// Emerald CTA with pulse ring + halo + specular sweep + arrow.
// Now type="button" — the caller (HeroColumn) provides the onClick handler
// so each tab's submit goes to the correct parent callback.

function BuildCta({ disabled, onClick }: { disabled?: boolean; onClick?: () => void }) {
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
        type="button"
        disabled={disabled}
        onClick={onClick}
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
// Phase Q update: renders a tab switcher above the input slot.
// Kicker + h1 + subtext (swaps per tab) + SegmentedTabs + input + BuildCta + skip link.
// Tab state is managed in IdleScene and passed down — HeroColumn is pure/presentational.

const HERO_TABS: TabItem[] = [
  {
    id: "url",
    label: "Paste website URL",
    icon: (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M2.5 8 H13.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 2.5 C 10 5, 10 11, 8 13.5 C 6 11, 6 5, 8 2.5 Z" stroke="currentColor" strokeWidth="1.3" fill="none" />
      </svg>
    ),
  },
  {
    id: "biz",
    label: "No website? Paste business info",
    icon: (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
        <path d="M3 3.5h10v9H3z" stroke="currentColor" strokeWidth="1.3" />
        <path d="M5.5 6.5h5M5.5 9.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
];

type HeroColumnProps = {
  // Tab state
  tab: "url" | "biz";
  onTabChange: (t: "url" | "biz") => void;
  // URL mode
  url: string;
  onUrlChange: (next: string) => void;
  onUrlSubmit: () => void;
  urlDisabled?: boolean;
  // Biz-info mode
  bizInfo: string;
  onBizInfoChange: (next: string) => void;
  onBizInfoSubmit: () => void;
  bizInfoDisabled?: boolean;
  // Shared input focus state
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
};

function HeroColumn({
  tab,
  onTabChange,
  url,
  onUrlChange,
  onUrlSubmit,
  urlDisabled = false,
  bizInfo,
  onBizInfoChange,
  onBizInfoSubmit,
  bizInfoDisabled = false,
  focused,
  onFocus,
  onBlur,
}: HeroColumnProps) {
  // Subtext swaps based on active tab
  const subtext =
    tab === "url"
      ? "Paste your client’s website. We’ll build their CRM, booking page, intake form, and AI chatbot in one pass."
      : "Tell us about the business. We’ll build their CRM, booking page, intake form, and AI chatbot in one pass.";

  // Active submit handler + disabled state for the CTA
  const activeSubmit = tab === "url" ? onUrlSubmit : onBizInfoSubmit;
  const activeDisabled =
    tab === "url"
      ? urlDisabled || !url.trim()
      : bizInfoDisabled || bizInfo.trim().length < 20;

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

      {/* Subtext — swaps based on active tab */}
      <p style={{
        margin: "20px 0 0",
        maxWidth: 380,
        fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
        fontSize: 14,
        color: "rgba(246,244,239,0.55)",
        letterSpacing: "-0.005em",
        lineHeight: 1.55,
        minHeight: "2.8em", // prevent layout shift on tab switch
      }}>
        {subtext}
      </p>

      {/* Tab switcher + input slot */}
      <div style={{ marginTop: 28 }}>
        <SegmentedTabs
          tabs={HERO_TABS}
          value={tab}
          onChange={(id) => onTabChange(id as "url" | "biz")}
        />

        <div style={{ marginTop: 12 }}>
          {tab === "url" ? (
            <UrlInput
              value={url}
              onChange={onUrlChange}
              focused={focused}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          ) : (
            <BizInfoTextarea
              value={bizInfo}
              onChange={onBizInfoChange}
              focused={focused}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <BuildCta
            disabled={activeDisabled}
            onClick={activeSubmit}
          />
        </div>
      </div>

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
  // Tab state
  tab: "url" | "biz";
  onTabChange: (t: "url" | "biz") => void;
  // URL mode
  url: string;
  onUrlChange: (next: string) => void;
  onUrlSubmit: () => void;
  urlDisabled?: boolean;
  // Biz-info mode
  bizInfo: string;
  onBizInfoChange: (next: string) => void;
  onBizInfoSubmit: () => void;
  bizInfoDisabled?: boolean;
  // Shared
  warm: number;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  errorOverlay?: ReactNode;
};

function Scene({
  tab,
  onTabChange,
  url,
  onUrlChange,
  onUrlSubmit,
  urlDisabled,
  bizInfo,
  onBizInfoChange,
  onBizInfoSubmit,
  bizInfoDisabled,
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
            tab={tab}
            onTabChange={onTabChange}
            url={url}
            onUrlChange={onUrlChange}
            onUrlSubmit={onUrlSubmit}
            urlDisabled={urlDisabled}
            bizInfo={bizInfo}
            onBizInfoChange={onBizInfoChange}
            onBizInfoSubmit={onBizInfoSubmit}
            bizInfoDisabled={bizInfoDisabled}
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
//
// Phase Q: tab state is INTERNAL. The parent provides two independent submit
// callbacks (onUrlSubmit, onBizInfoSubmit) and manages the input values for
// each mode. The Build CTA wires to whichever callback matches the active tab.

export type IdleSceneProps = {
  // URL mode
  url: string;
  onUrlChange: (next: string) => void;
  onUrlSubmit: () => void;
  urlDisabled?: boolean;
  // Biz-info mode (paste path)
  bizInfo: string;
  onBizInfoChange: (next: string) => void;
  onBizInfoSubmit: () => void;
  bizInfoDisabled?: boolean;
  // Shared
  errorOverlay?: ReactNode;
  // 2026-05-22 — Optional initial tab so the marketing-prompt forwarder
  // can land the visitor on the right input when they passed ?biz= (no
  // URL). Defaults to "url" — the more common path.
  initialTab?: "url" | "biz";
};

export function IdleScene({
  url,
  onUrlChange,
  onUrlSubmit,
  urlDisabled = false,
  bizInfo,
  onBizInfoChange,
  onBizInfoSubmit,
  bizInfoDisabled = false,
  errorOverlay,
  initialTab = "url",
}: IdleSceneProps) {
  const [focused, setFocused] = useState(false);
  // Tab state: internal to IdleScene. Parent only supplies per-mode callbacks.
  const [tab, setTabRaw] = useState<"url" | "biz">(initialTab);
  // Reset focus when switching tabs so the new input starts at rest
  const onTabChange = useCallback((t: "url" | "biz") => {
    setFocused(false);
    setTabRaw(t);
  }, []);
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
          tab={tab}
          onTabChange={onTabChange}
          url={url}
          onUrlChange={onUrlChange}
          onUrlSubmit={onUrlSubmit}
          urlDisabled={urlDisabled}
          bizInfo={bizInfo}
          onBizInfoChange={onBizInfoChange}
          onBizInfoSubmit={onBizInfoSubmit}
          bizInfoDisabled={bizInfoDisabled}
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
