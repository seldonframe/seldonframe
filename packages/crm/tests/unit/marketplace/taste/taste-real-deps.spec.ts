import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTasteDeps, resolveTastePolicyForAgent } from "../../../../src/lib/marketplace/taste/taste-real-deps";
import type { RentalAgent } from "../../../../src/lib/marketplace/agent-rental-run";

const req = (ip?: string) => ({
  headers: { get: (n: string) => (n === "x-forwarded-for" && ip ? `${ip}, 10.0.0.1` : null) },
});

describe("buildTasteDeps flag gating", () => {
  it("returns undefined when the flag is off — the route-level inertness switch", () => {
    assert.equal(buildTasteDeps({ request: req("1.2.3.4"), env: {} }), undefined);
    assert.equal(buildTasteDeps({ request: req("1.2.3.4"), env: { SF_AGENT_TASTE_MODE: "0" } }), undefined);
  });
  it("builds deps when flag=1, with a hashed (non-raw) ip", () => {
    // getRentalSigningSecret() reads process.env directly (no params), so the
    // real resolver is overridden via the secretResolver DI seam rather than
    // relying on this test's `env` object being threaded into it.
    const deps = buildTasteDeps({
      request: req("1.2.3.4"),
      env: { SF_AGENT_TASTE_MODE: "1" },
      secretResolver: () => "test-secret-at-least-16-chars",
    });
    assert.ok(deps);
    assert.ok(!deps!.ipHash.includes("1.2.3.4"));
    assert.match(deps!.ipHash, /^[0-9a-f]{32}$/);
  });
  it("flag on but no resolvable secret => undefined (taste disabled, no throw)", () => {
    const deps = buildTasteDeps({
      request: req("1.2.3.4"),
      env: { SF_AGENT_TASTE_MODE: "1" },
      secretResolver: () => {
        throw new Error("No rental signing secret available.");
      },
    });
    assert.equal(deps, undefined);
  });
});

describe("resolveTastePolicyForAgent", () => {
  const agent = (prefs: unknown, creatorOrgId = "seller") =>
    ({ creatorOrgId, sellerPreferences: prefs } as unknown as RentalAgent);

  it("inactive when seller opted out (0 visitor calls)", async () => {
    const policy = await resolveTastePolicyForAgent(agent({ tasteCallsPerVisitor: 0 }), {
      keyStatus: async () => ({ hasKey: true, mode: "byok", provider: "anthropic" }),
      flagshipOrgIds: new Set(),
    });
    assert.deepEqual(policy, { active: false });
  });

  it("inactive for a platform-fallback non-flagship seller", async () => {
    const policy = await resolveTastePolicyForAgent(agent(null), {
      keyStatus: async () => ({ hasKey: true, mode: "platform", provider: null }),
      flagshipOrgIds: new Set(),
    });
    assert.deepEqual(policy, { active: false });
  });

  it("ACTIVE for a platform-fallback FLAGSHIP seller", async () => {
    const policy = await resolveTastePolicyForAgent(agent(null, "sf-org"), {
      keyStatus: async () => ({ hasKey: true, mode: "platform", provider: null }),
      flagshipOrgIds: new Set(["sf-org"]),
    });
    assert.deepEqual(policy, { active: true, visitorLimit: 3, dailyCap: 50 });
  });

  it("inactive for an openai-only BYOK seller (no Anthropic client possible)", async () => {
    const policy = await resolveTastePolicyForAgent(agent(null), {
      keyStatus: async () => ({ hasKey: true, mode: "byok", provider: "openai" }),
      flagshipOrgIds: new Set(),
    });
    assert.deepEqual(policy, { active: false });
  });

  it("active with seller budget applied for anthropic BYOK", async () => {
    const policy = await resolveTastePolicyForAgent(agent({ tasteCallsPerVisitor: 7, tasteDailyCap: 100 }), {
      keyStatus: async () => ({ hasKey: true, mode: "byok", provider: "anthropic" }),
      flagshipOrgIds: new Set(),
    });
    assert.deepEqual(policy, { active: true, visitorLimit: 7, dailyCap: 100 });
  });
});
