"use client";

import { ChevronRight } from "lucide-react";

export function SectionHeader({
  title,
  actionLabel,
  onAction,
  style = {},
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: "12px",
        padding: "0 2px",
        ...style,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: "var(--type-heading)",
          fontWeight: "var(--weight-bold)" as React.CSSProperties["fontWeight"],
          letterSpacing: "var(--track-tight)",
          color: "var(--text-primary)",
        }}
      >
        {title}
      </h2>
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "2px",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontSize: "var(--type-label)",
            fontWeight: "var(--weight-semi)" as React.CSSProperties["fontWeight"],
            color: "var(--accent)",
            padding: "4px",
          }}
        >
          {actionLabel}
          <ChevronRight size={15} />
        </button>
      )}
    </div>
  );
}
