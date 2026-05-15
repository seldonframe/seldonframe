// Tests for v1.54.0 server-side enforcement of archetype-correct
// hero template + variant in persist_block.
//
// The CC agent's LLM may pick the wrong template (e.g. "viktor-light"
// for a bold-urgency plumbing workspace). persist_block must:
//   1. Resolve archetype from org.theme.aestheticArchetype
//   2. Override hero's `template` and `variant` server-side
//   3. Emit observability events when override fires
//
// This is a pure unit test of the override decision logic, extracted
// into a pure function (enforceArchetypeOnHero) so we don't need a
// real DB to test it.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  enforceArchetypeOnHero,
  type HeroEnforcementInput,
} from "../../src/lib/page-blocks/persist";

describe("enforceArchetypeOnHero — bold-urgency forces empty template + split-screen variant", () => {
  test("LLM picked viktor-light → override to empty template", () => {
    const input: HeroEnforcementInput = {
      workspaceId: "ws-1",
      archetypeId: "bold-urgency",
      llmTemplate: "viktor-light",
      llmVariant: "full-bleed",
    };
    const result = enforceArchetypeOnHero(input);
    assert.equal(result.finalTemplate, "");
    assert.equal(result.finalVariant, "split-screen-50-50");
    assert.ok(result.templateOverridden);
    assert.ok(result.variantOverridden);
  });

  test("LLM picked empty (correct) → no override", () => {
    const input: HeroEnforcementInput = {
      workspaceId: "ws-1",
      archetypeId: "bold-urgency",
      llmTemplate: "",
      llmVariant: "split-screen-50-50",
    };
    const result = enforceArchetypeOnHero(input);
    assert.equal(result.finalTemplate, "");
    assert.equal(result.finalVariant, "split-screen-50-50");
    assert.equal(result.templateOverridden, false);
    assert.equal(result.variantOverridden, false);
  });
});

describe("enforceArchetypeOnHero — clinical-trust forces nexora-light + left-aligned-asymmetric", () => {
  test("LLM picked viktor-light → override to nexora-light", () => {
    const input: HeroEnforcementInput = {
      workspaceId: "ws-2",
      archetypeId: "clinical-trust",
      llmTemplate: "viktor-light",
      llmVariant: "founder-portrait",
    };
    const result = enforceArchetypeOnHero(input);
    assert.equal(result.finalTemplate, "nexora-light");
    assert.equal(result.finalVariant, "left-aligned-asymmetric");
    assert.ok(result.templateOverridden);
  });

  test("LLM picked nexora-light (correct) → no override", () => {
    const input: HeroEnforcementInput = {
      workspaceId: "ws-2",
      archetypeId: "clinical-trust",
      llmTemplate: "nexora-light",
      llmVariant: "left-aligned-asymmetric",
    };
    const result = enforceArchetypeOnHero(input);
    assert.equal(result.finalTemplate, "nexora-light");
    assert.equal(result.templateOverridden, false);
  });
});

describe("enforceArchetypeOnHero — cinematic-aspirational forces cinematic-aura", () => {
  test("LLM picked anything → override to cinematic-aura", () => {
    const input: HeroEnforcementInput = {
      workspaceId: "ws-3",
      archetypeId: "cinematic-aspirational",
      llmTemplate: "stellar-tabs-white",
      llmVariant: "full-bleed",
    };
    const result = enforceArchetypeOnHero(input);
    assert.equal(result.finalTemplate, "cinematic-aura");
    assert.equal(result.finalVariant, "cinematic-aura");
    assert.ok(result.templateOverridden);
    assert.ok(result.variantOverridden);
  });
});

describe("enforceArchetypeOnHero — unknown template treated as overridable", () => {
  test("LLM picked garbage → override to archetype default", () => {
    const input: HeroEnforcementInput = {
      workspaceId: "ws-4",
      archetypeId: "editorial-warm",
      llmTemplate: "totally-invalid-template-id",
      llmVariant: "split-image-right",
    };
    const result = enforceArchetypeOnHero(input);
    assert.equal(result.finalTemplate, "viktor-light");
    assert.ok(result.templateOverridden);
  });
});
