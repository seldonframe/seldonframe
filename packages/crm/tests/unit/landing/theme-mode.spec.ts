import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveThemeMode } from "../../../src/lib/landing/theme-mode";

describe("resolveThemeMode", () => {
  test("explicit operator choice wins over the archetype default", () => {
    assert.equal(resolveThemeMode("dark", "editorial-warm"), "dark");
    assert.equal(resolveThemeMode("light", "midnight-craft"), "light");
  });

  test('"auto" / undefined falls back to the archetype defaultThemeMode', () => {
    assert.equal(resolveThemeMode("auto", "midnight-craft"), "dark");
    assert.equal(resolveThemeMode("auto", "editorial-warm"), "light");
    assert.equal(resolveThemeMode(undefined, "midnight-craft"), "dark");
    assert.equal(resolveThemeMode(undefined, "editorial-warm"), "light");
  });

  test("unknown archetype id defaults to light (defensive)", () => {
    // @ts-expect-error — defensive against bad input.
    assert.equal(resolveThemeMode("auto", "does-not-exist"), "light");
  });
});
