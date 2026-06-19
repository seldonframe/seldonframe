// Tests for the pure multi-page site-tree helpers (no DB, no mocks).
//
// Repo convention: node:test + tsx (see scripts/run-unit-tests.js). Unit
// tests live at tests/unit/**/*.spec.ts and run via `pnpm test:unit` or a
// single file via `npx tsx --test tests/unit/landing/r1-site-tree.spec.ts`.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  serviceSlug,
  validateSiteTree,
  getServicePages,
  findServicePage,
} from "../../../src/lib/landing/r1-site-tree";

describe("serviceSlug", () => {
  test("lowercases, hyphenates, and trims punctuation", () => {
    assert.equal(serviceSlug("Kitchen Remodeling"), "kitchen-remodeling");
    assert.equal(serviceSlug("  Roofing & Siding!  "), "roofing-siding");
    assert.equal(serviceSlug("Bath/Shower Conversions"), "bath-shower-conversions");
    assert.equal(serviceSlug("Decks   and   Patios"), "decks-and-patios");
  });

  test("collapses non-alphanumerics and strips leading/trailing hyphens", () => {
    assert.equal(serviceSlug("---ADU Additions---"), "adu-additions");
    assert.equal(serviceSlug("A/C & Heating"), "a-c-heating");
  });

  test("returns empty string for empty / non-string input", () => {
    assert.equal(serviceSlug(""), "");
    assert.equal(serviceSlug("   "), "");
    // @ts-expect-error — defensive: callers may pass junk from jsonb.
    assert.equal(serviceSlug(undefined), "");
    // @ts-expect-error — defensive.
    assert.equal(serviceSlug(42), "");
  });
});

import { multiPagePayload } from "./r1-site-tree-fixture";

describe("getServicePages", () => {
  test("returns the servicePages array when present", () => {
    const pages = getServicePages(multiPagePayload);
    assert.equal(pages.length, 3);
    assert.equal(pages[0].slug, "kitchen-remodeling");
  });

  test("returns [] when servicePages is absent (legacy single-page payload)", () => {
    const legacy = { ...multiPagePayload };
    delete (legacy as { servicePages?: unknown }).servicePages;
    assert.deepEqual(getServicePages(legacy), []);
  });

  test("returns [] for malformed servicePages (not an array)", () => {
    const bad = { ...multiPagePayload, servicePages: "nope" as unknown } as typeof multiPagePayload;
    assert.deepEqual(getServicePages(bad), []);
  });
});

describe("findServicePage", () => {
  test("finds a page by exact slug", () => {
    const page = findServicePage(multiPagePayload, "bath-remodeling");
    assert.ok(page);
    assert.equal(page!.name, "Bath Remodeling");
  });

  test("returns null for an unknown slug", () => {
    assert.equal(findServicePage(multiPagePayload, "pool-installation"), null);
  });

  test("returns null when servicePages is absent", () => {
    const legacy = { ...multiPagePayload };
    delete (legacy as { servicePages?: unknown }).servicePages;
    assert.equal(findServicePage(legacy, "kitchen-remodeling"), null);
  });

  test("ignores entries with a missing/blank slug", () => {
    const bad = {
      ...multiPagePayload,
      servicePages: [
        { slug: "", name: "Blank", summary: "", body: [], ctaLabel: "x" },
        { slug: "decks", name: "Decks", summary: "", body: [], ctaLabel: "x" },
      ],
    } as typeof multiPagePayload;
    assert.equal(findServicePage(bad, ""), null);
    assert.equal(findServicePage(bad, "decks")!.name, "Decks");
  });
});

describe("validateSiteTree", () => {
  test("a legacy single-page payload (no servicePages) is valid", () => {
    const legacy = { ...multiPagePayload };
    delete (legacy as { servicePages?: unknown }).servicePages;
    delete (legacy as { nav?: unknown }).nav;
    delete (legacy as { theme?: unknown }).theme;
    const res = validateSiteTree(legacy);
    assert.equal(res.valid, true);
    assert.deepEqual(res.errors, []);
  });

  test("the multi-page fixture is valid", () => {
    const res = validateSiteTree(multiPagePayload);
    assert.equal(res.valid, true, JSON.stringify(res.errors));
    assert.deepEqual(res.errors, []);
  });

  test("flags a service page missing required string fields", () => {
    const bad = {
      ...multiPagePayload,
      servicePages: [
        { slug: "ok", name: "Ok", summary: "fine", body: [], ctaLabel: "Go" },
        { slug: "", name: "", summary: "", body: [], ctaLabel: "" } as ServicePageLike,
      ],
    } as typeof multiPagePayload;
    const res = validateSiteTree(bad);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("slug")));
    assert.ok(res.errors.some((e) => e.includes("name")));
  });

  test("flags duplicate service slugs", () => {
    const bad = {
      ...multiPagePayload,
      servicePages: [
        { slug: "dup", name: "One", summary: "a", body: [], ctaLabel: "x" },
        { slug: "dup", name: "Two", summary: "b", body: [], ctaLabel: "y" },
      ],
    } as typeof multiPagePayload;
    const res = validateSiteTree(bad);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.toLowerCase().includes("duplicate")));
  });

  test("flags an invalid theme.mode", () => {
    const bad = { ...multiPagePayload, theme: { mode: "neon" as unknown } } as typeof multiPagePayload;
    const res = validateSiteTree(bad);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("theme.mode")));
  });

  test("returns invalid (not a throw) for non-object input", () => {
    for (const junk of [undefined, null, 7, "nope", []]) {
      assert.doesNotThrow(() => validateSiteTree(junk));
      assert.equal(validateSiteTree(junk).valid, false);
    }
  });
});

// Local structural alias used only to construct deliberately-broken fixtures
// above without fighting the exact ServicePage type.
type ServicePageLike = {
  slug: string;
  name: string;
  summary: string;
  body: unknown[];
  ctaLabel: string;
};
