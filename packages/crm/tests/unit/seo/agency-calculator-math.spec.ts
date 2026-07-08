import { test } from "node:test";
import assert from "node:assert/strict";

import {
  encodeGhlCostState,
  decodeGhlCostState,
  GHL_COST_BOUNDS,
} from "@/components/seo/result-card";

import {
  ghlPlanBase,
  ghlAiEmployeeRatePerClient,
  ghlUsageCostPerClient,
  ghlTotalMonthlyCost,
  ghlCostCurve,
  HEDGED_USAGE_RATES,
} from "@/components/seo/gohighlevel-cost-calculator";

import {
  encodeAgencyMarginState,
  decodeAgencyMarginState,
  AGENCY_MARGIN_BOUNDS,
} from "@/components/seo/result-card";

import {
  agencyMargin,
  stackPresetCostPerClient,
  marginByPreset,
  STACK_PRESETS,
} from "@/components/seo/agency-margin-calculator";

// ─── GoHighLevel cost calculator: URL state ─────────────────────────────

test("encodeGhlCostState produces the six short stable keys", () => {
  const qs = encodeGhlCostState({ clients: 10, plan: "unlimited", aiEmployeeOn: true, smsPerClient: 200, emailPerClient: 1000, voiceMinPerClient: 100 });
  const params = new URLSearchParams(qs);
  assert.equal(params.get("gc"), "10");
  assert.equal(params.get("gp"), "unlimited");
  assert.equal(params.get("ge"), "1");
  assert.equal(params.get("gs"), "200");
  assert.equal(params.get("gm"), "1000");
  assert.equal(params.get("gv"), "100");
});

test("decodeGhlCostState round-trips values encoded by encodeGhlCostState", () => {
  const state = { clients: 25, plan: "agencyPro" as const, aiEmployeeOn: false, smsPerClient: 500, emailPerClient: 5000, voiceMinPerClient: 300 };
  const qs = encodeGhlCostState(state);
  const decoded = decodeGhlCostState(qs);
  assert.deepEqual(decoded, state);
});

test("decodeGhlCostState clamps numeric fields to bounds", () => {
  const decoded = decodeGhlCostState("gc=9999&gs=99999&gm=999999&gv=99999");
  assert.equal(decoded.clients, GHL_COST_BOUNDS.clients.max);
  assert.equal(decoded.smsPerClient, GHL_COST_BOUNDS.smsPerClient.max);
  assert.equal(decoded.emailPerClient, GHL_COST_BOUNDS.emailPerClient.max);
  assert.equal(decoded.voiceMinPerClient, GHL_COST_BOUNDS.voiceMinPerClient.max);
});

test("decodeGhlCostState ignores an invalid plan value", () => {
  const decoded = decodeGhlCostState("gp=nonsense");
  assert.equal(decoded.plan, undefined);
});

test("decodeGhlCostState ignores an invalid aiEmployeeOn value", () => {
  const decoded = decodeGhlCostState("ge=maybe");
  assert.equal(decoded.aiEmployeeOn, undefined);
});

test("decodeGhlCostState returns an empty object for an empty query string", () => {
  assert.deepEqual(decodeGhlCostState(""), {});
});

// ─── GoHighLevel cost calculator: math ──────────────────────────────────

test("ghlPlanBase returns the registry's published plan prices", () => {
  assert.equal(ghlPlanBase("starter"), 97);
  assert.equal(ghlPlanBase("unlimited"), 297);
  assert.equal(ghlPlanBase("agencyPro"), 497);
});

test("ghlAiEmployeeRatePerClient is plan-dependent: $50 on Starter, $97 on Unlimited+", () => {
  assert.equal(ghlAiEmployeeRatePerClient("starter"), 50);
  assert.equal(ghlAiEmployeeRatePerClient("unlimited"), 97);
  assert.equal(ghlAiEmployeeRatePerClient("agencyPro"), 97);
});

test("ghlUsageCostPerClient sums SMS + email + voice at the hedged rates", () => {
  const cost = ghlUsageCostPerClient(100, 1000, 50);
  const expected = 100 * HEDGED_USAGE_RATES.smsPerSegment + 1000 * HEDGED_USAGE_RATES.emailPerSend + 50 * HEDGED_USAGE_RATES.voicePerMinute;
  assert.equal(cost, expected);
});

test("ghlUsageCostPerClient is zero when all usage inputs are zero", () => {
  assert.equal(ghlUsageCostPerClient(0, 0, 0), 0);
});

test("ghlTotalMonthlyCost stacks the AI Employee add-on per client (Starter)", () => {
  const result = ghlTotalMonthlyCost({ plan: "starter", clients: 5, aiEmployeeOn: true, smsPerClient: 0, emailPerClient: 0, voiceMinPerClient: 0 });
  assert.equal(result.base, 97);
  assert.equal(result.aiStack, 50 * 5);
  assert.equal(result.usage, 0);
  assert.equal(result.total, 97 + 250);
  assert.equal(result.perClient, (97 + 250) / 5);
});

