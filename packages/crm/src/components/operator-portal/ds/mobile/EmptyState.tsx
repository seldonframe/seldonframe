"use client";

import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { Button } from "../core/Button";

export function EmptyState({
  Icon = Inbox,
  title,
  body,
  actionLabel,
  ActionIcon,
  onAction,
  style = {},
}: {
  Icon?: LucideIcon;
  title: string;
  body?: string;
  actionLabel?: string;
  ActionIcon?: LucideIcon;
  onAction?: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "40px 28px",
        ...style,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "60px",
          height: "60px",
          borderRadius: "var(--radius-lg)",
          background: "var(--surface-sunken)",
          color: "var(--text-faint)",
          marginBottom: "18px",
        }}
      >
        <Icon size={26} />
      </span>
      <h3
        style={{
          margin: 0,
          fontSize: "var(--type-heading)",
          fontWeight: "var(--weight-bold)" as React.CSSProperties["fontWeight"],
          letterSpacing: "var(--track-tight)",
          color: "var(--text-primary)",
        }}
      >
        {title}
      </h3>
      {body && (
        <p
          style={{
            margin: "8px 0 0",
            maxWidth: "260px",
            fontSize: "var(--type-label)",
            lineHeight: "var(--lh-normal)",
            color: "var(--text-muted)",
          }}
        >
          {body}
        </p>
      )}
      {actionLabel && (
        <div style={{ marginTop: "22px" }}>
          <Button LeadingIcon={ActionIcon} onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
