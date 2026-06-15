"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Loader } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "accentSoft" | "destructive";
type ButtonSize = "sm" | "md";

const variants: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: "var(--accent)",
    color: "var(--text-on-accent)",
    boxShadow: "var(--shadow-accent)",
  },
  secondary: {
    background: "var(--surface-card)",
    color: "var(--text-primary)",
    borderColor: "var(--border-strong)",
    boxShadow: "var(--shadow-xs)",
  },
  ghost: {
    background: "transparent",
    color: "var(--text-secondary)",
  },
  accentSoft: {
    background: "var(--accent-soft-2)",
    color: "var(--accent-tint-fg)",
  },
  destructive: {
    background: "var(--negative-soft)",
    color: "var(--negative)",
  },
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  LeadingIcon,
  TrailingIcon,
  loading = false,
  fullWidth = false,
  disabled = false,
  style = {},
  onClick,
  type = "button",
}: {
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  LeadingIcon?: LucideIcon;
  TrailingIcon?: LucideIcon;
  loading?: boolean;
  fullWidth?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
}) {
  const [pressed, setPressed] = useState(false);
  const h = size === "sm" ? "var(--control-h-sm)" : "var(--control-h)";
  const pad = size === "sm" ? "0 14px" : "0 18px";
  const fontSize = size === "sm" ? "var(--type-label)" : "var(--type-body)";
  const iconSize = size === "sm" ? 16 : 18;

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onPointerDown={() => { if (!disabled && !loading) setPressed(true); }}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        height: h,
        minWidth: h,
        padding: pad,
        width: fullWidth ? "100%" : undefined,
        border: "1px solid transparent",
        borderRadius: "var(--radius-md)",
        fontSize,
        fontWeight: "var(--weight-semi)" as React.CSSProperties["fontWeight"],
        letterSpacing: "var(--track-tight)",
        lineHeight: 1,
        cursor: disabled || loading ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transform: pressed ? "scale(var(--press-scale))" : "scale(1)",
        transition: "transform var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)",
        WebkitTapHighlightColor: "transparent",
        userSelect: "none",
        whiteSpace: "nowrap",
        ...variants[variant],
        ...style,
      }}
    >
      {loading ? (
        <Loader size={iconSize} style={{ animation: "sf-spin 0.7s linear infinite" }} />
      ) : (
        LeadingIcon && <LeadingIcon size={iconSize} />
      )}
      {children && <span>{children}</span>}
      {!loading && TrailingIcon && <TrailingIcon size={iconSize} />}
    </button>
  );
}
