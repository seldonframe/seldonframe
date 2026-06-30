// Marketplace buyer onboarding — TDD for the PURE business-info + go-live helpers
// (no DB, no I/O). These two pure functions are the load-bearing logic behind the
// business_info step (validate + normalize the form → persona facts + booking
// hours) and the go_live step (what REQUIRED step is still outstanding). The UI
// (business-info-step.tsx, go-live-step.tsx) and the server actions
// (saveBusinessInfoAction, goLiveAction) both share this one implementation, so
// the contract is pinned here.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  validateBusinessInfo,
  goLiveBlockers,
  canGoLive,
  normalizeUsPhoneToE164,
} from "../../../../src/lib/marketplace/buyer/buyer-onboarding";
import type { OnboardingStep } from "../../../../src/lib/marketplace/onboarding/steps";

// ─── validateBusinessInfo ────────────────────────────────────────────────────

test("validateBusinessInfo: trims the name and accepts a minimal form", () => {
  const r = validateBusinessInfo({ name: "  Northgate Plumbing  " });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.name, "Northgate Plumbing");
  assert.deepEqual(r.value.services, []);
  assert.equal(r.value.hoursText, undefined);
  assert.equal(r.value.bookingHours, undefined);
});

test("validateBusinessInfo: a blank/whitespace name is the one hard error", () => {
  for (const name of ["", "   ", "\t"]) {
    const r = validateBusinessInfo({ name });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.error, "name_required");
  }
});

