// Magic first-run (Task 2) — TDD for the Studio agent BUILD/TEST gate.
//
// The first workspace + its auto-created website chatbot run on the
// platform key (mode "included"/"metered") — that's the magic and stays
// free. But BUILDING/TESTING a reusable agent in the Studio is the
// unbounded-COGS work, so it is gated on the operator having their OWN
// key (mode "byok"). This pure helper is the single source of truth for
// that rule; both generateAgentDraftAction and testAgentTemplateTurn call
// it. Pure (no DB / env), so we just assert the decision per mode.
//
// Run: node --import tsx --test tests/unit/agent-templates/studio-build-gate.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveStudioBuildGate } from "../../../src/lib/agent-templates/studio-build-gate";

describe("resolveStudioBuildGate", () => {
  test("byok mode → allowed (operator brought their own key)", () => {
    assert.deepEqual(resolveStudioBuildGate("byok"), { ok: true });
  });

  test("included mode (platform key, free allowance) → needs_byok", () => {
    const decision = resolveStudioBuildGate("included");
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.equal(decision.error, "needs_byok");
    }
  });

  test("metered mode (platform key, allowance exhausted) → needs_byok", () => {
    const decision = resolveStudioBuildGate("metered");
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.equal(decision.error, "needs_byok");
    }
  });

  test("only the exact string 'byok' passes (no truthiness surprises)", () => {
    // Defensive: anything that isn't the byok mode must be gated. This
    // guards against a future mode being added and silently slipping
    // through the unbounded-COGS gate.
    assert.equal(resolveStudioBuildGate("included").ok, false);
    assert.equal(resolveStudioBuildGate("metered").ok, false);
  });
});
