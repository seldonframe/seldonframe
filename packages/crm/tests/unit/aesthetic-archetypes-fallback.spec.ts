// Tests for the v1.54.0 fallbackImageQueries field on every aesthetic
// archetype. The field is used by personality-images.ts's Phase 2
// fallback when all LLM-generated Unsplash queries zero-result.
//
// Invariants:
//   1. Every archetype has at least 5 fallback queries
//   2. Each query is 2-4 words (broad enough to guarantee Unsplash hits,
//      narrow enough not to be useless filler)
//   3. Queries within an archetype are unique
//   4. The 8 known archetypes are still present (regression guard)
//   5. The classifier still routes plumbing/dental/medspa correctly

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  ARCHETYPES,
  classifyArchetype,
  type AestheticArchetypeId,
} from "../../src/lib/workspace/aesthetic-archetypes";

const ARCHETYPE_IDS: AestheticArchetypeId[] = [
  "editorial-warm",
  "bold-urgency",
  "clinical-trust",
  "cinematic-aspirational",
  "technical-restrained",
  "soft-residential",
  "brutalist",
  "midnight-craft",
];

describe("ARCHETYPES.fallbackImageQueries — invariants", () => {
  for (const id of ARCHETYPE_IDS) {
    test(`${id}: has at least 5 fallback queries`, () => {
      const archetype = ARCHETYPES[id];
      assert.ok(
        archetype.fallbackImageQueries.length >= 5,
        `${id} has ${archetype.fallbackImageQueries.length} fallbacks, expected >= 5`,
      );
    });

    test(`${id}: every fallback query is 2-4 words`, () => {
      const archetype = ARCHETYPES[id];
      for (const q of archetype.fallbackImageQueries) {
        const wordCount = q.trim().split(/\s+/).length;
        assert.ok(
          wordCount >= 2 && wordCount <= 4,
          `${id}: "${q}" has ${wordCount} words (must be 2-4)`,
        );
      }
    });

    test(`${id}: fallback queries are all unique`, () => {
      const archetype = ARCHETYPES[id];
      const set = new Set(archetype.fallbackImageQueries);
      assert.equal(
        set.size,
        archetype.fallbackImageQueries.length,
        `${id} has duplicate fallback queries`,
      );
    });
  }

  test("all 8 archetype ids are present", () => {
    for (const id of ARCHETYPE_IDS) {
      assert.ok(ARCHETYPES[id], `missing archetype: ${id}`);
    }
    assert.equal(
      Object.keys(ARCHETYPES).length,
      8,
      "exactly 8 archetypes expected",
    );
  });
});

describe("classifyArchetype regression", () => {
  test("plumbing + emergency → bold-urgency", () => {
    assert.equal(
      classifyArchetype({
        vertical: "plumbing",
        emergencyService: true,
        businessDescription: "24/7 emergency plumbing in Austin",
      }),
      "bold-urgency",
    );
  });

  test("dental → clinical-trust", () => {
    assert.equal(
      classifyArchetype({ vertical: "dental" }),
      "clinical-trust",
    );
  });

  test("medspa → cinematic-aspirational", () => {
    assert.equal(
      classifyArchetype({ vertical: "medspa" }),
      "cinematic-aspirational",
    );
  });

  test("design studio → brutalist", () => {
    assert.equal(
      classifyArchetype({
        vertical: "design studio",
        businessDescription: "creative design studio concept work",
      }),
      "brutalist",
    );
  });

  test("home cleaning → soft-residential", () => {
    assert.equal(
      classifyArchetype({ vertical: "cleaning" }),
      "soft-residential",
    );
  });

  test("unknown vertical → editorial-warm (fallback)", () => {
    assert.equal(
      classifyArchetype({ vertical: "alien massage parlor" }),
      "editorial-warm",
    );
  });
});
