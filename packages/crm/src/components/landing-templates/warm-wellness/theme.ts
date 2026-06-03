import type { CSSProperties } from "react";
import type { SfTheme, Soul } from "../_contract/types";

// Tasteful default palette + font pairing for "Warm Wellness".
export const SF2_DEFAULT_THEME: Required<SfTheme> = {
  primary: "#c2868a", // dusty rose
  secondary: "#2e2933", // deep warm plum-ink
  bg: "#faf5f2",
  text: "#2e2933",
  border: "#ecdfdb",
  fontHeadline: "'Lora', Georgia, serif",
  fontBody: "'Nunito Sans', system-ui, sans-serif",
};

export function sfThemeVars(theme?: SfTheme): CSSProperties {
  const t = { ...SF2_DEFAULT_THEME, ...(theme || {}) };
  return {
    ["--sf-primary" as string]: t.primary,
    ["--sf-secondary" as string]: t.secondary,
    ["--sf-bg" as string]: t.bg,
    ["--sf-text" as string]: t.text,
    ["--sf-border" as string]: t.border,
    ["--sf-font-headline" as string]: t.fontHeadline,
    ["--sf-font-body" as string]: t.fontBody,
  } as CSSProperties;
}

export function sfMoney(price?: number, currency?: string): string | null {
  if (price == null) return null;
  const sym: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };
  return (sym[currency || "USD"] || "$") + price;
}
export function sfDur(min?: number): string | null {
  if (!min) return null;
  if (min < 60) return min + " min";
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
export type Photo = NonNullable<Soul["photos"]>[number];
export function sfPhoto(data: Soul, role: Photo["role"], idx = 0): Photo | null {
  return (data.photos || []).filter((p) => p && p.role === role)[idx] || null;
}
// Surface a promotional offer if the soul advertises one (graceful — hides otherwise).
export function sfPromo(data: Soul): string | null {
  return (data.trust_signals || []).find((s) => /free|%|\boff\b|trial|first/i.test(s)) || null;
}
export function sfFirstName(name?: string): string {
  return (name || "").split(/\s+/)[0];
}
