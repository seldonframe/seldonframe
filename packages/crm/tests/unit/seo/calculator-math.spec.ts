import { test } from "node:test";
import assert from "node:assert/strict";

import {
  encodeHubspotCalcState,
  decodeHubspotCalcState,
  computeHubspotCost,
  HUBSPOT_CALC_BOUNDS,
} from "@/components/seo/hubspot-pricing-calculator";

import {
  encodeKlaviyoCalcState,
  decodeKlaviyoCalcState,
  computeKlaviyoCost,
  interpolateKlaviyoPrice,
  KLAVIYO_CALC_BOUNDS,
  KLAVIYO_SMS_RATE_HEDGED,
} from "@/components/seo/klaviyo-cost-calculator";

import {
  encodeVoiceCalcState,
  decodeVoiceCalcState,
  computeVoiceCost,
  VOICE_CALC_BOUNDS,
} from "@/components/seo/voice-ai-cost-calculator";

// ─── HubSpot: URL-state round-trip + clamping ──────────────────────────

test("encodeHubspotCalcState produces the four short stable keys", () => {
  const qs = encodeHubspotCalcState({ contacts: 2000, seats: 3, tier: "professional", onboarding: true });
  const params = new URLSearchParams(qs);
  assert.equal(params.get("hc"), "2000");
  assert.equal(params.get("hs"), "3");
  assert.equal(params.get("ht"), "professional");
  assert.equal(params.get("ho"), "1");
});

test("decodeHubspotCalcState round-trips values encoded by encodeHubspotCalcState", () => {
  const state = { contacts: 5000, seats: 5, tier: "enterprise" as const, onboarding: false };
  const qs = encodeHubspotCalcState(state);
  const decoded = decodeHubspotCalcState(qs);
  assert.deepEqual(decoded, state);
});

test("decodeHubspotCalcState clamps contacts and seats to slider bounds", () => {
  const decoded = decodeHubspotCalcState("hc=999999999&hs=999");
  assert.equal(decoded.contacts, HUBSPOT_CALC_BOUNDS.contacts.max);
  assert.equal(decoded.seats, HUBSPOT_CALC_BOUNDS.seats.max);
});

test("decodeHubspotCalcState clamps below-minimum values up to the floor", () => {
  const decoded = decodeHubspotCalcState("hc=0&hs=0");
  assert.equal(decoded.contacts, HUBSPOT_CALC_BOUNDS.contacts.min);
  assert.equal(decoded.seats, HUBSPOT_CALC_BOUNDS.seats.min);
});

test("decodeHubspotCalcState rejects an unknown tier value", () => {
  const decoded = decodeHubspotCalcState("ht=bogus");
  assert.equal(decoded.tier, undefined);
});

test("decodeHubspotCalcState accepts all three valid tier values", () => {
  assert.equal(decodeHubspotCalcState("ht=starter").tier, "starter");
  assert.equal(decodeHubspotCalcState("ht=professional").tier, "professional");
  assert.equal(decodeHubspotCalcState("ht=enterprise").tier, "enterprise");
});

// ─── HubSpot: cost math ─────────────────────────────────────────────────

test("computeHubspotCost: Starter is priced per seat with no onboarding fee", () => {
  const result = computeHubspotCost("starter", 1000, 2, true);
  assert.equal(result.onboardingFee, 0);
  assert.equal(result.monthlyCost, 30); // 2 seats * $15
});

test("computeHubspotCost: Professional includes 3 seats in the base price", () => {
  const result = computeHubspotCost("professional", 2000, 3, false);
  assert.equal(result.monthlyCost, 800); // no extra seats, no contact overage
  assert.equal(result.breakdown.length, 1);
});

test("computeHubspotCost: Professional charges for seats beyond the bundled 3", () => {
  const result = computeHubspotCost("professional", 2000, 5, false);
  assert.equal(result.monthlyCost, 800 + 2 * 45); // 2 extra seats @ $45
});

test("computeHubspotCost: onboarding fee only applies when the toggle is on", () => {
  const withOnboarding = computeHubspotCost("professional", 2000, 3, true);
  const without = computeHubspotCost("professional", 2000, 3, false);
  assert.equal(withOnboarding.onboardingFee, 3000);
  assert.equal(without.onboardingFee, 0);
  assert.equal(withOnboarding.monthlyCost, without.monthlyCost); // onboarding doesn't affect monthly
});

test("computeHubspotCost: Enterprise onboarding fee is $7,000", () => {
  const result = computeHubspotCost("enterprise", 10_000, 5, true);
  assert.equal(result.onboardingFee, 7000);
});

test("computeHubspotCost: first-year cost = 12 months + onboarding", () => {
  const result = computeHubspotCost("professional", 2000, 3, true);
  assert.equal(result.firstYearCost, result.monthlyCost * 12 + 3000);
});

