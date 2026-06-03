import type { CSSProperties } from "react";
import type { SfTheme, Soul } from "../_contract/types";

// Tasteful default palette + font pairing for "Editorial Bodywork".
export const SF4_DEFAULT_THEME: Required<SfTheme> = {
  primary: "#7c5440", // warm brown
  secondary: "#241813", // deep espresso
  bg: "#ece3d6", // warm cream
  text: "#2a1d14",
  border: "#ddd0bf",
  fontHeadline: "'Spectral', Georgia, serif",
  fontBody: "'Hanken Grotesk', system-ui, sans-serif",
};

export function sfThemeVars(theme?: SfTheme): CSSProperties {
  const t = { ...SF4_DEFAULT_THEME, ...(theme || {}) };
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
// Editorial italic accent: split a phrase, italicising the back half.
export function sfAccent(text?: string): [string, string | null] {
  const w = (text || "").trim().split(/\s+/);
  if (w.length < 2) return [text || "", null];
  const mid = Math.ceil(w.length / 2);
  return [w.slice(0, mid).join(" ") + " ", w.slice(mid).join(" ")];
}
