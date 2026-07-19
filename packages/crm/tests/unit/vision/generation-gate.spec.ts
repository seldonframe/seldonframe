import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shouldGenerationVerify,
  buildGenerationVisionGoal,
  GENERATION_RUBRIC,
} from "@/lib/vision/generation-gate";

// ─────────────────────────── shouldGenerationVerify ───────────────────────

test("shouldGenerationVerify: flag off never verifies", () => {
  assert.equal(shouldGenerationVerify(false), false);
});

test("shouldGenerationVerify: flag on always verifies (generation always just happened)", () => {
  assert.equal(shouldGenerationVerify(true), true);
});

// ─────────────────────────── buildGenerationVisionGoal ────────────────────

test("buildGenerationVisionGoal: includes the business name", () => {
  const goal = buildGenerationVisionGoal("Rain Pros Plumbing");
  assert.match(goal, /Rain Pros Plumbing/);
});

test("buildGenerationVisionGoal: is non-empty for a normal name", () => {
  const goal = buildGenerationVisionGoal("Seattle Heating");
  assert.ok(goal.trim().length > 0);
});

test("buildGenerationVisionGoal: falls back gracefully on an empty/blank name without throwing", () => {
  const goal = buildGenerationVisionGoal("");
  assert.ok(goal.trim().length > 0);
  const goal2 = buildGenerationVisionGoal("   ");
  assert.ok(goal2.trim().length > 0);
});

// ─────────────────────────── GENERATION_RUBRIC ─────────────────────────────

test("GENERATION_RUBRIC: mentions the duplicate-nav check", () => {
  assert.match(GENERATION_RUBRIC.toLowerCase(), /duplicate/);
  assert.match(GENERATION_RUBRIC.toLowerCase(), /nav/);
});

test("GENERATION_RUBRIC: mentions the business name must appear", () => {
  assert.match(GENERATION_RUBRIC.toLowerCase(), /business name/);
});

test("GENERATION_RUBRIC: mentions hero + CTA", () => {
  assert.match(GENERATION_RUBRIC.toLowerCase(), /hero/);
  assert.match(GENERATION_RUBRIC.toLowerCase(), /call-to-action|cta/);
});

test("GENERATION_RUBRIC: mentions broken/missing images", () => {
  assert.match(GENERATION_RUBRIC.toLowerCase(), /image/);
});
