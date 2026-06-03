import type { CSSProperties } from "react";
import type { SfTheme, Soul } from "../_contract/types";

// Tasteful default palette + font pairing for "Clinical Luxe".
export const SF1_DEFAULT_THEME: Required<SfTheme> = {
  primary: "#9c7c4d", // brass / gold
  secondary: "#24211c", // warm charcoal
  bg: "#f4f1ea", // warm ivory
  text: "#2a2620",
  border: "#e0dace",
  fontHeadline: "'Cormorant Garamond', Georgia, serif",
  fontBody: "'Mulish', system-ui, sans-serif",
};

export function sfThemeVars(theme?: SfTheme): CSSProperties {
  const t = { ...SF1_DEFAULT_THEME, ...(theme || {}) };
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
  const byRole = (data.photos || []).filter((p) => p && p.role === role);
  return byRole[idx] || null;
}