test("ghlTotalMonthlyCost stacks the AI Employee add-on per client (Unlimited)", () => {
  const result = ghlTotalMonthlyCost({ plan: "unlimited", clients: 10, aiEmployeeOn: true, smsPerClient: 0, emailPerClient: 0, voiceMinPerClient: 0 });
  assert.equal(result.aiStack, 97 * 10);
  assert.equal(result.total, 297 + 970);
});

test("ghlTotalMonthlyCost omits the AI Employee stack when the toggle is off", () => {
  const result = ghlTotalMonthlyCost({ plan: "unlimited", clients: 10, aiEmployeeOn: false, smsPerClient: 0, emailPerClient: 0, voiceMinPerClient: 0 });
  assert.equal(result.aiStack, 0);
  assert.equal(result.total, 297);
});

test("ghlTotalMonthlyCost stacks usage cost per client, not once", () => {
  const result = ghlTotalMonthlyCost({ plan: "starter", clients: 4, aiEmployeeOn: false, smsPerClient: 100, emailPerClient: 0, voiceMinPerClient: 0 });
  const perClientUsage = ghlUsageCostPerClient(100, 0, 0);
  assert.equal(result.usage, perClientUsage * 4);
});

test("ghlTotalMonthlyCost at 1 client: perClient equals total", () => {
  const result = ghlTotalMonthlyCost({ plan: "starter", clients: 1, aiEmployeeOn: true, smsPerClient: 0, emailPerClient: 0, voiceMinPerClient: 0 });
  assert.equal(result.perClient, result.total);
});

test("ghlTotalMonthlyCost at 0 clients does not divide by zero (perClient falls back to total)", () => {
  const result = ghlTotalMonthlyCost({ plan: "starter", clients: 0, aiEmployeeOn: true, smsPerClient: 0, emailPerClient: 0, voiceMinPerClient: 0 });
  assert.equal(result.perClient, result.total);
  assert.equal(Number.isFinite(result.perClient), true);
});

test("ghlCostCurve returns totals at exactly 1, 5, 10, 25 clients, increasing with client count", () => {
  const curve = ghlCostCurve({ plan: "unlimited", aiEmployeeOn: true, smsPerClient: 50, emailPerClient: 200, voiceMinPerClient: 20 });
  assert.deepEqual(curve.map((c) => c.clients), [1, 5, 10, 25]);
  for (let i = 1; i < curve.length; i++) {
    assert.ok(curve[i].total > curve[i - 1].total, `total should increase from ${curve[i - 1].clients} to ${curve[i].clients} clients`);
  }
});

// ─── Agency margin calculator: URL state ────────────────────────────────

test("encodeAgencyMarginState produces the five short stable keys", () => {
  const qs = encodeAgencyMarginState({ retainer: 500, clients: 10, stackCostPerClient: 150, hoursPerClient: 3, hourlyRate: 40 });
  const params = new URLSearchParams(qs);
  assert.equal(params.get("mr"), "500");
  assert.equal(params.get("mn"), "10");
  assert.equal(params.get("ms"), "150");
  assert.equal(params.get("mh"), "3");
  assert.equal(params.get("mw"), "40");
});

test("decodeAgencyMarginState round-trips values encoded by encodeAgencyMarginState", () => {
  const state = { retainer: 750, clients: 20, stackCostPerClient: 80, hoursPerClient: 2.5, hourlyRate: 60 };
  const qs = encodeAgencyMarginState(state);
  const decoded = decodeAgencyMarginState(qs);
  assert.deepEqual(decoded, state);
});

test("decodeAgencyMarginState clamps every field to its bounds", () => {
  const decoded = decodeAgencyMarginState("mr=99999&mn=-5&ms=99999&mh=-1&mw=99999");
  assert.equal(decoded.retainer, AGENCY_MARGIN_BOUNDS.retainer.max);
  assert.equal(decoded.clients, AGENCY_MARGIN_BOUNDS.clients.min);
  assert.equal(decoded.stackCostPerClient, AGENCY_MARGIN_BOUNDS.stackCostPerClient.max);
  assert.equal(decoded.hoursPerClient, AGENCY_MARGIN_BOUNDS.hoursPerClient.min);
  assert.equal(decoded.hourlyRate, AGENCY_MARGIN_BOUNDS.hourlyRate.max);
});

test("decodeAgencyMarginState returns an empty object for an empty query string", () => {
  assert.deepEqual(decodeAgencyMarginState(""), {});
});

// ─── Agency margin calculator: math ─────────────────────────────────────

test("agencyMargin computes revenue as retainer times clients", () => {
  const result = agencyMargin({ retainer: 500, clients: 10, stackCostPerClient: 0, hoursPerClient: 0, hourlyRate: 0 });
  assert.equal(result.revenue, 5000);
  assert.equal(result.profit, 5000);
  assert.equal(result.marginPct, 100);
});