test("validateBusinessInfo: drops blank service rows and trims fields", () => {
  const r = validateBusinessInfo({
    name: "Acme",
    services: [
      { name: "  Drain cleaning  ", price: " $140 " },
      { name: "   ", price: "$99" }, // blank name → dropped
      { name: "Water heater repair" }, // no price → price omitted
      { name: "", price: "" }, // fully blank → dropped
    ],
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.value.services, [
    { name: "Drain cleaning", price: "$140" },
    { name: "Water heater repair" },
  ]);
});

test("validateBusinessInfo: a valid open/close window yields BOTH a display string and Mon–Fri booking hours", () => {
  const r = validateBusinessInfo({
    name: "Acme",
    hoursOpen: "08:00",
    hoursClose: "18:00",
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.hoursText, "8:00 AM – 6:00 PM");
  // Weekdays 1..5 each carry the same window; weekend (0,6) absent.
  assert.deepEqual(Object.keys(r.value.bookingHours ?? {}).sort(), ["1", "2", "3", "4", "5"]);
  assert.deepEqual(r.value.bookingHours?.[1], { start: "08:00", end: "18:00" });
  assert.equal(r.value.bookingHours?.[0], undefined);
  assert.equal(r.value.bookingHours?.[6], undefined);
});

test("validateBusinessInfo: close must be strictly after open", () => {
  const same = validateBusinessInfo({ name: "Acme", hoursOpen: "09:00", hoursClose: "09:00" });
  assert.equal(same.ok, false);
  if (same.ok) return;
  assert.equal(same.error, "invalid_hours");

  const backwards = validateBusinessInfo({ name: "Acme", hoursOpen: "18:00", hoursClose: "08:00" });
  assert.equal(backwards.ok, false);
});

test("validateBusinessInfo: only one bound provided is invalid (both-or-neither)", () => {
  const openOnly = validateBusinessInfo({ name: "Acme", hoursOpen: "08:00" });
  assert.equal(openOnly.ok, false);
  if (openOnly.ok) return;
  assert.equal(openOnly.error, "invalid_hours");

  const closeOnly = validateBusinessInfo({ name: "Acme", hoursClose: "18:00" });
  assert.equal(closeOnly.ok, false);
});

test("validateBusinessInfo: a malformed HH:MM is rejected", () => {
  const r = validateBusinessInfo({ name: "Acme", hoursOpen: "8am", hoursClose: "18:00" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error, "invalid_hours");
});

test("validateBusinessInfo: no hours at all is valid (not an error)", () => {
  const r = validateBusinessInfo({ name: "Acme", hoursOpen: "", hoursClose: "  " });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.hoursText, undefined);
  assert.equal(r.value.bookingHours, undefined);
});

// ─── goLiveBlockers / canGoLive ──────────────────────────────────────────────

/** A receptionist step list: business_info (req) → connect_tool (skip) → phone
 *  (req) → test (skip) → go_live (req). */
const RECEPTIONIST_STEPS: OnboardingStep[] = [
  { kind: "business_info", label: "About your business", required: true },
  { kind: "connect_tool", label: "Connect googlecalendar", required: false, toolkit: "googlecalendar" },
  { kind: "phone", label: "Your phone", required: true },
  { kind: "test", label: "Hear it work", required: false },
  { kind: "go_live", label: "Go live", required: true },
];

test("goLiveBlockers: nothing done → the required steps (business_info + phone) block; go_live itself never blocks", () => {
  const blockers = goLiveBlockers(RECEPTIONIST_STEPS, { doneKinds: [] });
  assert.deepEqual(
    blockers.map((b) => b.kind),
    ["business_info", "phone"],
  );
  assert.ok(!blockers.some((b) => b.kind === "go_live"));
  assert.equal(canGoLive(RECEPTIONIST_STEPS, { doneKinds: [] }), false);
});

test("goLiveBlockers: skippable steps (connect_tool, test) never block", () => {
  // Both required steps done, the skippable ones NOT done → clear to go live.
  const blockers = goLiveBlockers(RECEPTIONIST_STEPS, {
    doneKinds: ["business_info", "phone"],
  });
  assert.deepEqual(blockers, []);
  assert.equal(canGoLive(RECEPTIONIST_STEPS, { doneKinds: ["business_info", "phone"] }), true);
});

test("goLiveBlockers: a missing phone alone blocks a voice agent", () => {
  const blockers = goLiveBlockers(RECEPTIONIST_STEPS, { doneKinds: ["business_info"] });
  assert.deepEqual(
    blockers.map((b) => b.kind),
    ["phone"],
  );
});

test("goLiveBlockers: blockers carry the buyer-facing label", () => {
  const blockers = goLiveBlockers(RECEPTIONIST_STEPS, { doneKinds: [] });
  const phone = blockers.find((b) => b.kind === "phone");
  assert.equal(phone?.label, "Your phone");
});

test("goLiveBlockers: tolerates malformed/absent progress (jsonb edge)", () => {
  const a = goLiveBlockers(RECEPTIONIST_STEPS, null);
  const b = goLiveBlockers(RECEPTIONIST_STEPS, undefined);
  const c = goLiveBlockers(RECEPTIONIST_STEPS, { doneKinds: [null as never, undefined as never] });
  // All treat nothing as done → both required steps block; never throws.
  for (const blockers of [a, b, c]) {
    assert.deepEqual(blockers.map((x) => x.kind), ["business_info", "phone"]);
  }
});

test("goLiveBlockers: a connector-less chat agent (business_info + go_live) clears once business_info is done", () => {
  const chatSteps: OnboardingStep[] = [
    { kind: "business_info", label: "About your business", required: true },
    { kind: "test", label: "Hear it work", required: false },
    { kind: "go_live", label: "Go live", required: true },
  ];
  assert.equal(canGoLive(chatSteps, { doneKinds: [] }), false);
  assert.equal(canGoLive(chatSteps, { doneKinds: ["business_info"] }), true);
});

// ─── normalizeUsPhoneToE164 (BYO forward number) ─────────────────────────────

test("normalizeUsPhoneToE164: accepts the natural ways an SMB owner types a number", () => {
  for (const input of [
    "(602) 555-0148",
    "602-555-0148",
    "602.555.0148",
    "6025550148",
    " 602 555 0148 ",
  ]) {
    assert.equal(normalizeUsPhoneToE164(input), "+16025550148", `input: ${input}`);
  }
});

test("normalizeUsPhoneToE164: an 11-digit number with country code 1 normalizes", () => {
  assert.equal(normalizeUsPhoneToE164("1 (602) 555-0148"), "+16025550148");
  assert.equal(normalizeUsPhoneToE164("16025550148"), "+16025550148");
});

test("normalizeUsPhoneToE164: an already-E.164 value passes through (incl. non-US)", () => {
  assert.equal(normalizeUsPhoneToE164("+16025550148"), "+16025550148");
  assert.equal(normalizeUsPhoneToE164("+442071838750"), "+442071838750");
});

test("normalizeUsPhoneToE164: rejects an invalid NANP area code (leading 0 or 1)", () => {
  assert.equal(normalizeUsPhoneToE164("0025550148"), null);
  assert.equal(normalizeUsPhoneToE164("1025550148"), null);
});

test("normalizeUsPhoneToE164: rejects too-short / too-long / junk", () => {
  for (const input of ["", "   ", "555-0148", "123", "60255501480000000", "abc", "+", "+12"]) {
    assert.equal(normalizeUsPhoneToE164(input), null, `input: ${JSON.stringify(input)}`);
  }
});

test("normalizeUsPhoneToE164: tolerates non-string input (jsonb/edge)", () => {
  assert.equal(normalizeUsPhoneToE164(undefined), null);
  assert.equal(normalizeUsPhoneToE164(null), null);
  assert.equal(normalizeUsPhoneToE164(6025550148 as unknown), null);
});
