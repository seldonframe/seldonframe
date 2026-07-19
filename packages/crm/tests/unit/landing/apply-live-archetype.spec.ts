import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { applyLiveArchetype } from "../../../src/lib/landing/apply-live-archetype";

describe("applyLiveArchetype", () => {
  test("replaces archetype at the top level", () => {
    const input = { archetype: "clinical-trust", tagline: "hi" };
    const out = applyLiveArchetype(input, "cinematic-aspirational");
    assert.equal(out.archetype, "cinematic-aspirational");
  });

  test("replaces archetype nested inside hero", () => {
    const input = {
      hero: { archetype: "clinical-trust", headline: "Welcome" },
    };
    const out = applyLiveArchetype(input, "cinematic-aspirational");
    assert.equal(out.hero.archetype, "cinematic-aspirational");
    assert.equal(out.hero.headline, "Welcome");
  });

  test("replaces archetype in nested section objects", () => {
    const input = {
      sections: {
        servicesGrid: { archetype: "clinical-trust", title: "Services" },
        testimonials: { archetype: "clinical-trust", title: "Reviews" },
      },
    };
    const out = applyLiveArchetype(input, "cinematic-aspirational");
    assert.equal(out.sections.servicesGrid.archetype, "cinematic-aspirational");
    assert.equal(out.sections.testimonials.archetype, "cinematic-aspirational");
  });

  test("replaces archetype inside arrays (servicePages[].sections[]-shaped)", () => {
    const input = {
      servicePages: [
        {
          slug: "roofing",
          sections: [
            { archetype: "clinical-trust", kind: "hero" },
            { archetype: "clinical-trust", kind: "faq" },
          ],
        },
        {
          slug: "siding",
          sections: [{ archetype: "clinical-trust", kind: "hero" }],
        },
      ],
    };
    const out = applyLiveArchetype(input, "cinematic-aspirational");
    assert.equal(out.servicePages[0].sections[0].archetype, "cinematic-aspirational");
    assert.equal(out.servicePages[0].sections[1].archetype, "cinematic-aspirational");
    assert.equal(out.servicePages[1].sections[0].archetype, "cinematic-aspirational");
  });

  test("leaves non-archetype-id string values untouched", () => {
    const input = { archetype: "not-a-real-archetype-id" };
    const out = applyLiveArchetype(input, "cinematic-aspirational");
    assert.equal(out.archetype, "not-a-real-archetype-id");
  });

  test("leaves non-archetype keys untouched even with a valid-id-looking string value", () => {
    const input = { theme: "clinical-trust", archetype: "clinical-trust" };
    const out = applyLiveArchetype(input, "cinematic-aspirational");
    assert.equal(out.theme, "clinical-trust");
    assert.equal(out.archetype, "cinematic-aspirational");
  });

  test("returns a new object; does not mutate the input", () => {
    const input = { archetype: "clinical-trust", hero: { archetype: "clinical-trust" } };
    const out = applyLiveArchetype(input, "cinematic-aspirational");
    assert.notEqual(out, input);
    assert.equal(input.archetype, "clinical-trust");
    assert.equal(input.hero.archetype, "clinical-trust");
  });

  test("no-ops when the live id equals the frozen id everywhere", () => {
    const input = {
      archetype: "clinical-trust",
      hero: { archetype: "clinical-trust" },
      sections: [{ archetype: "clinical-trust" }],
    };
    const out = applyLiveArchetype(input, "clinical-trust");
    assert.equal(out.archetype, "clinical-trust");
    assert.equal(out.hero.archetype, "clinical-trust");
    assert.equal(out.sections[0].archetype, "clinical-trust");
    assert.notEqual(out, input);
  });
});
