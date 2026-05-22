"use client";

import { useSprite } from "./sprite";
import { clamp, Easing } from "./easing";

// ── Phase 2: Identity ─────────────────────────────────────────────────────────
// Three color swatches lift out of the void, then a row of service tags
// materializes word-by-word. A "brand name" line crystallizes at the top.

export function BuildPhase2Identity() {
  const { localTime } = useSprite();
  const t = localTime;

  // Brand name reveals 0.4s → 1.6s, letter by letter
  const brandName = "Maloney Plumbing";
  const nameProgress = clamp((t - 0.4) / 1.2, 0, 1);
  const nameLen = Math.ceil(nameProgress * brandName.length);

  // Tagline fades in 1.8s → 2.6s
  const taglineOpacity = clamp((t - 1.8) / 0.8, 0, 1);

  const swatches = [
    { color: "#0E5C3E", label: "#0E5C3E", sub: "PRIMARY" },
    { color: "#F4F1EA", label: "#F4F1EA", sub: "PAPER" },
    { color: "#1A1410", label: "#1A1410", sub: "INK" },
    { color: "#D97757", label: "#D97757", sub: "ACCENT" },
  ];

  const tags = [
    "Emergency repair",
    "Water heaters",
    "Drain cleaning",
    "Re-piping",
    "Fixture install",
    "Inspections",
  ];

  // Voice / tone descriptors 8.0s
  const voiceProgress = clamp((t - 8.0) / 1.4, 0, 1);

  return (
    <div style={{
      position: "absolute", inset: 0,
      padding: "32px 40px",
      display: "flex", flexDirection: "column",
      gap: 28,
    }}>
      {/* Brand name */}
      <div>
        <div style={{
          fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
          fontSize: 10,
          color: "rgba(16,185,129,0.85)",
          letterSpacing: "0.18em",
          marginBottom: 10,
        }}>
          ◢ BRAND
        </div>
        <div style={{
          fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
          fontSize: 38,
          fontWeight: 600,
          color: "#f6f4ef",
          letterSpacing: "-0.02em",
          lineHeight: 1,
          minHeight: 42,
        }}>
          {brandName.slice(0, nameLen)}
          {nameProgress < 1 && (
            <span style={{ color: "#10b981", opacity: 0.7 }}>▌</span>
          )}
        </div>
        <div style={{
          marginTop: 10,
          fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
          fontSize: 15,
          color: "rgba(246,244,239,0.55)",
          opacity: taglineOpacity,
          transform: `translateY(${(1 - taglineOpacity) * 6}px)`,
          letterSpacing: "-0.005em",
        }}>
          Family-owned residential plumbing · Portland, OR · est. 1996
        </div>
      </div>

      {/* Swatch row */}
      <div>
        <div style={{
          fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
          fontSize: 10,
          color: "rgba(255,255,255,0.45)",
          letterSpacing: "0.18em",
          marginBottom: 12,
        }}>
          PALETTE
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {swatches.map((s, i) => {
            const sStart = 3.0 + i * 0.18;
            const sP = clamp((t - sStart) / 0.6, 0, 1);
            const eased = Easing.easeOutCubic(sP);
            return (
              <div key={i} style={{
                width: 116,
                opacity: sP,
                transform: `translateY(${(1 - eased) * 14}px)`,
              }}>
                <div style={{
                  height: 86,
                  background: s.color,
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.08)",
                }} />
                <div style={{
                  marginTop: 8,
                  fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
                  fontSize: 10,
                  color: "rgba(246,244,239,0.75)",
                  letterSpacing: "0.04em",
                }}>
                  {s.label}
                </div>
                <div style={{
                  fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
                  fontSize: 9,
                  color: "rgba(246,244,239,0.35)",
                  letterSpacing: "0.18em",
                  marginTop: 2,
                }}>
                  {s.sub}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Services */}
      <div>
        <div style={{
          fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
          fontSize: 10,
          color: "rgba(255,255,255,0.45)",
          letterSpacing: "0.18em",
          marginBottom: 12,
        }}>
          SERVICES · {String(Math.min(tags.length, Math.max(0, Math.floor((t - 5.5) / 0.3) + 1))).padStart(2, "0")}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {tags.map((tag, i) => {
            const tStart = 5.5 + i * 0.28;
            const tP = clamp((t - tStart) / 0.45, 0, 1);
            const eased = Easing.easeOutCubic(tP);
            return (
              <div key={i} style={{
                fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
                fontSize: 13,
                fontWeight: 500,
                padding: "7px 12px",
                background: "rgba(16,185,129,0.08)",
                border: "1px solid rgba(16,185,129,0.28)",
                color: "rgba(167,243,208,0.95)",
                borderRadius: 999,
                opacity: tP,
                transform: `translateY(${(1 - eased) * 6}px) scale(${0.96 + eased * 0.04})`,
                letterSpacing: "-0.005em",
              }}>
                {tag}
              </div>
            );
          })}
        </div>
      </div>

      {/* Voice */}
      <div style={{
        marginTop: "auto",
        display: "flex", gap: 24,
        opacity: voiceProgress,
        transform: `translateY(${(1 - voiceProgress) * 8}px)`,
      }}>
        {[
          { label: "VOICE",   value: "Direct, neighborly" },
          { label: "PRICING", value: "Up-front, flat-rate" },
          { label: "HOURS",   value: "24/7 emergency" },
        ].map((v, i) => (
          <div key={i} style={{ flex: 1 }}>
            <div style={{
              fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
              fontSize: 9,
              color: "rgba(255,255,255,0.35)",
              letterSpacing: "0.18em",
              marginBottom: 4,
            }}>
              {v.label}
            </div>
            <div style={{
              fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
              fontSize: 13,
              color: "rgba(246,244,239,0.85)",
              fontWeight: 500,
              letterSpacing: "-0.005em",
            }}>
              {v.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
