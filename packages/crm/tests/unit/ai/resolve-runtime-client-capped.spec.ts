// Per-sub-account usage meter (2026-07-08) — Task 4: the `capped` branch in
// resolveRuntimeAiClient (flag SF_USAGE_CAP_PAUSE).
//
// Spec: docs/superpowers/specs/2026-07-08-subaccount-usage-meter-design.md (D5).
// Plan: docs/superpowers/plans/2026-07-08-subaccount-usage-meter.md (Task 4).
//
// Resolution matrix (DI, no DB):
//   - own-key sub-account (mode === "byok") is NEVER paused — their key,
//     their bill, unconditionally, before the cap is even looked up.
//   - inherited-key (own resolution mode !== "byok") + cap.mode "pause" +
//     breached + SF_USAGE_CAP_PAUSE flag ON -> mode becomes "capped".
//   - flag OFF -> never capped, regardless of cap/breach state.
//   - cap.mode "notify" (not "pause") -> never capped (D5: pause is opt-in).
//   - not breached -> never capped.
//   - ANY error anywhere in the cap-lookup path -> falls through to the
//     underlying (uncapped) resolution — fail-soft, never throws.
//   - Voice runtime is untouched — this only wraps the Anthropic-facing
//     chat/agent client, exactly like the agency-key-inheritance wrapper.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveRuntimeAiClient } from "@/lib/ai/client";
import type { AIClientResolution, RuntimeAiClientDeps } from "@/lib/ai/client";

function fakeResolution(mode: AIClientResolution["mode"], provider: AIClientResolution["provider"] = "platform"): AIClientResolution {
  return {
    client: {} as AIClientResolution["client"],
    mode,
    provider,
    includedUsed: 0,
    includedLimit: Number.POSITIVE_INFINITY,
    planId: null,
  };
}

/** Minimal deps builder — agency-key-inheritance flag OFF by default (this
 *  suite is about the pause branch, not inheritance) so tests aren't cross-
 *  wired to the other feature. */
function makeDeps(over: Partial<RuntimeAiClientDeps> = {}): RuntimeAiClientDeps {
  return {
    flagOn: false,
    getAIClient: async () => fakeResolution("included"),
    getParentAgencyId: async () => null,
    resolveAgencyOrgId: async () => null,
    pauseFlagOn: false,
    isOwnByokKey: () => false,
    loadUsageCapEvaluation: async () => ({ breached: false, mode: "notify" }),
    ...over,
  };
}

describe("resolveRuntimeAiClient — the capped/pause branch (SF_USAGE_CAP_PAUSE)", () => {
  test("own BYOK key sub-account is NEVER paused, even with a breached pause cap + flag on", async () => {
    const ownByok = fakeResolution("byok", "anthropic");
    const result = await resolveRuntimeAiClient(
      { orgId: "org-1" },
      makeDeps({
        pauseFlagOn: true,
        getAIClient: async () => ownByok,
        isOwnByokKey: (r) => r.mode === "byok",
        loadUsageCapEvaluation: async () => {
          throw new Error("must not even be called for an own-key org");
        },
      }),
    );
    assert.equal(result.mode, "byok");
    assert.equal(result, ownByok);
  });

  test("inherited-key + cap.mode pause + breached + flag ON -> mode becomes capped", async () => {
    const inherited = fakeResolution("included", "platform");
    const result = await resolveRuntimeAiClient(
      { orgId: "sub-account-org" },
      makeDeps({
        pauseFlagOn: true,
        getAIClient: async () => inherited,
        isOwnByokKey: (r) => r.mode === "byok",
        loadUsageCapEvaluation: async () => ({ breached: true, mode: "pause" }),
      }),
    );
    assert.equal(result.mode, "capped");
  });

  test("flag OFF -> never capped even when breached + mode=pause", async () => {
    const inherited = fakeResolution("included", "platform");
    const result = await resolveRuntimeAiClient(
      { orgId: "sub-account-org" },
      makeDeps({
        pauseFlagOn: false,
        getAIClient: async () => inherited,
        isOwnByokKey: (r) => r.mode === "byok",
        loadUsageCapEvaluation: async () => ({ breached: true, mode: "pause" }),
      }),
    );
    assert.equal(result.mode, "included");
    assert.equal(result, inherited);
  });

  test("cap.mode is 'notify' (not 'pause') -> never capped, even when breached + flag on", async () => {
    const inherited = fakeResolution("included", "platform");
    const result = await resolveRuntimeAiClient(
      { orgId: "sub-account-org" },
      makeDeps({
        pauseFlagOn: true,
        getAIClient: async () => inherited,
        isOwnByokKey: (r) => r.mode === "byok",
        loadUsageCapEvaluation: async () => ({ breached: true, mode: "notify" }),
      }),
    );
    assert.equal(result.mode, "included");
  });

  test("not breached -> never capped", async () => {
    const inherited = fakeResolution("included", "platform");
    const result = await resolveRuntimeAiClient(
      { orgId: "sub-account-org" },
      makeDeps({
        pauseFlagOn: true,
        getAIClient: async () => inherited,
        isOwnByokKey: (r) => r.mode === "byok",
        loadUsageCapEvaluation: async () => ({ breached: false, mode: "pause" }),
      }),
    );
    assert.equal(result.mode, "included");
  });

  test("no cap set (loadUsageCapEvaluation resolves null) -> never capped", async () => {
    const inherited = fakeResolution("included", "platform");
    const result = await resolveRuntimeAiClient(
      { orgId: "sub-account-org" },
      makeDeps({
        pauseFlagOn: true,
        getAIClient: async () => inherited,
        isOwnByokKey: (r) => r.mode === "byok",
        loadUsageCapEvaluation: async () => null,
      }),
    );
    assert.equal(result.mode, "included");
  });

  test("fail-soft: loadUsageCapEvaluation throws -> falls through to the underlying resolution, never throws", async () => {
    const inherited = fakeResolution("included", "platform");
    const result = await resolveRuntimeAiClient(
      { orgId: "sub-account-org" },
      makeDeps({
        pauseFlagOn: true,
        getAIClient: async () => inherited,
        isOwnByokKey: (r) => r.mode === "byok",
        loadUsageCapEvaluation: async () => {
          throw new Error("db exploded");
        },
      }),
    );
    assert.equal(result.mode, "included");
    assert.equal(result, inherited);
  });

  test("pause check runs AFTER agency-key inheritance resolves (evaluates the FINAL resolution's org, not the sub-account's raw own-key check)", async () => {
    // Inheritance flag on: sub-account has no own key, inherits the agency's
    // BYOK key. That inherited resolution mode is "byok" -- own-key check
    // (isOwnByokKey) is about the RESOLVED client's mode, so an inherited
    // BYOK key is treated the same as an own BYOK key for pause purposes
    // (never paused -- it's a real key either way, not the platform fallback).
    const agencyByok = fakeResolution("byok", "anthropic");
    const result = await resolveRuntimeAiClient(
      { orgId: "sub-account-org" },
      makeDeps({
        flagOn: true, // agency-key-inheritance ON
        pauseFlagOn: true,
        getAIClient: async (params) =>
          params.orgId === "sub-account-org" ? fakeResolution("included", "platform") : agencyByok,
        getParentAgencyId: async () => "agency-1",
        resolveAgencyOrgId: async () => "agency-owner-org",
        isOwnByokKey: (r) => r.mode === "byok",
        loadUsageCapEvaluation: async () => {
          throw new Error("must not be called once the resolution is byok");
        },
      }),
    );
    assert.equal(result.mode, "byok");
  });
});
