// packages/crm/src/app/(dashboard)/clients/new/build-animation.tsx
// 6-phase animated "money shot" panel for the /clients/new build screen.
//
// Renders during the ~60s workspace creation window.
// Pure CSS animations — no Lottie or external animation deps.
// Honors prefers-reduced-motion by disabling all animation.
// Brand color: #10b981 (emerald / SeldonFrame teal) throughout.
"use client";

import { useEffect, useState } from "react";

const PHASES = [
  { id: "scan", label: "Reading the client website", durationMs: 10_000 },
  { id: "identity", label: "Detecting brand and services", durationMs: 10_000 },
  { id: "structure", label: "Mapping business structure", durationMs: 10_000 },
  { id: "modules", label: "Assembling core modules", durationMs: 10_000 },
  { id: "activation", label: "Wiring data and integrations", durationMs: 10_000 },
  { id: "reveal", label: "Your workspace is ready", durationMs: Infinity },
] as const;

type PhaseId = (typeof PHASES)[number]["id"];

export function BuildAnimation({ active }: { active: boolean }) {
  const [phaseIdx, setPhaseIdx] = useState(0);

  useEffect(() => {
    if (!active) {
      setPhaseIdx(0);
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    let cumulativeMs = 0;
    for (let i = 0; i < PHASES.length - 1; i++) {
      cumulativeMs += PHASES[i].durationMs;
      const idx = i + 1;
      timers.push(setTimeout(() => setPhaseIdx(idx), cumulativeMs));
    }
    return () => timers.forEach(clearTimeout);
  }, [active]);

  const currentPhase = PHASES[phaseIdx];

  return (
    <div
      role="status"
      className="relative rounded-2xl border border-border/70 bg-card/40 overflow-hidden"
      style={{ minHeight: "480px" }}
    >
      {/* Background dot-grid pattern */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: 0.05,
          backgroundImage:
            "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
        aria-hidden="true"
      />

      {/* Ambient falling digit particles */}
      <DigitParticles active={active} />

      {/* Phase indicator */}
      <div className="relative px-6 pt-6 pb-3 border-b border-border/40">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
          Live build &middot; Phase {phaseIdx + 1} of 6
        </p>
        {/* aria-live so screen readers announce each phase change */}
        <h3
          aria-live="polite"
          className="mt-1 text-2xl font-semibold tracking-tight transition-all duration-500"
        >
          {currentPhase.label}
        </h3>
      </div>

      {/* Per-phase visualization stage */}
      <div className="relative p-6 h-[360px]">
        {phaseIdx === 0 && <ScanPhase />}
        {phaseIdx === 1 && <IdentityPhase />}
        {phaseIdx === 2 && <StructurePhase />}
        {phaseIdx === 3 && <ModulesPhase />}
        {phaseIdx === 4 && <ActivationPhase />}
        {phaseIdx === 5 && <RevealPhase />}
      </div>

      {/* Phase progress bar dots */}
      <div
        className="relative px-6 pb-5 flex items-center gap-1.5"
        aria-hidden="true"
      >
        {PHASES.map((p, i) => (
          <span
            key={p.id}
            className="h-1 flex-1 rounded-full transition-all duration-500"
            style={{
              backgroundColor:
                i <= phaseIdx ? "#10b981" : "var(--border)",
              opacity: i <= phaseIdx ? 1 : 0.4,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Shared keyframes injected once per phase ──────────────────────────────

const SHARED_STYLES = `
  @keyframes sf-scan-beam {
    0%   { transform: translateY(0);    opacity: 0; }
    10%  { opacity: 1; }
    90%  { opacity: 1; }
    100% { transform: translateY(100%); opacity: 0; }
  }
  @keyframes sf-fade-scale-in {
    0%   { opacity: 0; transform: scale(0.85); }
    100% { opacity: 1; transform: scale(1); }
  }
  @keyframes sf-slide-in {
    0%   { opacity: 0; transform: translateY(20px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes sf-grow-row {
    0%   { transform: scaleX(0); opacity: 0; }
    100% { transform: scaleX(1); opacity: 1; }
  }
  @keyframes sf-reveal {
    0%   { opacity: 0; transform: scale(0.92); }
    100% { opacity: 1; transform: scale(1); }
  }
  @keyframes sf-draw-line {
    0%   { stroke-dashoffset: 200; opacity: 0; }
    50%  { opacity: 0.4; }
    100% { stroke-dashoffset: 0;   opacity: 0.4; }
  }
  @keyframes sf-digit-fall {
    0%   { transform: translateY(-20px); opacity: 0; }
    10%  { opacity: 1; }
    90%  { opacity: 1; }
    100% { transform: translateY(500px); opacity: 0; }
  }
  @keyframes sf-pulse-ring {
    0%   { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16,185,129,0.5); }
    70%  { transform: scale(1);    box-shadow: 0 0 0 16px rgba(16,185,129,0); }
    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16,185,129,0); }
  }
  @media (prefers-reduced-motion: reduce) {
    * { animation: none !important; transition: none !important; }
  }
`;

// ─── Phase 1: Scan ─────────────────────────────────────────────────────────

function ScanPhase() {
  return (
    <div className="relative h-full flex items-center justify-center">
      <style>{SHARED_STYLES}</style>

      {/* Faux website thumbnail */}
      <div className="w-full max-w-md aspect-video rounded-lg border border-border/50 bg-card/60 relative overflow-hidden shadow-md">
        {/* Nav bar simulation */}
        <div className="absolute top-0 left-0 right-0 h-5 bg-muted/40 border-b border-border/40 flex items-center gap-1.5 px-2">
          <span className="size-1.5 rounded-full bg-red-400/50" />
          <span className="size-1.5 rounded-full bg-yellow-400/50" />
          <span className="size-1.5 rounded-full bg-green-400/50" />
          <div className="ml-2 h-1.5 w-28 rounded bg-muted/60" />
        </div>
        {/* Hero line */}
        <div className="absolute top-7 left-3 right-3 h-2.5 rounded bg-muted/50" />
        {/* Content skeleton lines */}
        <div className="absolute top-12 left-3 right-3 space-y-1.5">
          <div className="h-1.5 rounded bg-muted/40 w-3/4" />
          <div className="h-1.5 rounded bg-muted/40 w-1/2" />
          <div className="h-1.5 rounded bg-muted/40 w-2/3" />
        </div>
        {/* Content block placeholders */}
        <div className="absolute top-24 left-3 right-3 grid grid-cols-3 gap-1.5">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-8 rounded bg-muted/30 border border-border/30"
            />
          ))}
        </div>
        {/* Scanning beam */}
        <div
          className="absolute top-0 left-0 right-0 h-0.5 shadow-[0_0_20px_rgba(16,185,129,0.8),0_0_6px_rgba(16,185,129,1)]"
          style={{
            background:
              "linear-gradient(to bottom, rgba(16,185,129,0.9), transparent)",
            animation:
              "sf-scan-beam 2s cubic-bezier(0.4,0,0.2,1) infinite",
          }}
          aria-hidden="true"
        />
        {/* Particle trail under beam */}
        <div
          className="absolute top-0 left-0 right-0 h-8 pointer-events-none"
          style={{
            background:
              "linear-gradient(to bottom, rgba(16,185,129,0.08), transparent)",
            animation:
              "sf-scan-beam 2s cubic-bezier(0.4,0,0.2,1) infinite",
          }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

// ─── Phase 2: Identity ─────────────────────────────────────────────────────

function IdentityPhase() {
  const tags = [
    "Roofing",
    "Storm damage",
    "Residential",
    "Insurance claims",
    "Free estimates",
  ];

  return (
    <div className="relative h-full flex flex-col items-center justify-center gap-6">
      <style>{SHARED_STYLES}</style>

      {/* Brand logo + color swatch row */}
      <div className="flex items-center gap-4">
        <div
          className="size-16 rounded-2xl border-2 border-emerald-500/60 bg-emerald-500/20 flex items-center justify-center text-2xl font-bold text-emerald-600"
          style={{
            animation:
              "sf-fade-scale-in 600ms cubic-bezier(0.4,0,0.2,1) both",
            boxShadow: "0 0 30px rgba(16,185,129,0.3)",
          }}
        >
          R
        </div>
        <div className="space-y-1.5">
          <div
            className="h-3 w-36 rounded bg-emerald-500/50"
            style={{
              animation:
                "sf-fade-scale-in 600ms cubic-bezier(0.4,0,0.2,1) 200ms both",
            }}
          />
          <div
            className="h-2 w-24 rounded bg-muted/50"
            style={{
              animation:
                "sf-fade-scale-in 600ms cubic-bezier(0.4,0,0.2,1) 350ms both",
            }}
          />
          {/* Brand color swatches */}
          <div className="flex gap-1.5 pt-1">
            {["#10b981", "#059669", "#d1fae5", "#1e293b"].map((c, i) => (
              <div
                key={c}
                className="size-3 rounded-sm border border-border/40"
                style={{
                  backgroundColor: c,
                  animation: `sf-fade-scale-in 400ms cubic-bezier(0.4,0,0.2,1) ${500 + i * 100}ms both`,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Service tags */}
      <div className="flex flex-wrap justify-center gap-2 max-w-xs">
        {tags.map((tag, i) => (
          <span
            key={tag}
            className="px-3 py-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-xs font-medium text-emerald-700 dark:text-emerald-400"
            style={{
              animation: `sf-fade-scale-in 500ms cubic-bezier(0.4,0,0.2,1) ${900 + i * 180}ms both`,
            }}
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Phase 3: Structure ────────────────────────────────────────────────────

const NODES = [
  { label: "CRM", x: "20%", y: "22%" },
  { label: "Booking", x: "72%", y: "22%" },
  { label: "Intake", x: "14%", y: "68%" },
  { label: "Agents", x: "52%", y: "72%" },
  { label: "Proposals", x: "84%", y: "62%" },
] as const;

// SVG line pairs [from-index, to-index]
const EDGES: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 3],
  [3, 4],
  [2, 3],
];

function StructurePhase() {
  return (
    <div className="relative h-full">
      <style>{SHARED_STYLES}</style>

      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden="true"
      >
        {EDGES.map(([a, b], i) => (
          <line
            key={i}
            x1={NODES[a].x}
            y1={NODES[a].y}
            x2={NODES[b].x}
            y2={NODES[b].y}
            stroke="#10b981"
            strokeOpacity="0.4"
            strokeWidth="1.5"
            strokeDasharray="5 4"
            style={{
              animation: `sf-draw-line 1.2s ease-out ${350 + i * 280}ms both`,
            }}
          />
        ))}
      </svg>

      {NODES.map((node, i) => (
        <div
          key={node.label}
          className="absolute -translate-x-1/2 -translate-y-1/2 px-3.5 py-1.5 rounded-lg border-2 border-emerald-500 bg-card text-xs font-semibold"
          style={{
            left: node.x,
            top: node.y,
            boxShadow: "0 0 20px rgba(16,185,129,0.35)",
            animation: `sf-fade-scale-in 500ms cubic-bezier(0.4,0,0.2,1) ${i * 200}ms both`,
          }}
        >
          {node.label}
        </div>
      ))}
    </div>
  );
}

// ─── Phase 4: Modules ──────────────────────────────────────────────────────

const MODULES = [
  { name: "CRM Pipeline", desc: "Lead → Qualified → Won" },
  { name: "Booking page", desc: "Calendly-style scheduler" },
  { name: "Intake form", desc: "Custom service questions" },
  { name: "AI chatbot", desc: "Trained on your soul" },
  { name: "Proposals", desc: "Branded + signable" },
] as const;

function ModulesPhase() {
  return (
    <div className="relative h-full grid grid-cols-2 gap-3 content-start">
      <style>{SHARED_STYLES}</style>
      {MODULES.map((mod, i) => (
        <div
          key={mod.name}
          className="rounded-xl border border-emerald-500/40 bg-card/70 p-3 space-y-0.5"
          style={{
            animation: `sf-slide-in 700ms cubic-bezier(0.4,0,0.2,1) ${i * 220}ms both`,
          }}
        >
          <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            {mod.name}
          </p>
          <p className="text-xs text-muted-foreground">{mod.desc}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Phase 5: Activation ───────────────────────────────────────────────────

function ActivationPhase() {
  const cardLabels = ["CRM Pipeline", "Booking", "Intake Form", "AI Chatbot"];
  return (
    <div className="relative h-full grid grid-cols-2 gap-3 content-start">
      <style>{SHARED_STYLES}</style>
      {cardLabels.map((label, i) => (
        <div
          key={label}
          className="rounded-xl border border-emerald-500/50 bg-card/70 p-3 space-y-2 relative overflow-hidden"
          style={{
            animation: `sf-fade-scale-in 400ms cubic-bezier(0.4,0,0.2,1) ${i * 150}ms both`,
          }}
        >
          <p className="text-xs uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">
            {label}
          </p>
          {/* Data rows growing in */}
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              className="h-2 rounded bg-emerald-500/30"
              style={{
                animation: `sf-grow-row 600ms cubic-bezier(0.4,0,0.2,1) ${i * 300 + row * 200 + 300}ms both`,
                transformOrigin: "left center",
              }}
            />
          ))}
          {/* Subtle shimmer overlay to imply data flowing in */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(16,185,129,0.05) 50%, transparent 100%)",
              backgroundSize: "200% 100%",
              animation: `sf-scan-beam 1.5s ease-in-out ${i * 200}ms infinite`,
            }}
            aria-hidden="true"
          />
        </div>
      ))}
    </div>
  );
}

// ─── Phase 6: Reveal ───────────────────────────────────────────────────────

function RevealPhase() {
  return (
    <div
      className="relative h-full flex flex-col items-center justify-center text-center space-y-5"
      style={{
        animation: "sf-reveal 800ms cubic-bezier(0.4,0,0.2,1) both",
      }}
    >
      <style>{SHARED_STYLES}</style>

      {/* Checkmark badge with pulse ring */}
      <div
        className="size-24 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-4xl"
        style={{
          boxShadow: "0 0 60px rgba(16,185,129,0.5)",
          animation: "sf-pulse-ring 2s ease-in-out infinite",
        }}
        aria-hidden="true"
      >
        ✓
      </div>

      <div className="space-y-1.5">
        <p className="text-2xl font-semibold tracking-tight">
          Workspace ready
        </p>
        <p className="text-sm text-muted-foreground">
          Finalizing the redirect&hellip;
        </p>
      </div>

      {/* Mini dashboard mockup hinting at what's coming */}
      <div className="w-full max-w-xs rounded-xl border border-emerald-500/30 bg-card/60 p-3 grid grid-cols-3 gap-2">
        {["CRM", "Bookings", "Inbox"].map((tab, i) => (
          <div
            key={tab}
            className="rounded-lg border border-border/50 bg-background/60 p-2 text-center"
            style={{
              animation: `sf-fade-scale-in 500ms cubic-bezier(0.4,0,0.2,1) ${600 + i * 150}ms both`,
            }}
          >
            <p className="text-[10px] text-muted-foreground font-medium">
              {tab}
            </p>
            <div className="mt-1 h-1 rounded bg-emerald-500/40" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Ambient digit particles (low-opacity background detail) ───────────────

function DigitParticles({ active }: { active: boolean }) {
  // Pre-generate deterministic positions — no random() calls to avoid
  // hydration mismatch or layout thrash between renders.
  const cols = 24;
  const items = Array.from({ length: cols }).map((_, i) => ({
    left: `${(i / cols) * 100}%`,
    delay: (i * 137) % 6000,
    duration: 4000 + ((i * 199) % 4000),
    // Deterministic binary-ish string from index
    chars: ((i * 17 + 13) >>> 0).toString(2).padStart(12, "0").slice(0, 10),
  }));

  if (!active) return null;

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{ opacity: 0.1 }}
      aria-hidden="true"
    >
      {items.map((item, i) => (
        <span
          key={i}
          className="absolute top-0 text-[10px] font-mono text-emerald-500 whitespace-nowrap select-none"
          style={{
            left: item.left,
            animation: `sf-digit-fall ${item.duration}ms linear ${item.delay}ms infinite`,
          }}
        >
          {item.chars}
        </span>
      ))}
    </div>
  );
}
