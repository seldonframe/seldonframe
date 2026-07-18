// Replay gate v2 — passesGateV2 / validateIdempotencyConfig unit tests
// (docs/superpowers/plans/2026-07-18-replay-gate-v2-spec.md §1, §4).
// Mirrors replay-before-llm.spec.ts's fixture style (makeStep) so the two
// gates stay directly comparable.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { passesGateV2, validateIdempotencyConfig } from "@/lib/deployments/replay/gate-v2";
import type { ReelierSkill } from "@seldonframe/reelier/skill";

function makeStep(overrides: Partial<ReelierSkill["steps"][number]> = {}): ReelierSkill["steps"][number] {
  return {
    n: 1,
    title: "step",
    intent: "do a thing",
    actionTool: "look_up_availability",
    actionArgs: {},
    asserts: [],
    binds: [],
    effect: "read",
    line: 1,
    ...overrides,
  };
}

describe("validateIdempotencyConfig", () => {
  test("null/undefined is valid — not v2-eligible", () => {
    assert.deepEqual(validateIdempotencyConfig(null), { ok: true, config: null });
    assert.deepEqual(validateIdempotencyConfig(undefined), { ok: true, config: null });
  });

  test("a well-formed {stepN, keyVar: message_id} config is accepted", () => {
    const result = validateIdempotencyConfig({ stepN: 2, keyVar: "message_id" });
    assert.deepEqual(result, { ok: true, config: { stepN: 2, keyVar: "message_id" } });
  });

  test("keyVar 'sender' is rejected — sender is attacker-influenceable, forbidden as key material", () => {
    const result = validateIdempotencyConfig({ stepN: 2, keyVar: "sender" });
    assert.equal(result.ok, false);
  });

  test("keyVar 'subject' is rejected — same reason as sender", () => {
    const result = validateIdempotencyConfig({ stepN: 2, keyVar: "subject" });
    assert.equal(result.ok, false);
  });

  test("a non-integer or zero/negative stepN is rejected", () => {
    assert.equal(validateIdempotencyConfig({ stepN: 0, keyVar: "message_id" }).ok, false);
    assert.equal(validateIdempotencyConfig({ stepN: 1.5, keyVar: "message_id" }).ok, false);
    assert.equal(validateIdempotencyConfig({ stepN: "2", keyVar: "message_id" }).ok, false);
  });

  test("an unknown key is rejected", () => {
    const result = validateIdempotencyConfig({ stepN: 2, keyVar: "message_id", extra: "x" });
    assert.equal(result.ok, false);
  });

  test("a non-object value is rejected", () => {
    assert.equal(validateIdempotencyConfig("nope").ok, false);
    assert.equal(validateIdempotencyConfig(42).ok, false);
    assert.equal(validateIdempotencyConfig([1, 2]).ok, false);
  });
});

