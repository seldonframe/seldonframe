// ============================================================================
// v1.21.0 — customer-portal industry-aware copy pack contract
// ============================================================================
//
// Bug class these tests prevent: a v1.21+ ship adds an industry to
// the BusinessType classifier or CRMPersonality but forgets to add a
// copy pack — the customer portal silently falls back to the
// "general" pack without a signal. We document the contract that
// pickCustomerCopyPack ALWAYS returns a complete pack (no missing
// fields) and that the fallback is "general" (not undefined / null).
//
// The picker is also case-insensitive + tolerant of extra whitespace
// per the input normalization rule (organizations.soul.industry can
// arrive as "HVAC" / "hvac " / "Hvac" depending on the source).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  pickCustomerCopyPack,
  listKnownIndustries,
  type CustomerCopyPack,
} from "../../src/lib/customer-portal/copy-packs";

const REQUIRED_FIELDS: Array<keyof CustomerCopyPack> = [
  "industry",
  "welcomeHeading",
  "welcomeSubtext",
  "appointmentSingular",
  "appointmentPlural",
  "providerLabel",
  "rescheduleAction",
  "cancelAction",
  "bookAnotherAction",
  "getDirectionsAction",
  "nextHeading",
  "upcomingHeading",
  "pastHeading",
  "documentsHeading",
  "noUpcomingMessage",
  "noPastMessage",
  "noDocumentsMessage",
];

function assertCompletePack(pack: CustomerCopyPack, label: string): void {
  for (const field of REQUIRED_FIELDS) {
    const value = pack[field];
    assert.equal(
      typeof value,
      "string",
      `${label}: field ${String(field)} must be a string`,
    );
    assert.ok(
      value && value.length > 0,
      `${label}: field ${String(field)} must be non-empty`,
    );
  }
}

test("listKnownIndustries returns at least the seven baseline + general", () => {
  const known = listKnownIndustries();
  // We seeded: hvac, dental, legal, coaching, agency, medspa,
  // accounting, general. Future ships may add more — assert the
  // minimum so a regression that drops a pack fails.
  for (const required of [
    "hvac",
    "dental",
    "legal",
    "coaching",
    "agency",
    "medspa",
    "accounting",
    "general",
  ]) {
    assert.ok(
      known.includes(required),
      `expected ${required} in known industries`,
    );
  }
});

test("every known industry has a complete copy pack (no missing fields)", () => {
  for (const industry of listKnownIndustries()) {
    const pack = pickCustomerCopyPack(industry);
    assertCompletePack(pack, `industry=${industry}`);
    assert.equal(
      pack.industry,
      industry,
      `pack.industry must match its lookup key (${industry})`,
    );
  }
});

test("unknown industries fall back to the general pack", () => {
  const unknown = pickCustomerCopyPack("plumbing-unknown-vertical");
  assert.equal(unknown.industry, "general");
});

test("null / undefined / empty industry fall back to general", () => {
  assert.equal(pickCustomerCopyPack(null).industry, "general");
  assert.equal(pickCustomerCopyPack(undefined).industry, "general");
  assert.equal(pickCustomerCopyPack("").industry, "general");
  assert.equal(pickCustomerCopyPack("   ").industry, "general");
});

test("industry lookup is case-insensitive + trims whitespace", () => {
  // soul.industry can arrive as "HVAC" / "hvac " / " hvac" depending
  // on the source. Picker normalizes before lookup.
  assert.equal(pickCustomerCopyPack("HVAC").industry, "hvac");
  assert.equal(pickCustomerCopyPack("hvac ").industry, "hvac");
  assert.equal(pickCustomerCopyPack(" hvac").industry, "hvac");
  assert.equal(pickCustomerCopyPack("  Hvac  ").industry, "hvac");
});

test("HVAC pack uses 'service visit' terminology end-to-end", () => {
  const hvac = pickCustomerCopyPack("hvac");
  assert.match(hvac.appointmentSingular, /service visit/i);
  assert.match(hvac.nextHeading, /service visit/i);
  assert.match(hvac.upcomingHeading, /visit/i);
  assert.match(hvac.bookAnotherAction, /visit/i);
});

test("dental pack uses 'appointment' terminology end-to-end", () => {
  const dental = pickCustomerCopyPack("dental");
  assert.match(dental.appointmentSingular, /appointment/i);
  assert.match(dental.nextHeading, /appointment/i);
  assert.match(dental.bookAnotherAction, /appointment/i);
  // Provider label calibrated for industry too.
  assert.match(dental.providerLabel, /doctor/i);
});

test("coaching pack uses 'session' terminology end-to-end", () => {
  const coaching = pickCustomerCopyPack("coaching");
  assert.match(coaching.appointmentSingular, /session/i);
  assert.match(coaching.nextHeading, /session/i);
  assert.match(coaching.bookAnotherAction, /session/i);
  assert.match(coaching.providerLabel, /coach/i);
});

test("legal pack uses 'consultation' + 'attorney' terminology", () => {
  const legal = pickCustomerCopyPack("legal");
  assert.match(legal.appointmentSingular, /consultation/i);
  assert.match(legal.nextHeading, /consultation/i);
  assert.match(legal.providerLabel, /attorney/i);
  // Documents become "case documents" in legal context.
  assert.match(legal.documentsHeading, /case|document/i);
});

test("general pack provides safe fallback with neutral copy", () => {
  const general = pickCustomerCopyPack(null);
  // Generic enough to not feel wrong for unknown industries but
  // specific enough to be useful.
  assert.match(general.appointmentSingular, /appointment/i);
  assert.match(general.welcomeHeading, /welcome/i);
});

test("plural forms differ from singular forms (no copy/paste bug)", () => {
  // A common error: copy-pasting industry packs and forgetting to
  // pluralize. Catch it.
  for (const industry of listKnownIndustries()) {
    const pack = pickCustomerCopyPack(industry);
    assert.notEqual(
      pack.appointmentSingular,
      pack.appointmentPlural,
      `${industry}: appointmentPlural should differ from appointmentSingular (typically by adding 's')`,
    );
  }
});
