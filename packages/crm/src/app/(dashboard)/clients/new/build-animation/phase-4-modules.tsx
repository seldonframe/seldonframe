"use client";

import { useSprite } from "./sprite";
import { clamp, Easing } from "./easing";

// ── Phase 4: Modules ──────────────────────────────────────────────────────────
// Five module cards rise into a 2-row grid. Each card has a subtle icon glyph,
// name, and one-line description. Stagger ~0.4s. Calm overshoot via easeOutCubic.

type IconKind = "people" | "calendar" | "inbox" | "spark" | "doc";

function ModuleIcon({ kind }: { kind: IconKind }) {
  const stroke = "#10b981";
  const sw = 1.4;
  const props = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke,
    strokeWidth: sw,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (kind) {
    case "people":
      return (
        <svg {...props}>
          <circle cx="9" cy="9" r="3"/>
          <path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6"/>
          <circle cx="17" cy="8" r="2.5"/>
          <path d="M14.5 14.5c1-.5 1.5-.5 2.5-.5 2.5 0 4 1.5 4 4"/>
        </svg>
      );
    case "calendar":
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="16" rx="2"/>
          <path d="M3 10h18M8 3v4M16 3v4"/>
          <circle cx="8" cy="15" r="1" fill={stroke} stroke="none"/>
        </svg>
      );
    case "inbox":
      return (
        <svg {...props}>
          <path d="M3 13l4-9h10l4 9v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5z"/>
          <path d="M3 13h5l1 2h6l1-2h5"/>
        </svg>
      );
    case "spark":
      return (
        <svg {...props}>
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>
          <circle cx="12" cy="12" r="2" fill={stroke} stroke="none"/>
        </svg>
      );
    case "doc":
      return (
        <svg {...props}>
          <path d="M6 3h9l4 4v12a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z"/>
          <path d="M15 3v4h4M8 13h7M8 17h5"/>
        </svg>
      );
  }
}

export function BuildPhase4Modules() {
  const { localTime } = useSprite();
  const t = localTime;

  const modules: Array<{ name: string; desc: string; icon: IconKind }> = [
    { name: "CRM",       desc: "Customers · jobs · notes",     icon: "people"   },
    { name: "Booking",   desc: "Calendar · slots · holds",     icon: "calendar" },
    { name: "Intake",    desc: "Forms · routing · triage",     icon: "inbox"    },
    { name: "Agents",    desc: "SMS · email · phone",          icon: "spark"    },
    { name: "Proposals", desc: "Quotes · signature · payment", icon: "doc"      },
  ];

  // 5 cards in a 3 + 2 grid
  const positions = [
    { col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 },
    { col: 0, row: 1 }, { col: 1, row: 1 },
  ];

  const cardW = 178, cardH = 192, gap = 12;
  const gridW = cardW * 3 + gap * 2;
  const startX = (608 - gridW) / 2;
  const startY = 56;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {modules.map((m, i) => {
        const pos = positions[i];
        const appear = 0.4 + i * 0.45;
        const p = clamp((t - appear) / 0.85, 0, 1);
        const eased = Easing.easeOutCubic(p);

        const x = startX + pos.col * (cardW + gap);
        const y = startY + pos.row * (cardH + gap);

        const fillStart = appear + 0.6;
        const fillP = clamp((t - fillStart) / 1.4, 0, 1);

        return (
          <div
            key={m.name}
            style={{
              position: "absolute",
              left: x, top: y,
              width: cardW, height: cardH,
              opacity: p,
              transform: `translateY(${(1 - eased) * 18}px)`,
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 10,
              padding: 16,
              display: "flex", flexDirection: "column",
              boxSizing: "border-box",
            }}
          >
            {/* Module index + icon */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "flex-start",
              marginBottom: 12,
            }}>
              <ModuleIcon kind={m.icon} />
              <div style={{
                fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
                fontSize: 9,
                color: "rgba(16,185,129,0.7)",
                letterSpacing: "0.12em",
              }}>
                M·{String(i + 1).padStart(2, "0")}
              </div>
            </div>

            {/* Name */}
            <div style={{
              fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
              fontSize: 17,
              fontWeight: 600,
              color: "#f6f4ef",
              letterSpacing: "-0.01em",
              marginBottom: 4,
            }}>
              {m.name}
            </div>
            <div style={{
              fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
              fontSize: 11,
              color: "rgba(246,244,239,0.5)",
              letterSpacing: "-0.005em",
              marginBottom: 14,
            }}>
              {m.desc}
            </div>

            {/* Progress slivers */}
            <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
              {([0, 1, 2] as const).map((s) => {
                const segStart = s / 3;
                const segEnd = (s + 1) / 3;
                const segP = clamp((fillP - segStart) / (segEnd - segStart), 0, 1);
                return (
                  <div key={s} style={{
                    height: 3,
                    background: "rgba(255,255,255,0.06)",
                    borderRadius: 1.5,
                    overflow: "hidden",
                  }}>
                    <div style={{
                      height: "100%",
                      width: `${segP * 100}%`,
                      background: segP === 1 ? "#10b981" : "rgba(16,185,129,0.7)",
                      transition: "background 200ms",
                    }} />
                  </div>
                );
              })}
              <div style={{
                fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
                fontSize: 9,
                color: fillP >= 1 ? "#10b981" : "rgba(246,244,239,0.4)",
                letterSpacing: "0.18em",
                marginTop: 4,
              }}>
                {fillP >= 1 ? "✓ READY" : `INSTALLING ${String(Math.floor(fillP * 100)).padStart(2, "0")}%`}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
