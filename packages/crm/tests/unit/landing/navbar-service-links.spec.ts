// Unit test for the Navbar's pure service-link builder. The visual dropdown is
// verified manually (per the repo idiom); only the href math is tested here.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildServiceNavLinks } from "../../../src/components/landing-r1/chrome/navbar";

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
