/**
 * Theme token derivation for the workspace blueprint system.
 *
 * Single function entry point: `buildThemeTokens(theme)` returns a
 * CSS `:root { ... }` block (no surrounding `<style>` tag) that every
 * surface (landing, booking, intake, admin) embeds inline.
 *
 * Per Phase 1 design research:
 *   - Operator picks ONE accent. Everything else (accent-soft,
 *     accent-hover, ring, accent-foreground) is derived.
 *   - Foreground is gray12 (#333), NOT pure black. 6% delta reads
 *     premium.
 *   - Page background is #FFFFFF for admin/booking but #FAFAF7
 *     (warm off-white) for landing — cheap-vs-premium tell.
 *   - Hairline 1px borders (gray4/5/6 from Radix) over shadows.
 *   - Light mode only in v1; dark mode reserved for v2.
 *
 * The returned CSS is byte-stable for the same input theme — the
 * deterministic-rendering claim depends on this.
 */

import type { Theme } from "./types";

// ─── Color math ─────────────────────────────────────────────────────────

interface RGB {
  r: number;
  g: number;
  b: number;
}
interface HSL {
  h: number;
  s: number;
  l: number;
}

function hexToRgb(hex: string): RGB {
  const cleaned = hex.replace(/^#/, "");
  const expanded =
    cleaned.length === 3
      ? cleaned
          .split("")
          .map((c) => c + c)
          .join("")
      : cleaned;
  const num = parseInt(expanded, 16);
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  };
}

function rgbToHex({ r, g, b }: RGB): string {
  const toByte = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

function rgbToHsl({ r, g, b }: RGB): HSL {
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rN:
        h = (gN - bN) / d + (gN < bN ? 6 : 0);
        break;
      case gN:
        h = (bN - rN) / d + 2;
        break;
      case bN:
        h = (rN - gN) / d + 4;
        break;
    }
    h *= 60;
  }
  return { h, s, l };
}

