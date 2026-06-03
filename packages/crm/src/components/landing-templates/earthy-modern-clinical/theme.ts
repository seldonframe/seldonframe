import type { CSSProperties } from "react";
import type { SfTheme, Soul } from "../_contract/types";

// Tasteful default palette + font pairing for "Earthy Modern Clinical".
// Swapping these (or the injected theme) re-skins the entire template.
export const SF5_DEFAULT_THEME: Required<SfTheme> = {
  primary: "#b0552f", // clay / terracotta
  secondary: "#2a1d15", // deep warm cocoa near-black
  bg: "#ece5d8", // warm oat
  text: "#2a1d15", // body ink
  border: "#d6ccba", // warm hairline
  fontHeadline: "'Outfit', system-ui, sans-serif",
  fontBody: "'Hanken Grotesk', system-ui, sans-serif",
};

// Resolve the theme into CSS custom properties applied on the root wrapper.
// Tints/shades are derived downstream with color-mix(in oklab, …) — never hardcoded.
export function sfThemeVars(theme?: SfTheme): CSSProperties {
  const t = { ...SF5_DEFAULT_THEME, ...(theme || {}) };
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

// ── data formatting helpers ────────────────────────────────────────────────
export function sfMoney(price?: number, currency?: string): string | null {
  if (price == null) return null;
  const sym: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };
  return (sym[currency || "USD"] || "$") + price;
}

export function sfDur(min?: number): string | null {
  if (!min) return null;
  if (min < 60) return min + " min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

export type Photo = NonNullable<Soul["photos"]>[number];

export function sfPhoto(data: Soul, role: Photo["role"], idx = 0): Photo | null {
  const byRole = (data.photos || []).filter((p) => p && p.role === role);
  return byRole[idx] || null;
}
