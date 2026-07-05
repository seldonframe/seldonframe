// SH2-F1 — saveThemeForOrg's pure merge core.
//
// Covers the "user-customized" gate design: every explicit theme write
// (settings form OR the copilot's update_theme tool — both flow through
// saveThemeForOrg) must stamp `customizedAt` on the resulting theme, and that
// stamp must survive a subsequent partial merge (i.e. re-saving one field
// doesn't drop the flag some earlier save set — it's re-stamped to "now" on
// every write, which is stronger than "preserved").
//
// mergeThemePatch is the pure extraction of saveThemeForOrg's merge step
// (this repo's DI convention — see voice-r1-tools.spec.ts's PATTERN NOTE —
// prefers extracting a pure/injectable core over mocking `db` with
// mock.module, which is unreliable under tsx's CJS interop). It takes an
// injectable `now` so the exact timestamp is assertable without real-clock
// flakiness.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { mergeThemePatch } from "@/lib/theme/save-theme";
import { normalizeTheme } from "@/lib/theme/normalize-theme";
import { DEFAULT_ORG_THEME, type OrgTheme } from "@/lib/theme/types";

const FIXED_NOW = () => new Date("2026-07-05T12:00:00.000Z");

describe("mergeThemePatch — customizedAt stamping", () => {
  test("stamps customizedAt as an ISO string on a fresh (never-customized) theme", () => {
    const next = mergeThemePatch(DEFAULT_ORG_THEME, { accentColor: "#B0E0E6" }, FIXED_NOW);
    assert.equal(next.customizedAt, "2026-07-05T12:00:00.000Z");
    assert.equal(next.accentColor, "#B0E0E6");
  });

  test("a theme with no customizedAt (build default) has none until first save", () => {
    // DEFAULT_ORG_THEME itself — never passed through mergeThemePatch — has no
    // customizedAt. This is the "archetype default, not yet customized" state
    // the SiteShell override gate keys off of.
    assert.equal(DEFAULT_ORG_THEME.customizedAt, undefined);
    assert.equal(normalizeTheme(DEFAULT_ORG_THEME).customizedAt, undefined);
  });

  test("re-stamps customizedAt to the new save time on a subsequent partial merge", () => {
    const firstSave = mergeThemePatch(
      DEFAULT_ORG_THEME,
      { accentColor: "#B0E0E6" },
      () => new Date("2026-07-01T00:00:00.000Z"),
    );
    assert.equal(firstSave.customizedAt, "2026-07-01T00:00:00.000Z");

    // Second, unrelated partial save (e.g. just fontFamily) — customizedAt must
    // still be present (re-stamped, not dropped) and the earlier accentColor
    // write must survive the merge untouched.
    const secondSave = mergeThemePatch(firstSave, { fontFamily: "Outfit" }, FIXED_NOW);
    assert.equal(secondSave.customizedAt, "2026-07-05T12:00:00.000Z");
    assert.equal(secondSave.accentColor, "#B0E0E6", "earlier field survives the merge");
    assert.equal(secondSave.fontFamily, "Outfit");
  });

  test("normalizeTheme passes customizedAt through unchanged (does not strip it)", () => {
    const raw = { ...DEFAULT_ORG_THEME, customizedAt: "2026-01-01T00:00:00.000Z" } as OrgTheme;
    const normalized = normalizeTheme(raw);
    assert.equal(normalized.customizedAt, "2026-01-01T00:00:00.000Z");
  });

  test("normalizeTheme ignores a non-string customizedAt (defensive, falls back to absent)", () => {
    const raw = { ...DEFAULT_ORG_THEME, customizedAt: 12345 } as unknown as OrgTheme;
    const normalized = normalizeTheme(raw);
    assert.equal(normalized.customizedAt, undefined);
  });
});
