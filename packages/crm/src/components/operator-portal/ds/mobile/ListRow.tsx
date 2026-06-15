"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

export function ListRow({
  leading,
  title,
  subtitle,
  meta,
  trailing,
  chevron = false,
  unread = false,
  onClick,
  style = {},
}: {
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  meta?: string;
  trailing?: React.ReactNode;
  chevron?: boolean;
  unread?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <div
      onClick={onClick}
      onPointerDown={() => onClick && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        minHeight: "var(--tap-min)",
        padding: "10px 12px",
        borderRadius: "var(--radius-md)",
        background: pressed ? "var(--surface-sunken)" : "transparent",
        cursor: onClick ? "pointer" : "default",
        transition: "background var(--dur-fast) var(--ease-out)",
        WebkitTapHighlightColor: "transparent",
        ...style,
      }}
    >
      {leading != null && <div style={{ flexShrink: 0 }}>{leading}</div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "7px",
            fontSize: "var(--type-subhead)",
            fontWeight: unread
              ? ("var(--weight-bold)" as React.CSSProperties["fontWeight"])
              : ("var(--weight-semi)" as React.CSSProperties["fontWeight"]),
            color: "var(--text-primary)",
            letterSpacing: "var(--track-tight)",
          }}
        >
          {unread && (
            <span
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: "var(--accent)",
                flexShrink: 0,
              }}
            />
          )}
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </span>
        </div>
        {subtitle != null && (
          <div
            style={{
              marginTop: "2px",
              fontSize: "var(--type-caption)",
              color: "var(--text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexShrink: 0,
        }}
      >
        {meta != null && (
          <span
            style={{
              fontSize: "var(--type-caption)",
              color: "var(--text-faint)",
              whiteSpace: "nowrap",
              fontFamily: "var(--font-mono)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {meta}
          </span>
        )}
        {trailing}
        {chevron && <ChevronRight size={18} style={{ color: "var(--text-faint)" }} />}
      </div>
    </div>
  );
}
