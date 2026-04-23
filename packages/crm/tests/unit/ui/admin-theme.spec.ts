// Tests for the admin theme bridge. SLICE 4a PR 1 C2 per audit
// §2.3 (supporting primitives) + §1.2.4 (workspace branding).
//
// The bridge extends workspace branding to admin surfaces. Unlike
// the existing public-theme-provider (which writes custom --sf-*
// vars in a separate namespace), the admin bridge OVERRIDES a
// curated subset of shadcn's base vars so primary / ring / accent
// pick up the workspace's brand color — without inverting
// dark/light mode or swapping the whole palette.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { adminThemeToCSSVars } from "../../../src/lib/theme/admin-theme";
import type { OrgTheme } from "../../../src/lib/theme/types";

function themeWith(overrides: Partial<OrgTheme> = {}): OrgTheme {
  return {
    primaryColor: "#14b8a6",
    accentColor: "#0d9488",
    fontFamily: "Inter",
    mode: "dark",
    borderRadius: "rounded",
    logoUrl: null,
    ...overrides,
  };
}

describe("adminThemeToCSSVars — override set", () => {
  test("returns exactly the vars the admin bridge overrides (not the public superset)", () => {
    const vars = adminThemeToCSSVars(themeWith());
    // Expect only the primary/ring/accent + radius vars — NOT the
    // full background/foreground swap that public-theme-provider
    // does. Admin keeps its chrome; brand color leaks into
    // primary-action surfaces only.
    const expected = new Set(["--primary", "--ring", "--accent", "--radius"]);
    assert.deepEqual(new Set(Object.keys(vars)), expected);
  });

  test("primaryColor maps to --primary and --ring", () => {
    const vars = adminThemeToCSSVars(themeWith({ primaryColor: "#ff0000" }));
    assert.equal(vars["--primary"], "#ff0000");
    assert.equal(vars["--ring"], "#ff0000");
  });

  test("accentColor maps to --accent", () => {
    const vars = adminThemeToCSSVars(themeWith({ accentColor: "#abcdef" }));
    assert.equal(vars["--accent"], "#abcdef");
  });

  test("borderRadius maps to --radius", () => {
    for (const [input, expected] of [
      ["sharp", "0px"],
      ["rounded", "0.75rem"],
      ["pill", "9999px"],
    ] as const) {
      const vars = adminThemeToCSSVars(themeWith({ borderRadius: input }));
      assert.equal(vars["--radius"], expected);
    }
  });
});

describe("adminThemeToCSSVars — mode semantics", () => {
  test("mode is IGNORED for admin — we don't invert light/dark here", () => {
    // Admin chrome mode is controlled by the user's system
    // preference or admin toggle, not by OrgTheme.mode. That's a
    // customer-facing concept. Admin bridge intentionally does NOT
    // touch --background or --foreground.
    const dark = adminThemeToCSSVars(themeWith({ mode: "dark" }));
    const light = adminThemeToCSSVars(themeWith({ mode: "light" }));
    assert.deepEqual(dark, light, "mode does not change admin vars");
    assert.ok(!Object.keys(dark).includes("--background"));
    assert.ok(!Object.keys(dark).includes("--foreground"));
  });
});

describe("adminThemeToCSSVars — empty / default theme", () => {
  test("DEFAULT_ORG_THEME produces a valid var map", () => {
    const vars = adminThemeToCSSVars(themeWith());
    assert.ok(vars["--primary"]);
    assert.ok(vars["--ring"]);
    assert.ok(vars["--accent"]);
    assert.ok(vars["--radius"]);
  });
});
