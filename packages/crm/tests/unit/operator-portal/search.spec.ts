// tests/unit/operator-portal/search.spec.ts
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { rankResults, type UniversalSearchResult, type SearchQueryDeps } from "../../../src/lib/operator-portal/search";

// rankResults is the PURE ranking logic, testable without DB.

describe("rankResults", () => {
  test("exact match ranked higher than prefix match", () => {
    const results: UniversalSearchResult[] = [
      { type: "contact", id: "c1", title: "Jane Doe", subtitle: "jane@example.com", href: "/portal/x/messages/c1", score: 0 },
      { type: "contact", id: "c2", title: "Jane", subtitle: "jane2@example.com", href: "/portal/x/messages/c2", score: 0 },
    ];
    const ranked = rankResults("Jane", results);
    // c2 title === query exactly → ranked first
    assert.equal(ranked[0]?.id, "c2");
    assert.equal(ranked[1]?.id, "c1");
  });

  test("prefix match ranked higher than substring match", () => {
    const results: UniversalSearchResult[] = [
      { type: "contact", id: "c1", title: "Jane Smith", subtitle: "", href: "/x", score: 0 },      // prefix
      { type: "contact", id: "c2", title: "My Jane", subtitle: "", href: "/x", score: 0 },          // substring
    ];
    const ranked = rankResults("Jane", results);
    assert.equal(ranked[0]?.id, "c1");
    assert.equal(ranked[1]?.id, "c2");
  });

  test("contacts ranked before deals before bookings at same score", () => {
    const results: UniversalSearchResult[] = [
      { type: "booking", id: "b1", title: "Jane Booking", subtitle: "", href: "/x", score: 2 },
      { type: "deal", id: "d1", title: "Jane Deal", subtitle: "", href: "/x", score: 2 },
      { type: "contact", id: "c1", title: "Jane Contact", subtitle: "", href: "/x", score: 2 },
    ];
    const ranked = rankResults("Jane", results);
    assert.equal(ranked[0]?.type, "contact");
    assert.equal(ranked[1]?.type, "deal");
    assert.equal(ranked[2]?.type, "booking");
  });

  test("empty query returns empty", () => {
    const results: UniversalSearchResult[] = [
      { type: "contact", id: "c1", title: "Jane", subtitle: "", href: "/x", score: 0 },
    ];
    const ranked = rankResults("", results);
    assert.equal(ranked.length, 0);
  });

  test("case-insensitive matching", () => {
    const results: UniversalSearchResult[] = [
      { type: "contact", id: "c1", title: "JANE DOE", subtitle: "", href: "/x", score: 0 },
    ];
    const ranked = rankResults("jane", results);
    assert.equal(ranked.length, 1);
  });
});