test("computeHubspotCost: contact overage beyond the tier band is hedged and flagged", () => {
  const withinBand = computeHubspotCost("professional", 2000, 3, false);
  const overBand = computeHubspotCost("professional", 4000, 3, false);
  assert.equal(withinBand.contactOverageHedged, false);
  assert.equal(overBand.contactOverageHedged, true);
  assert.ok(overBand.monthlyCost > withinBand.monthlyCost);
});

test("computeHubspotCost: monthly cost is monotonic non-decreasing in contacts", () => {
  const low = computeHubspotCost("professional", 2000, 3, false);
  const high = computeHubspotCost("professional", 50_000, 3, false);
  assert.ok(high.monthlyCost >= low.monthlyCost);
});

test("computeHubspotCost: monthly cost is monotonic non-decreasing in seats", () => {
  const fewSeats = computeHubspotCost("enterprise", 10_000, 5, false);
  const manySeats = computeHubspotCost("enterprise", 10_000, 15, false);
  assert.ok(manySeats.monthlyCost > fewSeats.monthlyCost);
});

// ─── Klaviyo: URL-state round-trip + clamping ──────────────────────────

test("encodeKlaviyoCalcState produces the three short stable keys", () => {
  const qs = encodeKlaviyoCalcState({ profiles: 5000, smsSends: 1000, countSuppressed: true });
  const params = new URLSearchParams(qs);
  assert.equal(params.get("kp"), "5000");
  assert.equal(params.get("ks"), "1000");
  assert.equal(params.get("ku"), "1");
});

test("decodeKlaviyoCalcState round-trips values encoded by encodeKlaviyoCalcState", () => {
  const state = { profiles: 12_000, smsSends: 500, countSuppressed: false };
  const qs = encodeKlaviyoCalcState(state);
  const decoded = decodeKlaviyoCalcState(qs);
  assert.deepEqual(decoded, state);
});

test("decodeKlaviyoCalcState clamps profiles and smsSends to slider bounds", () => {
  const decoded = decodeKlaviyoCalcState("kp=99999999&ks=99999999");
  assert.equal(decoded.profiles, KLAVIYO_CALC_BOUNDS.profiles.max);
  assert.equal(decoded.smsSends, KLAVIYO_CALC_BOUNDS.smsSends.max);
});

test("decodeKlaviyoCalcState clamps below-minimum profiles up to the floor", () => {
  const decoded = decodeKlaviyoCalcState("kp=0");
  assert.equal(decoded.profiles, KLAVIYO_CALC_BOUNDS.profiles.min);
});

test("decodeKlaviyoCalcState returns empty object for an empty query string", () => {
  assert.deepEqual(decodeKlaviyoCalcState(""), {});
});

// ─── Klaviyo: interpolation math ────────────────────────────────────────

test("interpolateKlaviyoPrice matches the registry's published anchors exactly", () => {
  assert.equal(interpolateKlaviyoPrice(250), 0);
  assert.equal(interpolateKlaviyoPrice(500), 20);
  assert.equal(interpolateKlaviyoPrice(5000), 100);
  assert.equal(interpolateKlaviyoPrice(25_000), 400);
});

test("interpolateKlaviyoPrice interpolates linearly at the exact midpoint between anchors", () => {
  // Midpoint between 500 ($20) and 5000 ($100) by profile count, not necessarily by price.
  const midProfiles = (500 + 5000) / 2;
  const price = interpolateKlaviyoPrice(midProfiles);
  const expected = 20 + ((midProfiles - 500) / (5000 - 500)) * (100 - 20);
  assert.ok(Math.abs(price - expected) < 1e-9);
});

test("interpolateKlaviyoPrice is monotonic non-decreasing across the whole domain", () => {
  const samples = [250, 400, 500, 1000, 3000, 5000, 10_000, 25_000, 50_000, 100_000];
  for (let i = 1; i < samples.length; i++) {
    assert.ok(interpolateKlaviyoPrice(samples[i]) >= interpolateKlaviyoPrice(samples[i - 1]));
  }
});

test("interpolateKlaviyoPrice extrapolates above 25k using the last segment's slope", () => {
  const at25k = interpolateKlaviyoPrice(25_000);
  const above = interpolateKlaviyoPrice(50_000);
  assert.ok(above > at25k);
});

test("interpolateKlaviyoPrice returns the free-tier price below the first anchor", () => {
  assert.equal(interpolateKlaviyoPrice(100), 0);
});

// ─── Klaviyo: cost math ─────────────────────────────────────────────────

test("computeKlaviyoCost: suppressed-profile toggle adds the hedged 20% uplift", () => {
  const off = computeKlaviyoCost(5000, 0, false);
  const on = computeKlaviyoCost(5000, 0, true);
  assert.equal(on.billableProfiles, Math.round(5000 * 1.2));
  assert.equal(off.billableProfiles, 5000);
  assert.ok(on.monthlyTotal >= off.monthlyTotal);
});

test("computeKlaviyoCost: SMS cost uses the hedged per-send rate", () => {
  const result = computeKlaviyoCost(250, 1000, false);
  assert.equal(result.smsMonthly, Math.round(1000 * KLAVIYO_SMS_RATE_HEDGED * 100) / 100);
});

