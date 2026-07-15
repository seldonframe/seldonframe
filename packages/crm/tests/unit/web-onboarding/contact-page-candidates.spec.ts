// packages/crm/tests/unit/web-onboarding/contact-page-candidates.spec.ts
//
// Pure helper — no IO. Harvests markdown links off a scraped homepage and
// ranks candidate "contact-shaped" pages (contact/about/location/visit/
// find-us) so the extractor can retry extraction against them when the
// homepage alone is missing a required field (e.g. phone lives on /contact
// behind CleanTalk obfuscation). See
// docs/superpowers/specs/2026-07-14-extraction-failed-honesty-and-contact-fallback-design.md.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { findContactPageCandidates } from "../../../src/lib/web-onboarding/contact-page-candidates";

describe("findContactPageCandidates", () => {
  test("resolves absolute and relative hrefs against baseUrl", () => {
    const md =
      "[Contact us](/contact)\n" +
      "[About](https://acme.com/about)\n" +
      "[Home](/)\n";
    const result = findContactPageCandidates(md, "https://acme.com/");
    assert.deepEqual(result, ["https://acme.com/contact", "https://acme.com/about"]);
  });

  test("excludes cross-host links even if the pathname matches", () => {
    const md =
      "[Contact us](https://otherhost.com/contact)\n" +
      "[About](/about)\n";
    const result = findContactPageCandidates(md, "https://acme.com/");
    assert.deepEqual(result, ["https://acme.com/about"]);
  });

  test("ranks contact-matching paths before about/other", () => {
    const md =
      "[About us](/about)\n" +
      "[Visit us](/visit)\n" +
      "[Contact](/contact)\n";
    const result = findContactPageCandidates(md, "https://acme.com/");
    assert.equal(result[0], "https://acme.com/contact");
  });

  test("dedupes on origin+pathname (strips query/hash)", () => {
    const md =
      "[Contact](/contact)\n" +
      "[Contact again](/contact?utm=1)\n" +
      "[Contact anchor](/contact#form)\n";
    const result = findContactPageCandidates(md, "https://acme.com/");
    assert.deepEqual(result, ["https://acme.com/contact"]);
  });

  test("excludes the base page itself (falls through to guess fallback when it was the only match)", () => {
    const md = "[Contact us](https://acme.com/contact-us)\n";
    const result = findContactPageCandidates(md, "https://acme.com/contact-us");
    // The only in-page match was the base page itself, so it's excluded and
    // zero real candidates remain — per spec this falls back to the guesses.
    assert.deepEqual(result, ["https://acme.com/contact", "https://acme.com/contact-us"]);
  });

  test("excludes the base page itself while keeping a distinct sibling candidate", () => {
    const md = "[Contact us](https://acme.com/contact-us)\n[About](/about)\n";
    const result = findContactPageCandidates(md, "https://acme.com/contact-us");
    assert.deepEqual(result, ["https://acme.com/about"]);
  });

  test("caps at 2 candidates", () => {
    const md =
      "[Contact](/contact)\n" +
      "[About](/about)\n" +
      "[Location](/location)\n" +
      "[Visit us](/visit-us)\n" +
      "[Find us](/find-us)\n";
    const result = findContactPageCandidates(md, "https://acme.com/");
    assert.equal(result.length, 2);
  });

  test("falls back to guesses when zero matches found", () => {
    const md = "[Home](/)\n[Services](/services)\n";
    const result = findContactPageCandidates(md, "https://acme.com/");
    assert.deepEqual(result, ["https://acme.com/contact", "https://acme.com/contact-us"]);
  });

  test("invalid baseUrl returns []", () => {
    const md = "[Contact](/contact)\n";
    const result = findContactPageCandidates(md, "not-a-url");
    assert.deepEqual(result, []);
  });

  test("matches find-us and find_us variants (case-insensitive)", () => {
    const md = "[Find Us](/Find-Us)\n";
    const result = findContactPageCandidates(md, "https://acme.com/");
    assert.deepEqual(result, ["https://acme.com/Find-Us"]);
  });
});
