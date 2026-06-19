// Unit test for SiteShell's pure CSS-var resolver. The wrapper markup is
// verified manually; only the light/dark token math is tested here.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveShellStyle } from "../../../src/components/landing-r1/shell/site-shell";

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
});
