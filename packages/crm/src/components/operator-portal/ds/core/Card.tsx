"use client";

import { useState } from "react";

type ElevationLevel = "none" | "xs" | "sm" | "card";

const shadowMap: Record<ElevationLevel, string> = {
  none: "none",
  xs: "var(--shadow-xs)",
  sm: "var(--shadow-sm)",
  card: "var(--shadow-card)",
};

export function Card({
  children,
  pressable = false,
  padding = 16,
  radius = "var(--radius-lg)",
  elevation = "card",
  style = {},
  onClick,
  ...rest
}: {
  children?: React.ReactNode;
  pressable?: boolean;
  padding?: number | string;
  radius?: string;
  elevation?: ElevationLevel;
  style?: React.CSSProperties;
  onClick?: () => void;
  [key: string]: unknown;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <div
      onClick={onClick}
      onPointerDown={pressable ? () => setPressed(true) : undefined}
      onPointerUp={pressable ? () => setPressed(false) : undefined}
      onPointerLeave={pressable ? () => setPressed(false) : undefined}
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-hairline)",
        borderRadius: radius,
        boxShadow: shadowMap[elevation],
        padding,
        transition: "transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-normal) var(--ease-out)",
        transform: pressed ? "scale(var(--card-press-scale))" : "scale(1)",
        cursor: pressable || onClick ? "pointer" : "default",
        WebkitTapHighlightColor: "transparent",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
