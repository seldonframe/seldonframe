"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";

type KpiTone = "neutral" | "accent" | "positive" | "caution" | "negative";

const tones: Record<KpiTone, { chipBg: string; chipFg: string }> = {
  neutral:  { chipBg: "var(--gray-100)",      chipFg: "var(--gray-600)" },
  accent:   { chipBg: "var(--accent-soft-2)", chipFg: "var(--accent)" },
  positive: { chipBg: "var(--positive-soft)", chipFg: "var(--positive)" },
  caution:  { chipBg: "var(--caution-soft)",  chipFg: "var(--caution)" },
  negative: { chipBg: "var(--negative-soft)", chipFg: "var(--negative)" },
};

export function KpiCard({
  Icon,
  label,
  value,
  tone = "neutral",
  note,
  onClick,
  style = {},
}: {
  Icon: LucideIcon;
  label: string;
  value: number | string;
  tone?: KpiTone;
  note?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  const t = tones[tone] || tones.neutral;
  const [pressed, setPressed] = useState(false);

  return (
    <div
      onClick={onClick}
      onPointerDown={() => onClick && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        padding: "14px",
        background: "var(--surface-card)",
        border: "1px solid var(--border-hairline)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-card)",
        cursor: onClick ? "pointer" : "default",
        transform: pressed ? "scale(var(--card-press-scale))" : "scale(1)",
        transition: "transform var(--dur-fast) var(--ease-out)",
        WebkitTapHighlightColor: "transparent",
        ...style,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "34px",
          height: "34px",
          borderRadius: "var(--radius-sm)",
          background: t.chipBg,
          color: t.chipFg,
        }}
      >
        <Icon size={18} />
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        <span
          style={{
            fontSize: "26px",
            fontWeight: "var(--weight-bold)" as React.CSSProperties["fontWeight"],
            letterSpacing: "var(--track-title)",
            lineHeight: 1.05,
            color: "var(--text-primary)",
            fontVariantNumeric: "tabular-nums",
            fontFamily: "var(--font-mono)",
          }}
        >
          {value}
        </span>
        <span style={{ fontSize: "var(--type-label)", color: "var(--text-secondary)" }}>
          {label}
        </span>
        {note && (
          <span
            style={{
              marginTop: "2px",
              fontSize: "var(--type-caption)",
              fontWeight: "var(--weight-medium)" as React.CSSProperties["fontWeight"],
              color: tone === "neutral" ? "var(--text-muted)" : t.chipFg,
            }}
          >
            {note}
          </span>
        )}
      </div>
    </div>
  );
}
