// Studio sub-nav — the STUDIO_TABS label/href contract.
//
// Pins the rename: the fourth tab is labelled "Revenue" (was "Earnings") while
// KEEPING its legacy `/studio/earnings` href (least-risk: only the visible label
// changed, the route is untouched). Also guards that every Studio surface stays
// reachable exactly once and the Activity tab is present.
//
// Run:
//   node --import tsx --test tests/unit/layout/studio-tabs-config.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { STUDIO_TABS } from "../../../src/app/(dashboard)/studio/studio-tabs";

// Widen the readonly literal tuple to a plain {href,label}[] so the negative
// guards below (asserting a value is NOT present) are legal comparisons rather
// than `as const`-narrowed "no overlap" type errors. The runtime data is the
// same array — this only relaxes the static type for the assertions.
const TABS: { href: string; label: string }[] = STUDIO_TABS.map((t) => ({
  href: t.href,
  label: t.label,
}));

function labelFor(href: string): string | undefined {
  return TABS.find((t) => t.href === href)?.label;
}

describe("STUDIO_TABS", () => {
  test("the /studio/earnings tab is labelled 'Revenue' (renamed from 'Earnings')", () => {
    assert.equal(labelFor("/studio/earnings"), "Revenue");
  });

  test("no tab is labelled 'Earnings' anymore", () => {
    assert.equal(
      TABS.some((t) => t.label === "Earnings"),
      false,
    );
  });

  test("the Revenue route is unchanged (still /studio/earnings)", () => {
    assert.equal(
      TABS.some((t) => t.href === "/studio/earnings"),
      true,
    );
    // No new /studio/revenue route was introduced.
    assert.equal(
      TABS.some((t) => t.href === "/studio/revenue"),
      false,
    );
  });

  test("every Studio surface is reachable exactly once", () => {
    const hrefs = TABS.map((t) => t.href);
    const expected = [
      "/studio/agents",
      "/studio/agents/activity",
      "/studio/clients",
      "/studio/earnings",
    ];
    assert.deepEqual([...hrefs].sort(), [...expected].sort());
    // No duplicates.
    assert.equal(new Set(hrefs).size, hrefs.length);
  });

  test("the Activity tab is present and labelled 'Activity'", () => {
    assert.equal(labelFor("/studio/agents/activity"), "Activity");
  });
});
