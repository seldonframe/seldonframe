"use client";

import type { LucideIcon } from "lucide-react";

type BadgeTone = "neutral" | "accent" | "positive" | "caution" | "negative" | "info";

const palette: Record<BadgeTone, { fg: string; soft: string; strong: string }> = {
  neutral:  { fg: "var(--text-secondary)", soft: "var(--gray-100)",      strong: "var(--gray-600)" },
  accent:   { fg: "var(--accent-tint-fg)", soft: "var(--accent-soft-2)", strong: "var(--accent)" },
  positive: { fg: "var(--positive)",       soft: "var(--positive-soft)",  strong: "var(--positive)" },
  caution:  { fg: "var(--caution)",        soft: "var(--caution-soft)",   strong: "var(--caution)" },
  negative: { fg: "var(--negative)",       soft: "var(--negative-soft)",  strong: "var(--negative)" },
  info:     { fg: "var(--info)",           soft: "var(--info-soft)",      strong: "var(--info)" },
};

export function Badge({
  children,
  tone = "neutral",
  solid = false,
  dot = false,
  Icon,
  style = {},
}: {
  children?: React.ReactNode;
  tone?: BadgeTone;
  solid?: boolean;
  dot?: boolean;
  Icon?: LucideIcon;
  style?: React.CSSProperties;
}) {
  const c = palette[tone] || palette.neutral;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        height: "22px",
        padding: Icon || dot ? "0 9px 0 8px" : "0 9px",
        borderRadius: "var(--radius-pill)",
        background: solid ? c.strong : c.soft,
        color: solid ? "#fff" : c.fg,
        fontSize: "var(--type-caption)",
        fontWeight: "var(--weight-semi)" as React.CSSProperties["fontWeight"],
        letterSpacing: "var(--track-tight)",
        lineHeight: 1,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {dot && (
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: solid ? "#fff" : c.strong,
            flexShrink: 0,
          }}
        />
      )}
      {Icon && <Icon size={13} style={{ flexShrink: 0 }} />}
      {children}
    </span>
  );
}
