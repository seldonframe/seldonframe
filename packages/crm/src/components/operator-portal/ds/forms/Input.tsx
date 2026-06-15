"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";

export function DSInput({
  label,
  LeadingIcon,
  hint,
  error,
  value,
  placeholder,
  type = "text",
  style = {},
  inputStyle = {},
  onChange,
  required,
  autoFocus,
  ...rest
}: {
  label?: string;
  LeadingIcon?: LucideIcon;
  hint?: string;
  error?: string;
  value?: string;
  placeholder?: string;
  type?: string;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  autoFocus?: boolean;
  [key: string]: unknown;
}) {
  const [focus, setFocus] = useState(false);
  const borderColor = error
    ? "var(--negative)"
    : focus
    ? "var(--accent)"
    : "var(--border-field)";

  return (
    <label style={{ display: "block", ...style }}>
      {label && (
        <span
          style={{
            display: "block",
            marginBottom: "7px",
            fontSize: "var(--type-label)",
            fontWeight: "var(--weight-semi)" as React.CSSProperties["fontWeight"],
            color: "var(--text-secondary)",
          }}
        >
          {label}
          {required && <span style={{ color: "var(--negative)", marginLeft: 3 }}>*</span>}
        </span>
      )}
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          height: "var(--control-h)",
          padding: "0 14px",
          background: "var(--surface-card)",
          border: `1px solid ${borderColor}`,
          borderRadius: "var(--radius-md)",
          boxShadow: focus ? "var(--focus-ring)" : "var(--shadow-xs)",
          transition: "border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)",
        }}
      >
        {LeadingIcon && <LeadingIcon size={18} style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          required={required}
          autoFocus={autoFocus}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          onChange={onChange}
          style={{
            flex: 1,
            minWidth: 0,
            border: "none",
            outline: "none",
            background: "transparent",
            color: "var(--text-primary)",
            fontSize: "var(--type-body)",
            fontFamily: "inherit",
            ...inputStyle,
          }}
          {...rest}
        />
      </span>
      {(hint || error) && (
        <span
          style={{
            display: "block",
            marginTop: "6px",
            fontSize: "var(--type-caption)",
            color: error ? "var(--negative)" : "var(--text-muted)",
          }}
        >
          {error || hint}
        </span>
      )}
    </label>
  );
}
