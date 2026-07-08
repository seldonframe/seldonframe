// 2026-07-08 pricing ladder — agency key inheritance (flag
// SF_AGENCY_KEY_INHERIT). resolveRuntimeAiClient wraps getAIClient:
// resolution order is
//   1. org's own BYOK key (unchanged — always wins),
//   2. NEW: if flag on + parentAgencyId set -> the agency owner org's
//      BYOK key,
//   3. platform env fallback (unchanged safety net).
// Fail-soft: ANY error in the inheritance path falls through to
// getAIClient's ordinary behavior — this wrapper must never throw.
// DI fakes throughout (no DB, no live keys) — mirrors the
// enforceWorkspaceLimit / hasFeature dependency-injection pattern.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveRuntimeAiClient, resolveAgencyKeyOrgId } from "@/lib/ai/client";
import type { AIClientResolution } from "@/lib/ai/client";

function fakeResolution(mode: AIClientResolution["mode"], provider: AIClientResolution["provider"]): AIClientResolution {
  return {
    client: provider === "openai" ? null : ({} as AIClientResolution["client"]),
    mode,
    provider,
    includedUsed: 0,
    includedLimit: Number.POSITIVE_INFINITY,
    planId: null,
  };
}

describe("resolveAgencyKeyOrgId", () => {
  test("prefers ownerWorkspaceId when set", async () => {
    const orgId = await resolveAgencyKeyOrgId("agency-1", {
      getPartnerAgencyOwner: async () => ({ ownerWorkspaceId: "ws-owner", ownerUserId: null }),
      getUserOrgId: async () => "should-not-be-called",
    });
    assert.equal(orgId, "ws-owner");
  });

  test("falls back to ownerUserId -> users.orgId when ownerWorkspaceId is null", async () => {
    const orgId = await resolveAgencyKeyOrgId("agency-1", {
      getPartnerAgencyOwner: async () => ({ ownerWorkspaceId: null, ownerUserId: "user-1" }),
      getUserOrgId: async (userId) => (userId === "user-1" ? "user-1-org" : null),
    });
    assert.equal(orgId, "user-1-org");
  });

  test("returns null when neither identity resolves an org", async () => {
    const orgId = await resolveAgencyKeyOrgId("agency-1", {
      getPartnerAgencyOwner: async () => ({ ownerWorkspaceId: null, ownerUserId: null }),
      getUserOrgId: async () => null,
    });
    assert.equal(orgId, null);
  });

  test("returns null when the agency row doesn't exist", async () => {
    const orgId = await resolveAgencyKeyOrgId("missing-agency", {
      getPartnerAgencyOwner: async () => null,
      getUserOrgId: async () => null,
    });
    assert.equal(orgId, null);
  });

  test("fail-soft: a throwing lookup resolves to null, never throws", async () => {
    const orgId = await resolveAgencyKeyOrgId("agency-1", {
      getPartnerAgencyOwner: async () => {
        throw new Error("db exploded");
      },
      getUserOrgId: async () => null,
    });
    assert.equal(orgId, null);
  });
});

describe("resolveRuntimeAiClient — resolution order", () => {
  test("own BYOK key always wins, even with a parentAgencyId + flag on", async () => {
    const ownByok = fakeResolution("byok", "anthropic");
    const result = await resolveRuntimeAiClient(
      { orgId: "org-1" },
      {
        flagOn: true,
        getAIClient: async (params) => {
          assert.equal(params.orgId, "org-1");
          return ownByok;
        },
        getParentAgencyId: async () => "agency-1",
        resolveAgencyOrgId: async () => "agency-owner-org",
      },
    );
    assert.equal(result, ownByok);
  });

  test("flag OFF: never checks parentAgencyId, falls straight through to getAIClient's own result", async () => {
    const platform = fakeResolution("included", "platform");
    let agencyLookupCalled = false;
    const result = await resolveRuntimeAiClient(
      { orgId: "org-1" },
      {
        flagOn: false,
        getAIClient: async () => platform,
        getParentAgencyId: async () => {
          agencyLookupCalled = true;
          return "agency-1";
        },
        resolveAgencyOrgId: async () => "agency-owner-org",
      },
    );
    assert.equal(result, platform);
    assert.equal(agencyLookupCalled, false);
  });

  test("flag ON + parentAgencyId set + no own BYOK: inherits the agency owner org's BYOK key", async () => {
    const noOwnKey = fakeResolution("included", "platform");
    const agencyByok = fakeResolution("byok", "anthropic");
    const result = await resolveRuntimeAiClient(
      { orgId: "sub-account-org" },
      {
        flagOn: true,
        getAIClient: async (params) =>
          params.orgId === "sub-account-org" ? noOwnKey : agencyByok,
        getParentAgencyId: async (orgId) => (orgId === "sub-account-org" ? "agency-1" : null),
        resolveAgencyOrgId: async (agencyId) => (agencyId === "agency-1" ? "agency-owner-org" : null),
      },
    );
    assert.equal(result, agencyByok);
  });

  test("flag ON but no parentAgencyId: falls through to platform fallback (today's behavior)", async () => {
    const platform = fakeResolution("included", "platform");
    const result = await resolveRuntimeAiClient(
      { orgId: "org-1" },
      {
        flagOn: true,
        getAIClient: async () => platform,
        getParentAgencyId: async () => null,
        resolveAgencyOrgId: async () => {
          throw new Error("should never be called when parentAgencyId is null");
        },
      },
    );
    assert.equal(result, platform);
  });

  test("flag ON + parentAgencyId set + agency owner ALSO has no BYOK key: falls through to platform fallback", async () => {
    const noOwnKey = fakeResolution("included", "platform");
    const result = await resolveRuntimeAiClient(
      { orgId: "sub-account-org" },
      {
        flagOn: true,
        getAIClient: async () => noOwnKey,
        getParentAgencyId: async () => "agency-1",
        resolveAgencyOrgId: async () => "agency-owner-org",
      },
    );
    assert.equal(result, noOwnKey);
  });

  test("fail-soft: getParentAgencyId throws -> falls through to getAIClient's own result, never throws", async () => {
    const own = fakeResolution("included", "platform");
    const result = await resolveRuntimeAiClient(
      { orgId: "org-1" },
      {
        flagOn: true,
        getAIClient: async () => own,
        getParentAgencyId: async () => {
          throw new Error("db exploded");
        },
        resolveAgencyOrgId: async () => "agency-owner-org",
      },
    );
    assert.equal(result, own);
  });

  test("fail-soft: resolveAgencyOrgId throws -> falls through to getAIClient's own result, never throws", async () => {
    const own = fakeResolution("included", "platform");
    const result = await resolveRuntimeAiClient(
      { orgId: "org-1" },
      {
        flagOn: true,
        getAIClient: async () => own,
        getParentAgencyId: async () => "agency-1",
        resolveAgencyOrgId: async () => {
          throw new Error("db exploded");
        },
      },
    );
    assert.equal(result, own);
  });

  test("fail-soft: the agency-key getAIClient call throws -> falls through to own result, never throws", async () => {
    const own = fakeResolution("included", "platform");
    const result = await resolveRuntimeAiClient(
      { orgId: "sub-account-org" },
      {
        flagOn: true,
        getAIClient: async (params) => {
          if (params.orgId === "sub-account-org") return own;
          throw new Error("db exploded");
        },
        getParentAgencyId: async () => "agency-1",
        resolveAgencyOrgId: async () => "agency-owner-org",
      },
    );
    assert.equal(result, own);
  });
});
