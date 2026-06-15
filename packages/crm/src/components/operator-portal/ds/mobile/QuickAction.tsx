"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";

export function QuickAction({
  Icon,
  label,
  onClick,
  disabled = false,
  style = {},
}: {
  Icon: LucideIcon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      onPointerDown={() => !disabled && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
        padding: "12px 6px",
        background: "var(--surface-card)",
        border: "1px solid var(--border-hairline)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-xs)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transform: pressed ? "scale(var(--press-scale))" : "scale(1)",
        transition: "transform var(--dur-fast) var(--ease-out)",
        WebkitTapHighlightColor: "transparent",
        minHeight: "var(--tap-min)",
        ...style,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "38px",
          height: "38px",
          borderRadius: "var(--radius-sm)",
          background: "var(--accent-soft)",
          color: "var(--accent)",
        }}
      >
        <Icon size={19} />
      </span>
      <span
        style={{
          fontSize: "var(--type-caption)",
          fontWeight: "var(--weight-semi)" as React.CSSProperties["fontWeight"],
          color: "var(--text-secondary)",
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        {label}
      </span>
    </button>
  );
}
