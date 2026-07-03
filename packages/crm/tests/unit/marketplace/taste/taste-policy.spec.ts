import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isTasteFlagOn,
  parseFlagshipOrgIds,
  resolveTasteBudget,
  hashTasteIp,
  buildTasteDoorsText,
  buildTasteInstructions,
  TASTE_MODEL,
  TASTE_MAX_TOKENS,
  TASTE_SESSION_TTL_MS,
  TASTE_GROUNDING_MAX_BYTES,
  TASTE_CAPABILITY_ALLOWLIST,
  TASTE_TOOL_ALLOWLIST,
} from "../../../../src/lib/marketplace/taste/taste-policy";

describe("taste-policy constants", () => {
  it("pins the locked values", () => {
    assert.equal(TASTE_MODEL, "claude-3-5-haiku-20241022");
    assert.equal(TASTE_MAX_TOKENS, 400);
    assert.equal(TASTE_SESSION_TTL_MS, 3_600_000);
    assert.equal(TASTE_GROUNDING_MAX_BYTES, 8192);
    assert.deepEqual(TASTE_CAPABILITY_ALLOWLIST, ["provide_faq_answer", "get_quote_range"]);
    assert.deepEqual(
      [...TASTE_TOOL_ALLOWLIST].sort(),
      ["ask", "get_quote_range", "ground_on_my_business", "provide_faq_answer"],
    );
  });
});

describe("isTasteFlagOn", () => {
  it("is on only for exactly '1' (trimmed)", () => {
    assert.equal(isTasteFlagOn({ SF_AGENT_TASTE_MODE: "1" }), true);
    assert.equal(isTasteFlagOn({ SF_AGENT_TASTE_MODE: " 1 " }), true);
    assert.equal(isTasteFlagOn({ SF_AGENT_TASTE_MODE: "true" }), false);
    assert.equal(isTasteFlagOn({ SF_AGENT_TASTE_MODE: "" }), false);
    assert.equal(isTasteFlagOn({}), false);
  });
});

describe("parseFlagshipOrgIds", () => {
  it("splits, trims, drops empties", () => {
    assert.deepEqual(
      parseFlagshipOrgIds({ SF_FLAGSHIP_ORG_IDS: "a, b ,,c" }),
      new Set(["a", "b", "c"]),
    );
    assert.deepEqual(parseFlagshipOrgIds({}), new Set());
  });
});

describe("resolveTasteBudget", () => {
  it("defaults 3/visitor, 50/day when prefs absent", () => {
    assert.deepEqual(resolveTasteBudget(null), { visitorLimit: 3, dailyCap: 50, optedOut: false });
    assert.deepEqual(resolveTasteBudget(undefined), { visitorLimit: 3, dailyCap: 50, optedOut: false });
  });
  it("clamps to platform ceilings [0,10] and [0,500]", () => {
    assert.deepEqual(
      resolveTasteBudget({ tasteCallsPerVisitor: 99, tasteDailyCap: 9999 }),
      { visitorLimit: 10, dailyCap: 500, optedOut: false },
    );
    assert.deepEqual(
      resolveTasteBudget({ tasteCallsPerVisitor: -5, tasteDailyCap: -1 }),
      { visitorLimit: 0, dailyCap: 0, optedOut: true },
    );
  });
  it("zero visitor calls means opted out", () => {
    assert.equal(resolveTasteBudget({ tasteCallsPerVisitor: 0 }).optedOut, true);
  });
  it("ignores non-finite garbage", () => {
    assert.deepEqual(
      resolveTasteBudget({ tasteCallsPerVisitor: Number.NaN, tasteDailyCap: Infinity }),
      { visitorLimit: 3, dailyCap: 500, optedOut: false },
    );
  });
});

describe("hashTasteIp", () => {
  it("is deterministic, 32 hex chars, never the raw ip", () => {
    const h = hashTasteIp("203.0.113.9", "secret");
    assert.equal(h, hashTasteIp("203.0.113.9", "secret"));
    assert.match(h, /^[0-9a-f]{32}$/);
    assert.notEqual(hashTasteIp("203.0.113.9", "other"), h);
    assert.ok(!h.includes("203.0.113.9"));
  });
});

describe("doors + instructions copy", () => {
  it("doors carry the three real URLs and the agent name", () => {
    const text = buildTasteDoorsText({
      agentName: "HVAC Receptionist",
      slug: "hvac-receptionist",
      visitorLimit: 3,
      reason: "visitor_cap",
      env: {},
    });
    assert.ok(text.includes("https://seldonframe.com/build"));
    assert.ok(text.includes("https://app.seldonframe.com/marketplace/hvac-receptionist"));
    assert.ok(text.includes("HVAC Receptionist"));
    assert.ok(text.includes("3 free taste calls"));
  });
  it("locked_tool reason swaps the first line", () => {
    const text = buildTasteDoorsText({
      agentName: "A", slug: "a", visitorLimit: 3, reason: "locked_tool", env: {},
    });
    assert.ok(text.includes("needs a real rental key"));
  });
  it("fork door honors NEXT_PUBLIC_APP_URL", () => {
    const text = buildTasteDoorsText({
      agentName: "A", slug: "a", visitorLimit: 3, reason: "daily_cap",
      env: { NEXT_PUBLIC_APP_URL: "https://staging.example.com/" },
    });
    assert.ok(text.includes("https://staging.example.com/marketplace/a"));
  });
  it("instructions advertise the budget and ground-first", () => {
    const s = buildTasteInstructions({ agentName: "A", capabilities: [], visitorLimit: 5 });
    assert.ok(s.includes("5 free"));
    assert.ok(s.includes("ground_on_my_business"));
  });
});
