import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyTastePreferencesUpdate } from "../../../../src/lib/marketplace/taste/apply-taste-preferences";

describe("applyTastePreferencesUpdate", () => {
  it("merges a patch over current, clamped to platform ceilings", () => {
    assert.deepEqual(
      applyTastePreferencesUpdate({ tasteDailyCap: 100 }, { tasteCallsPerVisitor: 99 }),
      { tasteCallsPerVisitor: 10, tasteDailyCap: 100 },
    );
  });
  it("0 is a valid opt-out value and survives", () => {
    assert.deepEqual(
      applyTastePreferencesUpdate(null, { tasteCallsPerVisitor: 0 }),
      { tasteCallsPerVisitor: 0, tasteDailyCap: 50 },
    );
  });
  it("absent fields fall back to defaults", () => {
    assert.deepEqual(applyTastePreferencesUpdate(null, {}), { tasteCallsPerVisitor: 3, tasteDailyCap: 50 });
  });
});
