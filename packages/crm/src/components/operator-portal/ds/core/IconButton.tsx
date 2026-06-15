"use client";

import type { LucideIcon } from "lucide-react";

type IconButtonVariant = "ghost" | "surface" | "accent";

const variantStyles: Record<IconButtonVariant, React.CSSProperties> = {
  ghost: {
    background: "transparent",
    color: "var(--text-secondary)",
  },
  surface: {
    background: "var(--surface-card)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-strong)",
    boxShadow: "var(--shadow-xs)",
  },
  accent: {
    background: "var(--accent)",
    color: "var(--text-on-accent)",
    boxShadow: "var(--shadow-accent)",
  },
};

export function IconButton({
  Icon,
  variant = "ghost",
  size = 44,
  iconSize = 20,
  label,
  active = false,
  disabled = false,
  style = {},
  onClick,
}: {
  Icon: LucideIcon;
  variant?: IconButtonVariant;
  size?: number;
  iconSize?: number;
  label?: string;
  active?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  const baseVariant = variantStyles[variant];
  const activeOverride: React.CSSProperties =
    variant === "ghost" && active
      ? { background: "var(--accent-soft-2)", color: "var(--accent-tint-fg)" }
      : {};

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onPointerDown={(e) => {
        if (disabled) return;
        e.currentTarget.style.transform = "scale(0.92)";
      }}
      onPointerUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
      onPointerLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "var(--radius-md)",
        border: "1px solid transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: "transform var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out)",
        WebkitTapHighlightColor: "transparent",
        ...baseVariant,
        ...activeOverride,
        ...style,
      }}
    >
      <Icon size={iconSize} />
    </button>
  );
}
