// Unit tests for components/clients/design-picker/resolve-module-props.ts —
// the pure prop-derivation helper shared by the ready page and the claimed
// dashboard's design-picker card. Mirrors the ready page's inline logic
// (lifted verbatim per docs/superpowers/plans/2026-07-14-dashboard-design-picker.md).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveDesignModuleProps } from "@/components/clients/design-picker/resolve-module-props";
import { ARCHETYPE_DESIGNS } from "@/components/clients/design-picker/data";

describe("resolveDesignModuleProps", () => {
  test("health track via persisted landingTemplate id", () => {
    const result = resolveDesignModuleProps({
      theme: { landingTemplate: "clinical-luxe", landingTemplateChoice: "clinical-luxe" },
      soul: { industry: "chiropractic" },
      settings: null,
    });

    assert.equal(result.initialValue, "clinical-luxe");
    assert.equal(result.autoResolvedId, "clinical-luxe");
    assert.equal(result.autoReason, "Auto-picked for chiropractic");
    // health track leaves options/copy undefined (picker defaults).
    assert.equal(result.designs, undefined);
    assert.equal(result.sectionLabel, undefined);
    assert.equal(result.autoNote, undefined);
  });

  test("health track via vertical (no template id yet, still auto)", () => {
    const result = resolveDesignModuleProps({
      theme: null,
      soul: { industry: "med-spa" },
      settings: null,
    });

    assert.equal(result.initialValue, "auto");
    assert.equal(typeof result.autoResolvedId, "string");
    assert.equal(result.autoReason, "Auto-picked for med-spa");
    assert.equal(result.designs, undefined);
  });

  test("archetype track with a persisted choice", () => {
    const result = resolveDesignModuleProps({
      theme: {
        aestheticArchetype: "bold-urgency",
        aestheticArchetypeChoice: "bold-urgency",
      },
      soul: { industry: "plumbing" },
      settings: null,
    });

    assert.equal(result.initialValue, "bold-urgency");
    assert.equal(result.autoResolvedId, "bold-urgency");
    assert.equal(result.autoReason, "Auto-picked for plumbing");
    assert.deepEqual(result.designs, ARCHETYPE_DESIGNS);
    assert.equal(result.sectionLabel, "Design styles");
    assert.equal(
      result.autoNote,
      "Auto matches a style to your business. Pick any style to override it — your site re-skins instantly.",
    );
  });

  test("archetype track falls back to soul classification when no persisted archetype", () => {
    const result = resolveDesignModuleProps({
      theme: null,
      soul: { industry: "landscaping" },
      settings: null,
    });

    assert.equal(result.initialValue, "auto");
    assert.ok(result.autoResolvedId, "expected classifyArchetypeFromSoul to resolve something");
    assert.deepEqual(result.designs, ARCHETYPE_DESIGNS);
  });

  test("null theme/soul/settings yields sane auto defaults on the archetype track", () => {
    const result = resolveDesignModuleProps({ theme: null, soul: null, settings: null });

    assert.equal(result.initialValue, "auto");
    assert.ok(result.autoResolvedId, "classifyArchetypeFromSoul should still resolve a fallback archetype");
    assert.equal(result.autoReason, "Auto-picked for this business");
    assert.deepEqual(result.designs, ARCHETYPE_DESIGNS);
    assert.equal(result.sectionLabel, "Design styles");
  });
});