test("agencyMargin subtracts tool-stack cost stacked per client", () => {
  const result = agencyMargin({ retainer: 500, clients: 10, stackCostPerClient: 150, hoursPerClient: 0, hourlyRate: 0 });
  assert.equal(result.toolCost, 1500);
  assert.equal(result.profit, 5000 - 1500);
});

test("agencyMargin subtracts labor cost as hours times rate times clients", () => {
  const result = agencyMargin({ retainer: 500, clients: 10, stackCostPerClient: 0, hoursPerClient: 3, hourlyRate: 40 });
  assert.equal(result.laborCost, 3 * 40 * 10);
  assert.equal(result.profit, 5000 - 1200);
});

test("agencyMargin handles the negative-margin case (retainer loses money)", () => {
  const result = agencyMargin({ retainer: 100, clients: 5, stackCostPerClient: 150, hoursPerClient: 5, hourlyRate: 40 });
  assert.ok(result.profit < 0, "profit should be negative");
  assert.ok(result.marginPct < 0, "margin should be negative");
  // revenue 500, toolCost 750, laborCost 1000 -> profit -1250, margin -250%
  assert.equal(result.revenue, 500);
  assert.equal(result.toolCost, 750);
  assert.equal(result.laborCost, 1000);
  assert.equal(result.profit, -1250);
  assert.equal(result.marginPct, -250);
});

test("agencyMargin returns marginPct of 0 (not NaN) when revenue is 0", () => {
  const result = agencyMargin({ retainer: 0, clients: 0, stackCostPerClient: 0, hoursPerClient: 0, hourlyRate: 0 });
  assert.equal(result.revenue, 0);
  assert.equal(result.marginPct, 0);
  assert.equal(Number.isNaN(result.marginPct), false);
});

test("agencyMargin clamps negative client counts to zero rather than flipping sign", () => {
  const result = agencyMargin({ retainer: 500, clients: -5, stackCostPerClient: 0, hoursPerClient: 0, hourlyRate: 0 });
  assert.equal(result.revenue, 0);
});

test("stackPresetCostPerClient: ghlStyle and typicalSaas are flat regardless of client count", () => {
  assert.equal(stackPresetCostPerClient("ghlStyle", 1), 150);
  assert.equal(stackPresetCostPerClient("ghlStyle", 50), 150);
  assert.equal(stackPresetCostPerClient("typicalSaas", 1), 80);
  assert.equal(stackPresetCostPerClient("typicalSaas", 50), 80);
});

test("stackPresetCostPerClient: seldonframe shrinks per-client cost as clients grow", () => {
  const at1 = stackPresetCostPerClient("seldonframe", 1);
  const at10 = stackPresetCostPerClient("seldonframe", 10);
  const at50 = stackPresetCostPerClient("seldonframe", 50);
  assert.ok(at1 > at10, "cost per client should shrink from 1 to 10 clients");
  assert.ok(at10 > at50, "cost per client should shrink from 10 to 50 clients");
  assert.ok(at1 >= 3 && at1 <= 34, "seldonframe preset should land in the ~$3-10 amortized + usage range at low client counts");
});

test("stackPresetCostPerClient: seldonframe clamps clients to at least 1 (no divide-by-zero)", () => {
  const at0 = stackPresetCostPerClient("seldonframe", 0);
  assert.equal(Number.isFinite(at0), true);
  assert.equal(at0, stackPresetCostPerClient("seldonframe", 1));
});

test("marginByPreset returns one result per STACK_PRESETS entry, in order", () => {
  const scenarios = marginByPreset({ retainer: 500, clients: 10, hoursPerClient: 3, hourlyRate: 40 });
  assert.equal(scenarios.length, STACK_PRESETS.length);
  assert.deepEqual(scenarios.map((s) => s.preset.key), STACK_PRESETS.map((p) => p.key));
});

test("marginByPreset: the seldonframe scenario has the highest profit of the three at the same retainer", () => {
  const scenarios = marginByPreset({ retainer: 500, clients: 10, hoursPerClient: 3, hourlyRate: 40 });
  const byKey = Object.fromEntries(scenarios.map((s) => [s.preset.key, s.result.profit]));
  assert.ok(byKey.seldonframe > byKey.ghlStyle, "seldonframe profit should exceed ghlStyle profit");
  assert.ok(byKey.seldonframe > byKey.typicalSaas, "seldonframe profit should exceed typicalSaas profit");
});

test("marginByPreset: a low retainer against the ghlStyle stack can produce a negative-margin scenario", () => {
  const scenarios = marginByPreset({ retainer: 100, clients: 5, hoursPerClient: 5, hourlyRate: 40 });
  const ghl = scenarios.find((s) => s.preset.key === "ghlStyle");
  assert.ok(ghl);
  assert.ok(ghl!.result.profit < 0, "ghlStyle scenario should lose money at a $100 retainer with heavy labor");
});