function hslToRgb({ h, s, l }: HSL): RGB {
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const hueToRgb = (p: number, q: number, t: number) => {
    let tN = t;
    if (tN < 0) tN += 1;
    if (tN > 1) tN -= 1;
    if (tN < 1 / 6) return p + (q - p) * 6 * tN;
    if (tN < 1 / 2) return q;
    if (tN < 2 / 3) return p + (q - p) * (2 / 3 - tN) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hN = h / 360;
  return {
    r: hueToRgb(p, q, hN + 1 / 3) * 255,
    g: hueToRgb(p, q, hN) * 255,
    b: hueToRgb(p, q, hN - 1 / 3) * 255,
  };
}

function hexToHsl(hex: string): HSL {
  return rgbToHsl(hexToRgb(hex));
}

function hslToHex(hsl: HSL): string {
  return rgbToHex(hslToRgb(hsl));
}

// ─── Contrast picker ────────────────────────────────────────────────────

/**
 * Picks readable foreground (white or near-black) for a background hex.
 * Approximates APCA — sufficient for monochrome/tinted UI brand colors;
 * we don't need full WCAG3 here.
 */
function pickContrastingFg(hex: string): "#FFFFFF" | "#1A1A1A" {
  const { r, g, b } = hexToRgb(hex);
  // Relative luminance, sRGB
  const toLin = (c: number) => {
    const cN = c / 255;
    return cN <= 0.03928 ? cN / 12.92 : Math.pow((cN + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
  // White-on-bg if the bg is dark enough; near-black-on-bg otherwise.
  return L < 0.45 ? "#FFFFFF" : "#1A1A1A";
}

// ─── Accent derivation ─────────────────────────────────────────────────

interface DerivedAccent {
  accent: string;
  accentHover: string;
  accentSoft: string;
  accentFg: string;
  ring: string;
}

function deriveAccent(accentHex: string): DerivedAccent {
  const hsl = hexToHsl(accentHex);

  // Hover: -8% lightness clamped to [0, 1]
  const hover = hslToHex({ h: hsl.h, s: hsl.s, l: Math.max(0, hsl.l - 0.08) });

  // Soft: very high lightness, low saturation — a tinted background
  const soft = hslToHex({
    h: hsl.h,
    s: Math.min(0.18, hsl.s * 0.4),
    l: Math.max(0.92, Math.min(0.97, 0.95)),
  });

  const fg = pickContrastingFg(accentHex);

  // Ring: same hue, full saturation if accent is monochrome, else accent
  // with α 0.4 (rgba). For simplicity ship as rgba derived from RGB.
  const { r, g, b } = hexToRgb(accentHex);
  const ring = `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, 0.4)`;

  return {
    accent: accentHex.toUpperCase(),
    accentHover: hover.toUpperCase(),
    accentSoft: soft.toUpperCase(),
    accentFg: fg,
    ring,
  };
}

// ─── Radius scale ──────────────────────────────────────────────────────

interface RadiusScale {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  pill: string;
  round: string;
}

function radiusFor(scale: Theme["radiusScale"] = "default"): RadiusScale {
  switch (scale) {
    case "minimal":
      return { xs: "1px", sm: "2px", md: "4px", lg: "6px", xl: "10px", pill: "999px", round: "100%" };
    case "rounded":
      return { xs: "3px", sm: "6px", md: "12px", lg: "18px", xl: "30px", pill: "999px", round: "100%" };
    case "default":
    default:
      return { xs: "2px", sm: "4px", md: "8px", lg: "12px", xl: "20px", pill: "999px", round: "100%" };
  }
}

// ─── Surface backgrounds ──────────────────────────────────────────────

/**
 * Per Phase 1 decision 4: warm off-white #FAFAF7 for public-facing
 * conversion surfaces (landing, booking, intake) — keeps the brand tone
 * unified across the customer journey. Admin stays pure white because
 * data density requires maximum contrast and the surface isn't competing
 * for "premium feel".
 *
 * C4 update: booking + intake moved from #FFFFFF → #FAFAF7 so the
 * Cal.com-style booking page reads as a different *page* of the same
 * site, not a different app.
 */
export type Surface = "landing" | "admin" | "booking" | "intake";

function pageBgFor(surface: Surface): string {
  return surface === "admin" ? "#FFFFFF" : "#FAFAF7";
}

// ─── Public entry point ───────────────────────────────────────────────

export interface BuildThemeTokensOptions {
  /** Which surface this :root block is for. Drives page background. */
  surface: Surface;
}

/**
 * Returns a CSS `:root { ... }` declaration block for the given theme.
 * Embed inline in a `<style>` tag at the top of the rendered surface.
 *
 * The output is deterministic — same theme + surface → same CSS, byte-for-byte.
 *
 * Light mode only in v1. If `theme.mode === "dark"`, treats as light
 * with a TODO to rebuild for v2 (caller should not pass dark in v1).
 */
export function buildThemeTokens(theme: Theme, options: BuildThemeTokensOptions): string {
  const accent = deriveAccent(theme.accent);
  const radius = radiusFor(theme.radiusScale);
  const pageBg = pageBgFor(options.surface);

  // The semantic alias layer per Phase 1 §1.1.
  // Light values pinned to Radix-Colors-equivalent gray scale; dark values
  // shipped commented-out for v2.
  const lines = [
    ":root {",
    `  /* Surface backgrounds */`,
    `  --sf-bg-primary: ${pageBg};`,
    `  --sf-bg-secondary: #FCFCFC;`,
    `  --sf-bg-muted: #F5F5F5;`,
    `  --sf-bg-emphasis: #EBEBEB;`,
    "",
    `  /* Foreground */`,
    `  --sf-fg-primary: #333333;`,
    `  --sf-fg-emphasis: #1A1A1A;`,
    `  --sf-fg-muted: #666666;`,
    `  --sf-fg-subtle: #999999;`,
    "",
    `  /* Borders */`,
    `  --sf-border-subtle: #F1F1F1;`,
    `  --sf-border-default: #E6E2D9;`,
    `  --sf-border-strong: #D6D6D6;`,
    "",
    `  /* Brand accent */`,
    `  --sf-accent: ${accent.accent};`,
    `  --sf-accent-hover: ${accent.accentHover};`,
    `  --sf-accent-soft: ${accent.accentSoft};`,
    `  --sf-accent-fg: ${accent.accentFg};`,
    `  --sf-ring: ${accent.ring};`,
    "",
    `  /* Semantic state */`,
    `  --sf-success: #15803D;`,
    `  --sf-warning: #C2410C;`,
    `  --sf-danger: #B91C1C;`,
    "",
    `  /* Radius scale */`,
    `  --sf-radius-xs: ${radius.xs};`,
    `  --sf-radius-sm: ${radius.sm};`,
    `  --sf-radius-md: ${radius.md};`,
    `  --sf-radius-lg: ${radius.lg};`,
    `  --sf-radius-xl: ${radius.xl};`,
    `  --sf-radius-pill: ${radius.pill};`,
    `  --sf-radius-round: ${radius.round};`,
    "",
    `  /* Typography */`,
    `  --sf-font-display: ${displayFontFamily(theme.displayFont)};`,
    `  --sf-font-body: ${bodyFontFamily(theme.bodyFont)};`,
    `  --sf-font-serif: "Instrument Serif", "Iowan Old Style", Georgia, "Times New Roman", serif;`,
    "",
    `  /* Spacing rhythm (matches Tailwind defaults; surfaces shouldn't override) */`,
    `  --sf-space-2: 0.5rem;`,
    `  --sf-space-3: 0.75rem;`,
    `  --sf-space-4: 1rem;`,
    `  --sf-space-6: 1.5rem;`,
    `  --sf-space-8: 2rem;`,
    `  --sf-space-12: 3rem;`,
    `  --sf-space-16: 4rem;`,
    `  --sf-space-24: 6rem;`,
    "}",
  ];

  return lines.join("\n");
}

function displayFontFamily(font: Theme["displayFont"] = "cal-sans"): string {
  if (font === "geist") {
    return `"Geist", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  }
  // Cal Sans default. Falls through to Inter then system.
  return `"Cal Sans", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
}

function bodyFontFamily(_font: Theme["bodyFont"] = "inter"): string {
  return `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
}

// ─── Convenience: full <style> block ──────────────────────────────────

/**
 * Wraps `buildThemeTokens` in a full `<style>` element for inlining
 * directly into rendered HTML. Use when emitting a complete page;
 * use the bare function when concatenating into an existing stylesheet.
 */
export function buildThemeTokensStyleTag(theme: Theme, options: BuildThemeTokensOptions): string {
  return `<style data-sf-theme="${options.surface}">\n${buildThemeTokens(theme, options)}\n</style>`;
}
