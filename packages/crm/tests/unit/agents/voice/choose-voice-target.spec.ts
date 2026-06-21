// ICP-3 — tests for chooseVoiceTarget (choose-voice-target.ts).
//
// This tiny pure decision function LOCKS the "deployment-first, workspace-
// fallback" contract: a matched deployment ALWAYS wins; only when there is no
// deployment do we fall through to the existing workspace path. Keeping it pure
// + unit-tested means the additive/fallback ordering can't silently regress.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { chooseVoiceTarget } from "../../../../src/lib/agents/voice/choose-voice-target";

describe("chooseVoiceTarget — deployment-first, workspace-fallback", () => {
  test("deployment present → 'deployment' (even if a workspace also matched)", () => {
    assert.equal(chooseVoiceTarget(true, true), "deployment");
  });

  test("deployment present, no workspace → 'deployment'", () => {
    assert.equal(chooseVoiceTarget(true, false), "deployment");
  });

  test("no deployment, workspace resolvable → 'workspace' (unchanged existing path)", () => {
    assert.equal(chooseVoiceTarget(false, true), "workspace");
  });

  test("no deployment, no workspace → 'workspace' (existing fall-through still handles it)", () => {
    // When neither matches we still hand off to the workspace path, which
    // already degrades to a tool-less greeting — we must NOT swallow the call.
    assert.equal(chooseVoiceTarget(false, false), "workspace");
  });
});
