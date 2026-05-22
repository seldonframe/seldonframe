"use client";

// build-animation/index.tsx
// Root entry point. Replaces the single-file Phase O baseline.
// External API unchanged: <BuildAnimation active={boolean} />
//
// Layout: 720×960 canvas scaled to fit parent width.
// Backdrop → header (wordmark + phase progress) → 608×520 phase stage → footer caption.

import { useTime } from "./stage";
import { Stage } from "./stage";
import { Sprite } from "./sprite";
import { clamp } from "./easing";
import { BuildPhase1Scan } from "./phase-1-scan";
import { BuildPhase2Identity } from "./phase-2-identity";
import { BuildPhase3Structure } from "./phase-3-structure";
import { BuildPhase4Modules } from "./phase-4-modules";
import { BuildPhase5Activation } from "./phase-5-activation";
import { BuildPhase6Reveal } from "./phase-6-reveal";

// ── sf-pulse keyframe (scoped inline — doesn't pollute global CSS) ─────────────
const KEYFRAMES = `
  @keyframes sf-pulse {
    0%   { opacity: 1; transform: scale(1); }
    50%  { opacity: 0.55; transform: scale(0.85); }
    100% { opacity: 1; transform: scale(1); }
  }
`;

// ── PHASES array — preserving Claude Design copy verbatim ──────────────────────
const PHASE_DUR = 10; // seconds per phase
const FADE = 0.6;     // crossfade window at each boundary

const PHASES = [
  {
    n: 1,
    name: "Scan",
    title: "Reading the website",
    caption: "Crawling pages · parsing semantics · extracting text and structure",
    Component: BuildPhase1Scan,
    start: 0,
  },
  {
    n: 2,
    name: "Identity",
    title: "Detecting brand identity",
    caption: "Sampling palette · pulling services · learning the voice",
    Component: BuildPhase2Identity,
    start: 10,
  },
  {
    n: 3,
    name: "Structure",
    title: "Mapping business structure",
    caption: "Modeling entities and relationships into the workspace schema",
    Component: BuildPhase3Structure,
    start: 20,
  },
  {
    n: 4,
    name: "Modules",
    title: "Assembling core modules",
    caption: "CRM · Booking · Intake · Agents · Proposals",
    Component: BuildPhase4Modules,
    start: 30,
  },
  {
    n: 5,
    name: "Activation",
    title: "Wiring data + integrations",
    caption: "Seeding example records · linking external services",
    Component: BuildPhase5Activation,
    start: 40,
  },
  {
    n: 6,
    name: "Reveal",
    title: "Workspace ready",
    caption: "Take a look around — everything is editable",
    Component: BuildPhase6Reveal,
    start: 50,
  },
] as const;

