// voice-r1 CHANGE A — the operator-editable voice blueprint patch schema.
//
// The /automations/voice-receptionist editor saves a partial blueprint patch
// through saveVoiceBlueprintAction, which validates it with
// VoiceBlueprintPatchSchema (a .strict() z.object). The schema gates exactly
// which fields an operator may edit from the page. This spec guards the
// addition of `customSkillMd` (the agent's core persona script) — that the
// field is accepted, length-capped, and that .strict() still rejects unknown
// keys.
//
// The schema lives in a plain (non-"use server") sibling module so it can be
// imported here AND by actions.ts — a "use server" file may only export async
// functions, so the schema const cannot live in actions.ts.
//
// Convention: node:test + node:assert/strict, same as the sibling voice specs.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { VoiceBlueprintPatchSchema } from "../../../../src/app/(dashboard)/automations/voice-receptionist/schema";

describe("VoiceBlueprintPatchSchema — customSkillMd", () => {
  test("accepts a customSkillMd string", () => {
    const result = VoiceBlueprintPatchSchema.safeParse({
      customSkillMd: "You are the receptionist for Spark Heating & Cooling…",
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(
        result.data.customSkillMd,
        "You are the receptionist for Spark Heating & Cooling…",
      );
    }
  });

  test("accepts a patch with customSkillMd alongside other fields", () => {
    const result = VoiceBlueprintPatchSchema.safeParse({
      greeting: "Thanks for calling!",
      customSkillMd: "You are a warm, concise receptionist.",
    });
    assert.equal(result.success, true);
  });

  test("rejects a customSkillMd longer than 8000 characters", () => {
    const tooLong = "x".repeat(8001);
    const result = VoiceBlueprintPatchSchema.safeParse({
      customSkillMd: tooLong,
    });
    assert.equal(result.success, false);
  });

  test("accepts a customSkillMd of exactly 8000 characters (boundary)", () => {
    const atLimit = "x".repeat(8000);
    const result = VoiceBlueprintPatchSchema.safeParse({
      customSkillMd: atLimit,
    });
    assert.equal(result.success, true);
  });

  test("customSkillMd is optional (an empty patch still validates)", () => {
    const result = VoiceBlueprintPatchSchema.safeParse({});
    assert.equal(result.success, true);
  });

  test("still rejects unknown keys (.strict() preserved)", () => {
    const result = VoiceBlueprintPatchSchema.safeParse({
      customSkillMd: "ok",
      somethingUnknown: true,
    });
    assert.equal(result.success, false);
  });
});
