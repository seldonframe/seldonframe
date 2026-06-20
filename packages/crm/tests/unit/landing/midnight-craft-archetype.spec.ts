import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { ARCHETYPES, archetypeStyle } from "../../../src/components/landing-r1/archetypes";
import { ARCHETYPES as LIB_ARCHETYPES } from "../../../src/lib/workspace/aesthetic-archetypes";

describe("midnight-craft archetype", () => {
  test("is registered in both archetype registries", () => {
    assert.ok(ARCHETYPES["midnight-craft"], "missing from landing-r1 ARCHETYPES");
    assert.ok(
      LIB_ARCHETYPES["midnight-craft"],
      "missing from aesthetic-archetypes",
    );
  });

  test("archetypeStyle emits a dark background + light text + a green primary", () => {
    const style = archetypeStyle("midnight-craft") as Record<string, string>;
    assert.equal(style["--bg"], "#0d100e");
    assert.equal(style["--text"], "#f2f5f3");
    assert.equal(style["--primary"], "#34d399");
  });

  test("its defaultThemeMode is dark; every other archetype defaults to light", () => {
    for (const a of Object.values(LIB_ARCHETYPES)) {
      assert.ok(a.defaultThemeMode === "light" || a.defaultThemeMode === "dark");
      if (a.id === "midnight-craft") assert.equal(a.defaultThemeMode, "dark");
      else assert.equal(a.defaultThemeMode, "light");
    }
  });
});
