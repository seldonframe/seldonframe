// A6 — tests for resolveVoiceContextByNumber (TDD).
//
// All deps injected — no DB, no env.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveVoiceContextByNumber,
} from "../../../../src/lib/agents/voice/voice-workspace";

const STABLE_CONV_ID = "conv-stable-uuid-123";
const STABLE_AGENT_ID = "agent-voice-abc";
const STABLE_ORG_ID = "org-xyz-111";
const STABLE_ORG_SLUG = "acme-hvac";

const fixedConvId = () => STABLE_CONV_ID;

describe("resolveVoiceContextByNumber", () => {
  test("(a) dialed number resolves → resolvedBy='number', ctx has right orgId/orgSlug/agentId and testMode:false", async () => {
    const result = await resolveVoiceContextByNumber({
      dialedNumber: "+15550001111",
      deps: {
        resolveOrgIdByNumber: async (n) => (n === "+15550001111" ? STABLE_ORG_ID : null),
        lookupOrgSlug: async (orgId) => (orgId === STABLE_ORG_ID ? STABLE_ORG_SLUG : null),
        getVoiceAgentId: async (orgId) => (orgId === STABLE_ORG_ID ? STABLE_AGENT_ID : "fallback"),
        generateConversationId: fixedConvId,
        envFallback: async () => {
          throw new Error("should not be called when number resolves");
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.resolvedBy, "number");
    if (result.ok) {
      assert.equal(result.ctx.orgId, STABLE_ORG_ID);
      assert.equal(result.ctx.orgSlug, STABLE_ORG_SLUG);
      assert.equal(result.ctx.agentId, STABLE_AGENT_ID);
      assert.equal(result.ctx.conversationId, STABLE_CONV_ID);
      assert.equal(result.ctx.testMode, false);
    }
  });

  test("(b) dialedNumber is null → falls back to env, resolvedBy='env_fallback' when envFallback ok", async () => {
    const result = await resolveVoiceContextByNumber({
      dialedNumber: null,
      deps: {
        resolveOrgIdByNumber: async () => {
          throw new Error("should not be called when dialedNumber is null");
        },
        lookupOrgSlug: async () => null,
        getVoiceAgentId: async () => "should-not-matter",
        generateConversationId: fixedConvId,
        envFallback: async () => ({
          ok: true,
          ctx: {
            orgId: STABLE_ORG_ID,
            orgSlug: STABLE_ORG_SLUG,
            agentId: STABLE_AGENT_ID,
            conversationId: STABLE_CONV_ID,
            testMode: false,
          },
        }),
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.resolvedBy, "env_fallback");
    if (result.ok) {
      assert.equal(result.ctx.orgId, STABLE_ORG_ID);
    }
  });

  test("(c) number misses AND env fallback {ok:false} → resolvedBy='none', ok:false", async () => {
    const result = await resolveVoiceContextByNumber({
      dialedNumber: "+19995550000",
      deps: {
        resolveOrgIdByNumber: async () => null, // number not found
        lookupOrgSlug: async () => null,
        getVoiceAgentId: async () => "should-not-matter",
        generateConversationId: fixedConvId,
        envFallback: async () => ({
          ok: false,
          reason: "no_slug_configured" as const,
          slug: null,
        }),
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.resolvedBy, "none");
  });
});