// ── Backdrop ───────────────────────────────────────────────────────────────────
function Backdrop() {
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: `
        radial-gradient(circle at 15% 20%, rgba(16,185,129,0.06), transparent 50%),
        radial-gradient(circle at 85% 80%, rgba(16,185,129,0.04), transparent 55%),
        #06100D
      `,
    }}>
      {/* Faint grid */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)
        `,
        backgroundSize: "32px 32px",
        maskImage: "radial-gradient(ellipse at center, black 30%, transparent 80%)",
        WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 80%)",
      }} />
    </div>
  );
}

// ── Wordmark ───────────────────────────────────────────────────────────────────
function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="3" stroke="#10b981" strokeWidth="1.5" />
        <path d="M8 12L11 15L16 9" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{
        fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
        fontSize: 13,
        fontWeight: 600,
        color: "#f6f4ef",
        letterSpacing: "-0.01em",
      }}>
        Seldon<span style={{ color: "rgba(246,244,239,0.55)", fontWeight: 500 }}>Frame</span>
      </div>
    </div>
  );
}

// ── PhaseProgress ──────────────────────────────────────────────────────────────
function PhaseProgress() {
  const time = useTime();
  return (
    <div style={{ display: "flex", gap: 5, width: "100%" }}>
      {PHASES.map((ph, i) => {
        const start = i * PHASE_DUR;
        const end = start + PHASE_DUR;
        const p = clamp((time - start) / PHASE_DUR, 0, 1);
        const past = time >= end;
        const active = time >= start && time < end;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{
              height: 3,
              background: "rgba(255,255,255,0.07)",
              borderRadius: 1.5,
              overflow: "hidden",
              position: "relative",
            }}>
              <div style={{
                position: "absolute", inset: 0,
                width: `${p * 100}%`,
                background: past ? "rgba(16,185,129,0.55)" : "#10b981",
                transition: "width 80ms linear",
              }} />
            </div>
            <div style={{
              fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
              fontSize: 9,
              color: active
                ? "#10b981"
                : past
                  ? "rgba(246,244,239,0.45)"
                  : "rgba(246,244,239,0.25)",
              letterSpacing: "0.12em",
            }}>
              {String(i + 1).padStart(2, "0")} · {ph.name.toUpperCase()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── HeaderBlock ────────────────────────────────────────────────────────────────
function HeaderBlock() {
  const time = useTime();
  const remaining = Math.max(0, Math.ceil(60 - time));
  const phaseIdx = Math.min(PHASES.length - 1, Math.floor(time / PHASE_DUR));
  const ph = PHASES[phaseIdx];

  return (
    <div style={{ padding: "36px 40px 0", display: "flex", flexDirection: "column", gap: 22 }}>
      {/* Top row: wordmark + status + countdown */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Wordmark />
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "4px 10px",
            background: "rgba(16,185,129,0.10)",
            border: "1px solid rgba(16,185,129,0.30)",
            borderRadius: 999,
            fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
            fontSize: 9,
            color: "#a7f3d0",
            letterSpacing: "0.18em",
          }}>
            <div style={{
              width: 5, height: 5, borderRadius: 3, background: "#10b981",
              animation: "sf-pulse 1.6s ease-in-out infinite",
            }} />
            LIVE BUILD
          </div>
        </div>
        <div style={{
          fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
          fontSize: 11,
          color: "rgba(246,244,239,0.55)",
          letterSpacing: "0.08em",
          fontVariantNumeric: "tabular-nums",
        }}>
          ~ <span style={{ color: "#f6f4ef" }}>{String(remaining).padStart(2, "0")}s</span> remaining
        </div>
      </div>

      {/* Progress */}
      <PhaseProgress />

      {/* Phase title */}
      <div>
        <div style={{
          fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
          fontSize: 10,
          color: "rgba(16,185,129,0.85)",
          letterSpacing: "0.22em",
          marginBottom: 6,
        }}>
          PHASE {String(ph.n).padStart(2, "0")} / 06
        </div>
        <div style={{
          fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
          fontSize: 22,
          fontWeight: 600,
          color: "#f6f4ef",
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
        }}>
          {ph.title}
        </div>
      </div>
    </div>
  );
}

// ── FooterBlock ────────────────────────────────────────────────────────────────
function FooterBlock() {
  const time = useTime();
  const phaseIdx = Math.min(PHASES.length - 1, Math.floor(time / PHASE_DUR));
  const ph = PHASES[phaseIdx];
  const local = time - phaseIdx * PHASE_DUR;
  let opacity = 1;
  if (local < 0.4) opacity = clamp(local / 0.4, 0, 1);
  else if (local > PHASE_DUR - 0.4) opacity = clamp((PHASE_DUR - local) / 0.4, 0, 1);

  return (
    <div style={{
      padding: "0 40px 36px",
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{
        flex: 1, height: 1,
        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)",
      }} />
      <div style={{
        fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
        fontSize: 12,
        color: "rgba(246,244,239,0.6)",
        letterSpacing: "-0.005em",
        textAlign: "center",
        opacity,
        maxWidth: 480,
      }}>
        {ph.caption}
      </div>
      <div style={{
        flex: 1, height: 1,
        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)",
      }} />
    </div>
  );
}

// ── PhaseSwitcher ──────────────────────────────────────────────────────────────
function PhaseSwitcher() {
  const time = useTime();

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {PHASES.map((ph, i) => {
        const start = ph.start;
        const end = start + PHASE_DUR;
        const renderStart = start - FADE;
        const renderEnd = end + FADE;
        if (time < renderStart || time > renderEnd) return null;

        let opacity = 1;
        if (time < start) opacity = clamp((time - renderStart) / FADE, 0, 1);
        else if (time > end) opacity = clamp((renderEnd - time) / FADE, 0, 1);

        return (
          <div key={ph.n} style={{
            position: "absolute", inset: 0,
            opacity,
            transition: "opacity 60ms linear",
          }}>
            <Sprite start={start} end={end} keepMounted>
              <ph.Component />
            </Sprite>
          </div>
        );
      })}
    </div>
  );
}

// ── Scene — rendered inside Stage (has access to TimelineContext) ──────────────
function Scene() {
  return (
    <>
      <Backdrop />

      {/* Layout column */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <HeaderBlock />

        {/* Phase stage — 608×520 centered */}
        <div style={{
          flex: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative",
          margin: "24px 0",
        }}>
          <div style={{ position: "relative", width: 608, height: 520 }}>
            <PhaseSwitcher />
          </div>
        </div>

        {/* Footer caption */}
        <FooterBlock />
      </div>

      {/* Vignette */}
      <div style={{
        position: "absolute", inset: 0,
        pointerEvents: "none",
        boxShadow: "inset 0 0 120px rgba(0,0,0,0.55)",
      }} />
    </>
  );
}

// ── BuildAnimation — public export ─────────────────────────────────────────────
// Prop API is identical to the Phase O baseline:
//   <BuildAnimation active={submitting} />

export function BuildAnimation({ active }: { active: boolean }) {
  return (
    <>
      {/* Scoped keyframes for the sf-pulse dot in HeaderBlock */}
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

      <Stage
        width={720}
        height={960}
        duration={60}
        background="#06100D"
        active={active}
        loop={true}
      >
        <Scene />
      </Stage>
    </>
  );
}
