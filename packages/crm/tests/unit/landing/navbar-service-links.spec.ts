// Unit test for the Navbar's pure service-link builder. The visual dropdown is
// verified manually (per the repo idiom); only the href math is tested here.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildServiceNavLinks, sectionsForNav } from "../../../src/components/landing-r1/chrome/navbar";

describe("buildServiceNavLinks", () => {
  test("builds /<homeHref>/services/<slug> for each page", () => {
    const links = buildServiceNavLinks("/w/greenwood", [
      { slug: "kitchen-remodeling", name: "Kitchen Remodeling" },
      { slug: "bath-remodeling", name: "Bath Remodeling" },
    ]);
    assert.deepEqual(links, [
      { label: "Kitchen Remodeling", href: "/w/greenwood/services/kitchen-remodeling" },
      { label: "Bath Remodeling", href: "/w/greenwood/services/bath-remodeling" },
    ]);
  });

  test("normalizes a trailing slash on homeHref", () => {
    const links = buildServiceNavLinks("/w/greenwood/", [
      { slug: "decks", name: "Decks" },
    ]);
    assert.equal(links[0].href, "/w/greenwood/services/decks");
  });

  test("treats '/' homeHref as root", () => {
    const links = buildServiceNavLinks("/", [{ slug: "decks", name: "Decks" }]);
    assert.equal(links[0].href, "/services/decks");
  });

  test("skips entries with a blank slug or name", () => {
    const links = buildServiceNavLinks("/w/x", [
      { slug: "", name: "Blank" },
      { slug: "ok", name: "" },
      { slug: "good", name: "Good" },
    ]);
    assert.deepEqual(links, [{ label: "Good", href: "/w/x/services/good" }]);
  });

  test("returns [] for an empty / missing list", () => {
    assert.deepEqual(buildServiceNavLinks("/w/x", []), []);
    // @ts-expect-error — defensive against jsonb junk.
    assert.deepEqual(buildServiceNavLinks("/w/x", undefined), []);
  });
});

describe("sectionsForNav", () => {
  const DEFAULT = [
    { label: "Services", href: "#services" },
    { label: "Reviews", href: "#reviews" },
    { label: "FAQ", href: "#faq" },
    { label: "Contact", href: "#contact" },
  ];

  test("drops the redundant 'Services' anchor when the dropdown is present", () => {
    // The bug caught by vision-verify: a site with service pages showed
    // "Services ▾" (dropdown) AND "Services" (#services anchor).
    assert.deepEqual(sectionsForNav(DEFAULT, true), [
      { label: "Reviews", href: "#reviews" },
      { label: "FAQ", href: "#faq" },
      { label: "Contact", href: "#contact" },
    ]);
  });

  test("keeps all sections (incl. Services) when there is no dropdown", () => {
    assert.deepEqual(sectionsForNav(DEFAULT, false), DEFAULT);
  });

  test("matches a custom Services anchor by href", () => {
    const out = sectionsForNav(
      [{ label: "Our Services", href: "#services" }, { label: "FAQ", href: "#faq" }],
      true,
    );
    assert.deepEqual(out, [{ label: "FAQ", href: "#faq" }]);
  });

  test("matches a custom Services anchor by label (case-insensitive)", () => {
    const out = sectionsForNav(
      [{ label: "services", href: "#our-work" }, { label: "FAQ", href: "#faq" }],
      true,
    );
    assert.deepEqual(out, [{ label: "FAQ", href: "#faq" }]);
  });

  test("never drops a non-Services section", () => {
    assert.deepEqual(sectionsForNav([{ label: "Reviews", href: "#reviews" }], true), [
      { label: "Reviews", href: "#reviews" },
    ]);
  });
});
