import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  contactDisplayName,
  groupBookingsByDay,
  smsHref,
  telHref,
} from "../../../src/lib/operator-portal/mobile-format";

describe("telHref / smsHref", () => {
  test("telHref strips spaces/parens/dashes to an E.164-ish dial string", () => {
    assert.equal(telHref("(839) 274-5430"), "tel:8392745430");
  });
  test("telHref keeps a leading +", () => {
    assert.equal(telHref("+1 839 274 5430"), "tel:+18392745430");
  });
  test("telHref returns empty string for no phone", () => {
    assert.equal(telHref(null), "");
  });
  test("smsHref uses the sms: scheme", () => {
    assert.equal(smsHref("+18392745430"), "sms:+18392745430");
  });
});

describe("contactDisplayName", () => {
  test("joins first + last", () => {
    assert.equal(contactDisplayName({ firstName: "Jane", lastName: "Doe" }), "Jane Doe");
  });
  test("falls back to phone when no name", () => {
    assert.equal(
      contactDisplayName({ firstName: "", lastName: null, phone: "8392745430" }),
      "8392745430",
    );
  });
  test("falls back to 'Lead' when nothing", () => {
    assert.equal(contactDisplayName({ firstName: "", lastName: null }), "Lead");
  });
});

describe("groupBookingsByDay", () => {
  test("groups bookings under a stable day key, ascending", () => {
    const groups = groupBookingsByDay([
      { id: "b2", startsAt: new Date("2026-06-15T14:00:00Z"), title: "B", fullName: null },
      { id: "b1", startsAt: new Date("2026-06-15T09:00:00Z"), title: "A", fullName: null },
      { id: "b3", startsAt: new Date("2026-06-16T10:00:00Z"), title: "C", fullName: null },
    ]);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].items.length, 2);
    assert.equal(groups[1].items.length, 1);
    // items within a day sorted ascending by start
    assert.equal(groups[0].items[0].id, "b1");
    assert.equal(groups[0].items[1].id, "b2");
  });
});
