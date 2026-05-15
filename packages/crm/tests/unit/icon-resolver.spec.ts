// packages/crm/tests/unit/icon-resolver.spec.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ShieldCheck,
  Sparkles,
  Wind,
  Wrench,
  CloudRainWind,
  Droplets,
} from "lucide-react";

import { resolveIconComponent } from "../../src/lib/blueprint/renderers/icon-resolver";

test("snake_case lucide name → lucide component (via fallthrough)", () => {
  // shield_check is NOT in the alias table; falls through to lucide-react.
  assert.equal(resolveIconComponent("shield_check"), ShieldCheck);
});

test("kebab-case lucide name → lucide component", () => {
  assert.equal(resolveIconComponent("shield-check"), ShieldCheck);
});

test("PascalCase lucide name → lucide component (operator-typed)", () => {
  assert.equal(resolveIconComponent("ShieldCheck"), ShieldCheck);
});

test("lowercase alias → mapped lucide component", () => {
  // "wind" appears in both the alias table (direct map) and lucide-react.
  // Either path returns the same Wind component.
  assert.equal(resolveIconComponent("wind"), Wind);
});

test("concept alias → mapped lucide component", () => {
  // "storm" is NOT a lucide icon name; only resolves via the alias table.
  assert.equal(resolveIconComponent("storm"), CloudRainWind);
  assert.equal(resolveIconComponent("drain"), Droplets);
  assert.equal(resolveIconComponent("repair"), Wrench);
});

test("unknown name → Sparkles fallback", () => {
  assert.equal(resolveIconComponent("wood_oven"), Sparkles);
  assert.equal(resolveIconComponent("this-is-not-a-real-icon"), Sparkles);
  assert.equal(resolveIconComponent("xyzabc"), Sparkles);
});

test("null / undefined / empty / whitespace → Sparkles fallback", () => {
  assert.equal(resolveIconComponent(null), Sparkles);
  assert.equal(resolveIconComponent(undefined), Sparkles);
  assert.equal(resolveIconComponent(""), Sparkles);
  assert.equal(resolveIconComponent("   "), Sparkles);
});

test("whitespace-padded names get trimmed", () => {
  assert.equal(resolveIconComponent("  shield_check  "), ShieldCheck);
});

test("previously-rejected-by-allowlist names now resolve", () => {
  // These were the icons logged on 2026-05-15 as failing the old allowlist.
  // All three should now resolve via lucide-react fallthrough.
  assert.notEqual(resolveIconComponent("shield_check"), Sparkles);
  assert.notEqual(resolveIconComponent("wind"), Sparkles);
  // "building_2" — lucide has a Building2 icon
  assert.notEqual(resolveIconComponent("building_2"), Sparkles);
});
