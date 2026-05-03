// Unit tests for the personality-images registry (v1.1.5 / Issue #3)
// — every CRMPersonality ships a curated Unsplash bundle so fresh
// workspaces render with industry-relevant photography out of the box.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { getPersonalityImages } from "@/lib/crm/personality-images";

describe("getPersonalityImages", () => {
  const VERTICALS = ["hvac", "dental", "legal", "agency", "coaching"] as const;

  for (const vertical of VERTICALS) {
    test(`${vertical} ships a non-empty bundle`, () => {
      const bundle = getPersonalityImages(vertical);
      assert.ok(bundle, `${vertical} should have an image bundle`);
      assert.ok(
        bundle!.hero_url.startsWith("https://images.unsplash.com/"),
        `${vertical} hero must be an Unsplash URL`
      );
      assert.ok(
        bundle!.service_grid_image_urls.length >= 4,
        `${vertical} needs at least 4 service images for round-robin`
      );
      for (const url of bundle!.service_grid_image_urls) {
        assert.ok(
          url.startsWith("https://images.unsplash.com/"),
          `${vertical} service image must be an Unsplash URL: ${url}`
        );
      }
    });
  }

  test("v1.3.1 — falls back to GENERAL bundle for unknown verticals", () => {
    // Pre-v1.3.1: returned null for unknown verticals → workspaces with
    // LLM-generated personalities (vertical = "roofing", "pet-grooming",
    // etc.) shipped text-only heroes. Now falls back to GENERAL_IMAGES
    // so every workspace renders with industry-neutral photography.
    const general = getPersonalityImages("general");
    assert.ok(general, "GENERAL_IMAGES must be defined");

    const unknown = getPersonalityImages("nonexistent");
    assert.equal(unknown, general, "unknown vertical → GENERAL fallback");

    const llmGenerated = getPersonalityImages("pet-grooming");
    assert.equal(llmGenerated, general, "LLM-generated vertical → GENERAL fallback");

    // null/undefined still resolve to GENERAL (graceful degradation).
    assert.equal(getPersonalityImages(null), general);
    assert.equal(getPersonalityImages(undefined), general);
  });

  test("hero URL carries the canonical Unsplash sizing params (w=1600&h=900)", () => {
    const bundle = getPersonalityImages("dental");
    assert.ok(bundle);
    assert.match(bundle!.hero_url, /w=1600&h=900/);
    assert.match(bundle!.hero_url, /auto=format/);
    assert.match(bundle!.hero_url, /fit=crop/);
  });

  test("service URLs carry the canonical card sizing params (w=800&h=600)", () => {
    const bundle = getPersonalityImages("hvac");
    assert.ok(bundle);
    assert.match(bundle!.service_grid_image_urls[0], /w=800&h=600/);
  });
});
