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

  test("returns null for unknown vertical", () => {
    assert.equal(getPersonalityImages("nonexistent"), null);
    assert.equal(getPersonalityImages(null), null);
    assert.equal(getPersonalityImages(undefined), null);
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
