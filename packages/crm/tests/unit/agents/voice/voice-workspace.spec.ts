// Phase 1 voice — tests for resolvePhase1VoiceContext (voice-workspace.ts).
//
// DI over drizzle-chain mocking (repo convention): the resolver takes injectable
// lookupOrgBySlug / lookupAgentId, so we exercise the no-slug / org-not-found
// branches and the agentId fallback chain (website-chatbot → any agent → orgId
// placeholder) without a real Postgres. We always pass an explicit `slug` so the
// test never depends on process.env.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  resolvePhase1VoiceContext,
  type VoiceOrg,
} from "../../../../src/lib/agents/voice/voice-workspace";

const STABLE_CONV_ID = "conv-fixed-uuid";
const fixedConvId = () => STABLE_CONV_ID;

describe("resolvePhase1VoiceContext — configuration guards", () => {
  test("no slug configured → { ok:false, reason:'no_slug_configured' }", async () => {
    const result = await resolvePhase1VoiceContext({
      slug: undefined,
      lookupOrgBySlug: async () => {
        throw new Error("should not be called when slug is missing");
      },
      lookupAgentId: async () => null,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "no_slug_configured");
      assert.equal(result.slug, null);
    }
  });

  test("blank/whitespace slug is treated as unconfigured", async () => {
    const result = await resolvePhase1VoiceContext({
      slug: "   ",
      lookupOrgBySlug: async () => {
        throw new Error("should not be called");
      },
      lookupAgentId: async () => null,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "no_slug_configured");
  });

  test("slug doesn't match a workspace → { ok:false, reason:'org_not_found', slug }", async () => {
    const result = await resolvePhase1VoiceContext({
      slug: "ghost-workspace",
      lookupOrgBySlug: async () => null,
      lookupAgentId: async () => null,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "org_not_found");
      assert.equal(result.slug, "ghost-workspace");
    }
  });
});

describe("resolvePhase1VoiceContext — context shape + agentId fallback", () => {
  const org: VoiceOrg = { id: "org-123", slug: "spark-heating-cooling" };

  test("happy path → ctx with orgId/orgSlug, agentId, testMode:false", async () => {
    const result = await resolvePhase1VoiceContext({
      slug: "spark-heating-cooling",
      lookupOrgBySlug: async (s) => (s === org.slug ? org : null),
      lookupAgentId: async () => "agent-web-chat",
      generateConversationId: fixedConvId,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.ctx, {
        orgId: "org-123",
        orgSlug: "spark-heating-cooling",
        agentId: "agent-web-chat",
        conversationId: STABLE_CONV_ID,
        testMode: false, // REAL booking — Phase 1 payoff
      });
    }
  });

  test("trims the slug before lookup", async () => {
    let received: string | null = null;
    const result = await resolvePhase1VoiceContext({
      slug: "  spark-heating-cooling  ",
      lookupOrgBySlug: async (s) => {
        received = s;
        return org;
      },
      lookupAgentId: async () => "agent-x",
      generateConversationId: fixedConvId,
    });
    assert.equal(received, "spark-heating-cooling");
    assert.equal(result.ok, true);
  });

  test("no agent for the org → orgId is used as the placeholder agentId", async () => {
    const result = await resolvePhase1VoiceContext({
      slug: org.slug,
      lookupOrgBySlug: async () => org,
      lookupAgentId: async () => null, // no website-chatbot, no any-agent
      generateConversationId: fixedConvId,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(
        result.ctx.agentId,
        org.id,
        "agentId falls back to orgId when the org has no agent rows",
      );
    }
  });

  test("generates a fresh conversationId per call by default", async () => {
    const make = async () =>
      resolvePhase1VoiceContext({
        slug: org.slug,
        lookupOrgBySlug: async () => org,
        lookupAgentId: async () => "a",
        // no generateConversationId override → real randomUUID
      });
    const r1 = await make();
    const r2 = await make();
    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);
    if (r1.ok && r2.ok) {
      assert.notEqual(
        r1.ctx.conversationId,
        r2.ctx.conversationId,
        "each resolution should mint a unique conversationId",
      );
      // sanity: looks like a uuid
      assert.match(r1.ctx.conversationId, /^[0-9a-f-]{36}$/i);
    }
  });
});