test("computeKlaviyoCost: zero SMS sends means zero SMS cost", () => {
  const result = computeKlaviyoCost(5000, 0, false);
  assert.equal(result.smsMonthly, 0);
});

test("computeKlaviyoCost: yearly total is exactly 12x the monthly total", () => {
  const result = computeKlaviyoCost(5000, 500, false);
  assert.equal(result.yearlyTotal, Math.round(result.monthlyTotal * 12));
});

test("computeKlaviyoCost: doubled-list monthly cost is never less than the current monthly cost", () => {
  const result = computeKlaviyoCost(5000, 200, false);
  assert.ok(result.doubledListMonthly >= result.monthlyTotal);
});

// ─── Voice AI: URL-state round-trip + clamping ─────────────────────────

test("encodeVoiceCalcState produces the four short stable keys", () => {
  const qs = encodeVoiceCalcState({ callsPerMonth: 300, avgMinutes: 4, platform: "vapi", includeTelephony: true });
  const params = new URLSearchParams(qs);
  assert.equal(params.get("vc"), "300");
  assert.equal(params.get("vm"), "4");
  assert.equal(params.get("vp"), "vapi");
  assert.equal(params.get("vt"), "1");
});

test("decodeVoiceCalcState round-trips values encoded by encodeVoiceCalcState", () => {
  const state = { callsPerMonth: 800, avgMinutes: 6.5, platform: "retell" as const, includeTelephony: false };
  const qs = encodeVoiceCalcState(state);
  const decoded = decodeVoiceCalcState(qs);
  assert.deepEqual(decoded, state);
});

test("decodeVoiceCalcState clamps callsPerMonth and avgMinutes to slider bounds", () => {
  const decoded = decodeVoiceCalcState("vc=999999999&vm=999");
  assert.equal(decoded.callsPerMonth, VOICE_CALC_BOUNDS.callsPerMonth.max);
  assert.equal(decoded.avgMinutes, VOICE_CALC_BOUNDS.avgMinutes.max);
});

test("decodeVoiceCalcState rejects an unknown platform value", () => {
  const decoded = decodeVoiceCalcState("vp=bogus");
  assert.equal(decoded.platform, undefined);
});

test("decodeVoiceCalcState accepts all four valid platform values", () => {
  assert.equal(decodeVoiceCalcState("vp=vapi").platform, "vapi");
  assert.equal(decodeVoiceCalcState("vp=retell").platform, "retell");
  assert.equal(decodeVoiceCalcState("vp=synthflow").platform, "synthflow");
  assert.equal(decodeVoiceCalcState("vp=typical").platform, "typical");
});

// ─── Voice AI: cost math ────────────────────────────────────────────────

test("computeVoiceCost: real per-minute rate is always at least the advertised rate for vapi", () => {
  const result = computeVoiceCost("vapi", 300, 4, true);
  assert.ok(result.realPerMinute > result.advertisedPerMinute);
});

test("computeVoiceCost: excluding telephony removes it from the stack and lowers the real rate", () => {
  const withTelephony = computeVoiceCost("typical", 300, 4, true);
  const withoutTelephony = computeVoiceCost("typical", 300, 4, false);
  assert.ok(withoutTelephony.realPerMinute < withTelephony.realPerMinute);
  assert.equal(withoutTelephony.stack.find((c) => c.label === "Telephony"), undefined);
  assert.ok(withTelephony.stack.find((c) => c.label === "Telephony") !== undefined);
});

test("computeVoiceCost: monthlyTotal tracks totalMinutes * realPerMinute within rounding tolerance", () => {
  // monthlyTotal is computed from the unrounded per-minute rate, then rounded;
  // realPerMinute is independently rounded to 3 decimals for display, so the
  // two can differ by a cent or two — assert they agree within $2/mo.
  const result = computeVoiceCost("retell", 500, 5, true);
  assert.equal(result.totalMinutes, 2500);
  assert.ok(Math.abs(result.monthlyTotal - 2500 * result.realPerMinute) < 2);
});

test("computeVoiceCost: totalMinutes clamps calls and minutes to bounds before multiplying", () => {
  const result = computeVoiceCost("vapi", 999_999, 999, true);
  const expectedMinutes = VOICE_CALC_BOUNDS.callsPerMonth.max * VOICE_CALC_BOUNDS.avgMinutes.max;
  assert.equal(result.totalMinutes, expectedMinutes);
});

test("computeVoiceCost: stack sums to the reported realPerMinute", () => {
  const result = computeVoiceCost("synthflow", 300, 4, true);
  const sum = result.stack.reduce((acc, c) => acc + c.perMinute, 0);
  assert.ok(Math.abs(sum - result.realPerMinute) < 1e-6);
});

test("computeVoiceCost: every platform's stack has a positive real per-minute cost", () => {
  for (const platform of ["vapi", "retell", "synthflow", "typical"] as const) {
    const result = computeVoiceCost(platform, 100, 3, true);
    assert.ok(result.realPerMinute > 0);
  }
});
