"use client";

import { useSprite } from "./sprite";
import { clamp } from "./easing";

// ── Phase 1: Scan ─────────────────────────────────────────────────────────────
// A faux browser window. URL "types in" early, then a soft emerald scan beam
// sweeps top-to-bottom. As the beam passes elements, they register with a
// small dot + corner ticks.

type CornerPos = "tl" | "tr" | "bl" | "br";

function CornerTick({ pos }: { pos: CornerPos }) {
  const styles: Record<CornerPos, React.CSSProperties> = {
    tl: { top: -1, left: -1, borderTop: "1px solid #10b981", borderLeft: "1px solid #10b981" },
    tr: { top: -1, right: -1, borderTop: "1px solid #10b981", borderRight: "1px solid #10b981" },
    bl: { bottom: -1, left: -1, borderBottom: "1px solid #10b981", borderLeft: "1px solid #10b981" },
    br: { bottom: -1, right: -1, borderBottom: "1px solid #10b981", borderRight: "1px solid #10b981" },
  };
  return <div style={{ position: "absolute", width: 6, height: 6, ...styles[pos] }} />;
}

export function BuildPhase1Scan() {
  const { localTime } = useSprite();
  const t = localTime;

  // URL typing animation (0 → 1.6s)
  const url = "https://maloney-plumbing.com";
  const typeT = clamp(t / 1.6, 0, 1);
  const shown = url.slice(0, Math.floor(typeT * url.length));
  const caretOn = Math.floor(t * 2) % 2 === 0;

  // Scan beam Y position over content area: 1.6s → 9.0s
  const beamProgress = clamp((t - 1.6) / 7.4, 0, 1);
  const beamY = 70 + beamProgress * 380; // content area runs 70..450

  const elements: Array<{
    y: number; w: number; h: number; label?: string; kind?: string; x?: number;
  }> = [
    { y: 92,  w: 220, h: 28, label: "logo" },
    { y: 138, w: 380, h: 18, label: "hero" },
    { y: 168, w: 320, h: 14, label: "hero-sub" },
    { y: 218, w: 120, h: 80, kind: "card" },
    { y: 218, w: 120, h: 80, kind: "card", x: 140 },
    { y: 218, w: 120, h: 80, kind: "card", x: 280 },
    { y: 218, w: 120, h: 80, kind: "card", x: 420 },
    { y: 326, w: 380, h: 14, label: "body" },
    { y: 348, w: 340, h: 14, label: "body" },
    { y: 370, w: 280, h: 14, label: "body" },
    { y: 410, w: 160, h: 30, label: "cta" },
  ];

  return (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: 560, height: 460,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        overflow: "hidden",
        position: "relative",
        boxShadow: "0 24px 60px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}>
        {/* Browser chrome */}
        <div style={{
          height: 36,
          display: "flex", alignItems: "center", gap: 8,
          padding: "0 14px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(255,255,255,0.02)",
        }}>
          <div style={{ display: "flex", gap: 6 }}>
            {(["#3a3a3a", "#3a3a3a", "#3a3a3a"] as const).map((c, i) => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: 4, background: c }} />
            ))}
          </div>
          <div style={{
            flex: 1,
            height: 22,
            background: "rgba(255,255,255,0.04)",
            borderRadius: 5,
            padding: "0 10px",
            display: "flex", alignItems: "center",
            fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
            fontSize: 11,
            color: "rgba(255,255,255,0.65)",
            letterSpacing: "0.01em",
          }}>
            {shown}
            <span style={{
              opacity: caretOn && typeT < 1 ? 1 : 0,
              marginLeft: 1,
              color: "#10b981",
            }}>▍</span>
          </div>
        </div>

        {/* Content area — abstract page blocks */}
        <div style={{ position: "relative", height: 424, padding: "0 24px" }}>
          {elements.map((el, i) => {
            const passed = beamY > el.y + el.h / 2;
            const justPassed = beamY > el.y + el.h / 2 && beamY < el.y + el.h / 2 + 12;
            return (
              <div key={i} style={{
                position: "absolute",
                top: el.y, left: (el.x ?? 0) + 24,
                width: el.w, height: el.h,
                background: el.kind === "card"
                  ? "rgba(255,255,255,0.04)"
                  : "rgba(255,255,255,0.06)",
                border: passed
                  ? "1px solid rgba(16,185,129,0.45)"
                  : "1px solid rgba(255,255,255,0.04)",
                borderRadius: el.kind === "card" ? 6 : 3,
                transition: "border-color 200ms ease",
              }}>
                {passed && (
                  <>
                    <CornerTick pos="tl" />
                    <CornerTick pos="tr" />
                    <CornerTick pos="bl" />
                    <CornerTick pos="br" />
                  </>
                )}
                {passed && (
                  <div style={{
                    position: "absolute",
                    top: -3, right: -3,
                    width: 6, height: 6,
                    borderRadius: 3,
                    background: "#10b981",
                    boxShadow: "0 0 8px rgba(16,185,129,0.6)",
                    opacity: justPassed ? 1 : 0.55,
                  }} />
                )}
              </div>
            );
          })}

          {/* Scan beam */}
          {t > 1.6 && (
            <>
              <div style={{
                position: "absolute",
                left: 0, right: 0,
                top: beamY,
                height: 2,
                background: "linear-gradient(90deg, transparent 0%, #10b981 20%, #34d399 50%, #10b981 80%, transparent 100%)",
                boxShadow: "0 0 24px rgba(16,185,129,0.45)",
                opacity: beamProgress < 1 ? 1 : 1 - clamp((t - 9) / 1, 0, 1),
              }} />
              {/* Trailing fade */}
              <div style={{
                position: "absolute",
                left: 0, right: 0,
                top: Math.max(0, beamY - 60),
                height: 60,
                background: "linear-gradient(180deg, transparent, rgba(16,185,129,0.06))",
                opacity: beamProgress < 1 ? 1 : 1 - clamp((t - 9) / 1, 0, 1),
                pointerEvents: "none",
              }} />
            </>
          )}
        </div>

        {/* Counter overlay */}
        <div style={{
          position: "absolute", top: 46, right: 18,
          fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
          fontSize: 10,
          color: "rgba(16,185,129,0.85)",
          letterSpacing: "0.06em",
          opacity: t > 1.6 ? 1 : 0,
          transition: "opacity 300ms",
        }}>
          {String(Math.floor(beamProgress * 47)).padStart(2, "0")} ELEMENTS
        </div>
      </div>
    </div>
  );
}
