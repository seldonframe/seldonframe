// Unit test for SiteShell's pure CSS-var resolver. The wrapper markup is
// verified manually; only the light/dark token math is tested here.
//
// SH2-F1 adds resolveSitePalette — the pure "user-customized" override
// decision (see site-shell.tsx's doc comment): archetype palette wins
// unchanged when the org's theme has no customizedAt (never explicitly
// saved); once customizedAt is set, the org's own accentColor/primaryColor
// override --primary/--secondary so the copilot's update_theme tool (and the
// settings-form path, both flowing through saveThemeForOrg) actually changes
// what the public site renders.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveShellStyle, resolveSitePalette } from "../../../src/components/landing-r1/shell/site-shell";

describe("resolveShellStyle", () => {
  test("light mode (default) returns the archetype palette unchanged + clip", () => {
    const style = resolveShellStyle("editorial-warm", "light") as Record<string, string>;
    // archetypeStyle base var present, no dark override.
    assert.equal(style["--bg"], "#f8f4ec"); // editorial-warm background
    assert.equal(style["overflowX"], "clip");
    assert.equal(style["minHeight"], "100dvh");
  });

  test("light mode is the default when mode is omitted", () => {
    const a = resolveShellStyle("editorial-warm") as Record<string, string>;
    const b = resolveShellStyle("editorial-warm", "light") as Record<string, string>;
    assert.equal(a["--bg"], b["--bg"]);
  });

  test("dark mode overrides bg/text to a near-black palette", () => {
    const style = resolveShellStyle("editorial-warm", "dark") as Record<string, string>;
    assert.notEqual(style["--bg"], "#f8f4ec");
    // near-black background, light text.
    assert.equal(style["--bg"], "#0d0d0f");
    assert.equal(style["--text"], "#f4f4f5");
    // accent (--primary) stays the archetype's so brand color survives.
    assert.equal(style["--primary"], "#9c2b1d");
    assert.equal(style["overflowX"], "clip");
  });

  test("a never-customized org theme (no customizedAt) leaves the archetype palette unchanged", () => {
    const style = resolveShellStyle("editorial-warm", "light", {
      accentColor: "#B0E0E6",
      primaryColor: "#000000",
    }) as Record<string, string>;
    // No customizedAt on the passed theme → resolveSitePalette is a no-op.
    assert.equal(style["--primary"], "#9c2b1d"); // archetype's own primary, untouched
  });

  test("a customized org theme overrides --primary with the org's accentColor", () => {
    const style = resolveShellStyle("editorial-warm", "light", {
      customizedAt: "2026-07-05T00:00:00.000Z",
      accentColor: "#B0E0E6",
    }) as Record<string, string>;
    assert.equal(style["--primary"], "#B0E0E6");
    // secondary untouched — no primaryColor provided in this patch.
    assert.equal(style["--secondary"], "#3a3530");
  });

  test("a customized org theme with both colors overrides --primary and --secondary", () => {
    const style = resolveShellStyle("editorial-warm", "light", {
      customizedAt: "2026-07-05T00:00:00.000Z",
      accentColor: "#B0E0E6",
      primaryColor: "#111111",
    }) as Record<string, string>;
    assert.equal(style["--primary"], "#B0E0E6");
    assert.equal(style["--secondary"], "#111111");
  });

  test("dark mode + customized theme: override still wins over the dark palette's preserved --primary", () => {
    const style = resolveShellStyle("editorial-warm", "dark", {
      customizedAt: "2026-07-05T00:00:00.000Z",
      accentColor: "#B0E0E6",
    }) as Record<string, string>;
    assert.equal(style["--primary"], "#B0E0E6");
    assert.equal(style["--bg"], "#0d0d0f"); // dark override still applies to bg
  });
});

describe("resolveSitePalette", () => {
  const archetypePalette = { "--primary": "#cc2d2d", "--secondary": "#1a1a1a" } as Record<string, string>;

  test("returns the archetype palette unchanged when orgTheme is null/undefined", () => {
    assert.deepEqual(resolveSitePalette(archetypePalette, null), archetypePalette);
    assert.deepEqual(resolveSitePalette(archetypePalette, undefined), archetypePalette);
  });

  test("returns the archetype palette unchanged when customizedAt is absent (build default)", () => {
    const result = resolveSitePalette(archetypePalette, { accentColor: "#B0E0E6" }) as Record<string, string>;
    assert.equal(result["--primary"], "#cc2d2d");
  });

  test("overrides --primary with accentColor once customizedAt is set", () => {
    const result = resolveSitePalette(archetypePalette, {
      customizedAt: "2026-07-05T00:00:00.000Z",
      accentColor: "#B0E0E6",
    }) as Record<string, string>;
    assert.equal(result["--primary"], "#B0E0E6");
    assert.equal(result["--secondary"], "#1a1a1a", "unspecified primaryColor leaves --secondary untouched");
  });

  test("overrides --secondary with primaryColor when both are provided", () => {
    const result = resolveSitePalette(archetypePalette, {
      customizedAt: "2026-07-05T00:00:00.000Z",
      accentColor: "#B0E0E6",
      primaryColor: "#222222",
    }) as Record<string, string>;
    assert.equal(result["--primary"], "#B0E0E6");
    assert.equal(result["--secondary"], "#222222");
  });

  test("does not mutate the input palette object", () => {
    const input = { "--primary": "#cc2d2d" } as Record<string, string>;
    resolveSitePalette(input, { customizedAt: "now", accentColor: "#fff" });
    assert.equal(input["--primary"], "#cc2d2d");
  });
});
