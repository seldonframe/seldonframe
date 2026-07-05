// Pure surface test for buildDesignChips (SeldonChat design picker chips).
// No DB, no network — buildDesignChips is a pure projection over the
// list_designs tool's raw `.output`.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildDesignChips } from "../../../src/lib/agents/copilot/design-chips";

describe("buildDesignChips", () => {
  test("non-health output produces archetype-only chips with correct label/swatch/payload", () => {
    const result = buildDesignChips({
      ok: true,
      isHealthWorkspace: false,
      vertical: "hvac",
      premiumTemplates: [],
      archetypes: [
        { id: "bold-urgency", name: "Bold — emergency / urgency-driven" },
        { id: "editorial-warm", name: "Editorial — warm, craft-focused" },
      ],
      note: "n/a",
    });

    assert.equal(result.isHealth, false);
    assert.equal(result.chips.length, 2);

    const [bold, editorial] = result.chips;
    assert.equal(bold.id, "bold-urgency");
    assert.equal(bold.label, "Bold — emergency / urgency-driven");
    assert.equal(bold.swatch, "#cc2d2d");
    assert.equal(bold.applyText, "Apply Bold — emergency / urgency-driven");
    assert.ok(bold.applyPayload.includes("bold-urgency"));
    assert.match(bold.applyPayload, /update_design/);

    assert.equal(editorial.id, "editorial-warm");
    assert.equal(editorial.swatch, "#9c2b1d");
  });

  test("health output puts premium templates first, then archetypes", () => {
    const result = buildDesignChips({
      ok: true,
      isHealthWorkspace: true,
      vertical: "chiro",
      premiumTemplates: [{ id: "clinical-luxe", name: "Clinical Luxe" }],
      archetypes: [{ id: "clinical-trust", name: "Clinical — trust + authority" }],
      note: "n/a",
    });

    assert.equal(result.isHealth, true);
    assert.equal(result.chips.length, 2);
    assert.equal(result.chips[0].id, "clinical-luxe");
    assert.equal(result.chips[0].label, "Clinical Luxe");
    assert.equal(result.chips[0].swatch, "#9c7c4d");
    assert.equal(result.chips[0].applyText, "Apply Clinical Luxe");
    assert.ok(result.chips[0].applyPayload.includes("clinical-luxe"));
    assert.equal(result.chips[1].id, "clinical-trust");
  });

  test("missing output returns empty", () => {
    assert.deepEqual(buildDesignChips(undefined), { isHealth: false, chips: [] });
    assert.deepEqual(buildDesignChips(null), { isHealth: false, chips: [] });
  });

  test("non-object output returns empty", () => {
    assert.deepEqual(buildDesignChips("nope"), { isHealth: false, chips: [] });
    assert.deepEqual(buildDesignChips(42), { isHealth: false, chips: [] });
  });

  test("ok:false returns empty", () => {
    assert.deepEqual(
      buildDesignChips({ ok: false, error: "boom" }),
      { isHealth: false, chips: [] },
    );
  });

  test("empty archetypes and premiumTemplates returns empty chips but preserves isHealth", () => {
    const result = buildDesignChips({
      ok: true,
      isHealthWorkspace: true,
      vertical: null,
      premiumTemplates: [],
      archetypes: [],
      note: "n/a",
    });
    assert.deepEqual(result, { isHealth: true, chips: [] });
  });

  test("unknown archetype id falls back to name for label, null swatch, never throws", () => {
    const result = buildDesignChips({
      ok: true,
      isHealthWorkspace: false,
      vertical: "made-up",
      premiumTemplates: [],
      archetypes: [{ id: "not-a-real-archetype", name: "Mystery Look" }],
      note: "n/a",
    });

    assert.equal(result.chips.length, 1);
    assert.equal(result.chips[0].label, "Mystery Look");
    assert.equal(result.chips[0].swatch, null);
    assert.ok(result.chips[0].applyPayload.includes("not-a-real-archetype"));
  });

  test("unknown premium template id falls back to null swatch, never throws", () => {
    const result = buildDesignChips({
      ok: true,
      isHealthWorkspace: true,
      vertical: "chiro",
      premiumTemplates: [{ id: "not-a-real-template", name: "Ghost Template" }],
      archetypes: [],
      note: "n/a",
    });

    assert.equal(result.chips.length, 1);
    assert.equal(result.chips[0].label, "Ghost Template");
    assert.equal(result.chips[0].swatch, null);
  });
});