describe("passesGateV2 — eligibility", () => {
  test("read steps + exactly one destructive step (not necessarily last) passes, matching declared stepN", () => {
    const skill = {
      steps: [
        makeStep({ n: 1, effect: "read", actionTool: "look_up_availability" }),
        makeStep({ n: 2, effect: "destructive", actionTool: "book_appointment" }),
        makeStep({ n: 3, effect: "idempotent-write", actionTool: "escalate_to_human" }),
      ],
    } as ReelierSkill;
    const result = passesGateV2(skill, { stepN: 2, keyVar: "message_id" });
    assert.deepEqual(result, { ok: true, destructiveStepN: 2 });
  });

  test("two destructive steps refused — v2 requires EXACTLY one", () => {
    const skill = {
      steps: [
        makeStep({ n: 1, effect: "destructive", actionTool: "book_appointment" }),
        makeStep({ n: 2, effect: "destructive", actionTool: "take_message" }),
      ],
    } as ReelierSkill;
    const result = passesGateV2(skill, { stepN: 1, keyVar: "message_id" });
    assert.equal(result.ok, false);
  });

  test("zero destructive steps refused — v2 requires EXACTLY one (a pure-read skill has nothing to key)", () => {
    const skill = {
      steps: [makeStep({ n: 1, effect: "read", actionTool: "look_up_availability" })],
    } as ReelierSkill;
    const result = passesGateV2(skill, { stepN: 1, keyVar: "message_id" });
    assert.equal(result.ok, false);
  });

  test("declared stepN not matching the skill's actual destructive step is refused", () => {
    const skill = {
      steps: [
        makeStep({ n: 1, effect: "read", actionTool: "look_up_availability" }),
        makeStep({ n: 2, effect: "destructive", actionTool: "book_appointment" }),
      ],
    } as ReelierSkill;
    // Operator declared step 1 as the destructive one, but it's actually step 2.
    const result = passesGateV2(skill, { stepN: 1, keyVar: "message_id" });
    assert.equal(result.ok, false);
  });

  test("keyVar 'sender'/'subject' is refused even with an otherwise-valid single destructive step", () => {
    const skill = {
      steps: [makeStep({ n: 1, effect: "destructive", actionTool: "book_appointment" })],
    } as ReelierSkill;
    assert.equal(passesGateV2(skill, { stepN: 1, keyVar: "sender" }).ok, false);
    assert.equal(passesGateV2(skill, { stepN: 1, keyVar: "subject" }).ok, false);
  });

  test("an UNKNOWN tool (not in tool-effects.ts allowlist) is treated as destructive — same v1 search_and_purge protection", () => {
    const skill = {
      steps: [
        makeStep({ n: 1, effect: "read", actionTool: "look_up_availability" }),
        makeStep({ n: 2, effect: "read", actionTool: "search_and_purge" }),
      ],
    } as ReelierSkill;
    // search_and_purge is unknown -> trustedEffect -> "destructive", so this
    // IS a valid single-destructive-step skill from the gate's point of view.
    const result = passesGateV2(skill, { stepN: 2, keyVar: "message_id" });
    assert.deepEqual(result, { ok: true, destructiveStepN: 2 });
  });

  test("an empty skill never passes", () => {
    const result = passesGateV2({ steps: [] } as unknown as ReelierSkill, {
      stepN: 1,
      keyVar: "message_id",
    });
    assert.equal(result.ok, false);
  });

  test("post-send steps are allowed — v2's whole point vs v1 (destructive step need not be last)", () => {
    const skill = {
      steps: [
        makeStep({ n: 1, effect: "destructive", actionTool: "take_message" }),
        makeStep({ n: 2, effect: "idempotent-write", actionTool: "escalate_to_human" }),
        makeStep({ n: 3, effect: "read", actionTool: "look_up_availability" }),
      ],
    } as ReelierSkill;
    const result = passesGateV2(skill, { stepN: 1, keyVar: "message_id" });
    assert.deepEqual(result, { ok: true, destructiveStepN: 1 });
  });

  // Reviewer P2 (security-critical, pre-merge): rawEffectsOk is the guard
  // that stops allowDestructive:true (set for the whole v2 run) from giving
  // a free pass to a step SF's allowlist trusts as 'read' but whose raw
  // COMPILED skill_md line still says 'destructive' — reelier's own runner
  // gates purely on that raw line, not on tool-effects.ts. Without this
  // guard such a step would execute for real without ever going through
  // the claim wrapper (only the declared destructive step's tool is
  // wrapped). See gate-v2.ts's "EXECUTION-LAYER guard" comment.
  test("a non-declared step with an allowlist-READ tool but raw effect:'destructive' is refused (the anti-bypass guard)", () => {
    const skill = {
      steps: [
        makeStep({ n: 1, effect: "destructive", actionTool: "take_message" }),
        // GMAIL_FETCH_EMAILS is allowlisted 'read' (tool-effects.ts), so
        // trustedEffect() would happily count this as read/idempotent-write
        // and NOT as the skill's second destructive step — but its raw
        // compiled effect line disagrees, which is exactly what
        // rawEffectsOk exists to catch.
        makeStep({ n: 2, effect: "destructive", actionTool: "composio__GMAIL_FETCH_EMAILS" }),
      ],
    } as ReelierSkill;
    const result = passesGateV2(skill, { stepN: 1, keyVar: "message_id" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.reason, /raw compiled effect/);
    }
  });

  test("INVERSE CONTROL: the same skill with that step's raw effect 'read' (matching its allowlist trust) is eligible", () => {
    const skill = {
      steps: [
        makeStep({ n: 1, effect: "destructive", actionTool: "take_message" }),
        makeStep({ n: 2, effect: "read", actionTool: "composio__GMAIL_FETCH_EMAILS" }),
      ],
    } as ReelierSkill;
    const result = passesGateV2(skill, { stepN: 1, keyVar: "message_id" });
    assert.deepEqual(result, { ok: true, destructiveStepN: 1 });
  });
});
