import { test } from "node:test";
import assert from "node:assert/strict";

import { buildThemeTokens, buildThemeTokensStyleTag } from "@/lib/blueprint/theme";
import type { Theme } from "@/lib/blueprint/types";

const baseTheme: Theme = {
  mode: "light",
  accent: "#1E40AF",
  displayFont: "cal-sans",
  bodyFont: "inter",
  radiusScale: "default",
  logoUrl: null,
  heroImageUrl: null,
};

test("buildThemeTokens — landing surface uses warm off-white background", () => {
  const css = buildThemeTokens(baseTheme, { surface: "landing" });
  assert.ok(css.includes("--sf-bg-primary: #FAFAF7;"), "landing should use #FAFAF7");
});

test("buildThemeTokens — admin surface uses pure white background", () => {
  const css = buildThemeTokens(baseTheme, { surface: "admin" });
  assert.ok(css.includes("--sf-bg-primary: #FFFFFF;"), "admin should use #FFFFFF");
});

test("buildThemeTokens — booking surface uses pure white background", () => {
  const css = buildThemeTokens(baseTheme, { surface: "booking" });
  assert.ok(css.includes("--sf-bg-primary: #FFFFFF;"), "booking should use #FFFFFF");
});

test("buildThemeTokens — derives accent-hover, accent-soft, accent-fg, ring from accent", () => {
  const css = buildThemeTokens(baseTheme, { surface: "landing" });
  assert.ok(css.includes("--sf-accent: #1E40AF;"), "accent should be uppercased input hex");
  // Hover is darker than accent
  const hoverMatch = css.match(/--sf-accent-hover: (#[0-9A-F]{6});/);
  assert.ok(hoverMatch, "accent-hover token must be present");
  // Soft is a high-lightness tinted bg
  const softMatch = css.match(/--sf-accent-soft: (#[0-9A-F]{6});/);
  assert.ok(softMatch, "accent-soft token must be present");
  // Foreground is white-or-near-black contrast pick
  const fgMatch = css.match(/--sf-accent-fg: (#[0-9A-F]{6});/);
  assert.ok(fgMatch && (fgMatch[1] === "#FFFFFF" || fgMatch[1] === "#1A1A1A"), "accent-fg must be #FFFFFF or #1A1A1A");
  // Ring is rgba derived from accent RGB
  assert.ok(css.includes("--sf-ring: rgba(30, 64, 175, 0.4);"), "ring should be accent rgba α 0.4");
});

test("buildThemeTokens — accent-fg picks white for dark accent (deep blue #1E40AF)", () => {
  const css = buildThemeTokens(baseTheme, { surface: "landing" });
  assert.ok(css.includes("--sf-accent-fg: #FFFFFF;"), "deep blue accent should pair with white fg");
});

test("buildThemeTokens — accent-fg picks near-black for light accent", () => {
  const lightAccent: Theme = { ...baseTheme, accent: "#FBBF24" }; // amber-400
  const css = buildThemeTokens(lightAccent, { surface: "landing" });
  assert.ok(css.includes("--sf-accent-fg: #1A1A1A;"), "amber accent should pair with near-black fg");
});

test("buildThemeTokens — minimal radius scale halves default values", () => {
  const minimalTheme: Theme = { ...baseTheme, radiusScale: "minimal" };
  const css = buildThemeTokens(minimalTheme, { surface: "landing" });
  assert.ok(css.includes("--sf-radius-md: 4px;"), "minimal md should be 4px (default 8px)");
  assert.ok(css.includes("--sf-radius-lg: 6px;"), "minimal lg should be 6px (default 12px)");
});

test("buildThemeTokens — rounded radius scale 1.5x default values", () => {
  const roundedTheme: Theme = { ...baseTheme, radiusScale: "rounded" };
  const css = buildThemeTokens(roundedTheme, { surface: "landing" });
  assert.ok(css.includes("--sf-radius-md: 12px;"), "rounded md should be 12px (default 8px * 1.5)");
  assert.ok(css.includes("--sf-radius-lg: 18px;"), "rounded lg should be 18px (default 12px * 1.5)");
});

test("buildThemeTokens — Cal Sans display font is the default", () => {
  const css = buildThemeTokens(baseTheme, { surface: "landing" });
  assert.ok(css.includes('--sf-font-display: "Cal Sans"'), "Cal Sans should lead the display font stack");
});

test("buildThemeTokens — Geist display font is selected when configured", () => {
  const geistTheme: Theme = { ...baseTheme, displayFont: "geist" };
  const css = buildThemeTokens(geistTheme, { surface: "landing" });
  assert.ok(css.includes('--sf-font-display: "Geist"'), "Geist should lead the display font stack");
});

test("buildThemeTokens — output is byte-stable for the same input (deterministic)", () => {
  const a = buildThemeTokens(baseTheme, { surface: "landing" });
  const b = buildThemeTokens(baseTheme, { surface: "landing" });
  assert.equal(a, b, "same theme + surface must produce byte-identical CSS");
});

test("buildThemeTokens — different surfaces produce different output", () => {
  const landing = buildThemeTokens(baseTheme, { surface: "landing" });
  const admin = buildThemeTokens(baseTheme, { surface: "admin" });
  assert.notEqual(landing, admin, "landing vs admin must differ on bg-primary");
});

test("buildThemeTokens — foreground is gray12 (#333333), not pure black", () => {
  const css = buildThemeTokens(baseTheme, { surface: "landing" });
  assert.ok(css.includes("--sf-fg-primary: #333333;"), "fg-primary must be #333333 per Phase 1 design discipline");
  assert.ok(!css.includes("--sf-fg-primary: #000000;"), "fg-primary must NOT be pure black");
});

test("buildThemeTokensStyleTag — wraps output in <style> tag with data attribute", () => {
  const tag = buildThemeTokensStyleTag(baseTheme, { surface: "landing" });
  assert.ok(tag.startsWith('<style data-sf-theme="landing">'), "tag must start with surface marker");
  assert.ok(tag.endsWith("</style>"), "tag must close cleanly");
  assert.ok(tag.includes("--sf-accent: #1E40AF;"), "tag must contain the inner CSS");
});
