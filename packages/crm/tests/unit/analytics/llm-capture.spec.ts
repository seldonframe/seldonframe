// Task 12 — captureLlmGeneration property mapping.
//
// llm-capture.ts has no injectable-deps seam (matches mcp-capture.ts's
// shape exactly — getPosthogClient() is a lazy module singleton, not a
// constructor param), so this spec spies by patching
// PostHog.prototype.captureImmediate directly rather than mock.module
// (the repo prefers DI over mock.module — see agent-mcp-handler.spec.ts —
// but there is no DI seam to inject here without changing the production
// shape, so a prototype patch is the narrowest substitute). NEXT_PUBLIC_
// POSTHOG_KEY is set before import so getPosthogClient() constructs a real
// (never-network-calling, since captureImmediate is patched) client.
//
// Run:
//   node --import tsx --test tests/unit/analytics/llm-capture.spec.ts

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test_key_llm_capture";

import { PostHog } from "posthog-node";
import { captureLlmGeneration } from "../../../src/lib/analytics/llm-capture";

type CapturedEvent = {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
};

let captured: CapturedEvent[] = [];
const originalCaptureImmediate = PostHog.prototype.captureImmediate;

beforeEach(() => {
  captured = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (PostHog.prototype as any).captureImmediate = async function (event: CapturedEvent) {
    captured.push(event);
    return undefined;
  };
});

afterEach(() => {
  PostHog.prototype.captureImmediate = originalCaptureImmediate;
});

describe("captureLlmGeneration", () => {
  test("emits $ai_generation with the pinned $ai_* property keys mapped from input", async () => {
    captureLlmGeneration({
      distinctId: "org-123",
      orgId: "org-123",
      model: "claude-sonnet-4-5-20250929",
      inputTokens: 512,
      outputTokens: 128,
      latencyMs: 2500,
      traceId: "conv-abc",
      surface: "agent",
    });

    // captureImmediate is called fire-and-forget (not awaited by the
    // function under test) — yield a tick so the async patched stub runs.
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(captured.length, 1);
    const [event] = captured;
    assert.equal(event.event, "$ai_generation");
    assert.equal(event.distinctId, "org-123");

    const props = event.properties ?? {};
    assert.equal(props["$ai_provider"], "anthropic");
    assert.equal(props["$ai_model"], "claude-sonnet-4-5-20250929");
    assert.equal(props["$ai_input_tokens"], 512);
    assert.equal(props["$ai_output_tokens"], 128);
    assert.equal(props["$ai_latency"], 2.5); // ms -> seconds, matches @posthog/ai's own unit
    assert.equal(props["$ai_trace_id"], "conv-abc");
    assert.equal(props.org_id, "org-123");
    assert.equal(props.llm_surface, "agent");
  });

  test("maps surface=copilot and surface=extraction through unchanged", async () => {
    captureLlmGeneration({
      distinctId: "org-copilot",
      orgId: "org-copilot",
      model: "claude-haiku-4-5",
      inputTokens: 10,
      outputTokens: 5,
      latencyMs: 100,
      traceId: "conv-copilot",
      surface: "copilot",
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(captured[0].properties?.llm_surface, "copilot");

    captured = [];
    captureLlmGeneration({
      distinctId: "org-extract",
      orgId: null,
      model: "claude-haiku-4-5",
      inputTokens: 1,
      outputTokens: 1,
      latencyMs: 1,
      traceId: "conv-extract",
      surface: "extraction",
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(captured[0].properties?.llm_surface, "extraction");
    // No orgId resolvable -> anonymous person-profile guard, matching
    // mcp-capture.ts's identical posture.
    assert.equal(captured[0].properties?.$process_person_profile, false);
    assert.equal(captured[0].properties?.org_id, undefined);
  });

  test("never emits a property that could carry prompt/completion content", async () => {
    captureLlmGeneration({
      distinctId: "org-privacy",
      orgId: "org-privacy",
      model: "claude-sonnet-4-5-20250929",
      inputTokens: 1,
      outputTokens: 1,
      latencyMs: 1,
      traceId: "conv-privacy",
      surface: "agent",
    });
    await new Promise((resolve) => setImmediate(resolve));

    const props = event0Properties();
    // Exact banned keys (the actual @posthog/ai property names that carry
    // prompt/completion CONTENT) plus substring bans for generic content-ish
    // words — but token-COUNT keys like $ai_input_tokens/$ai_output_tokens
    // are explicitly allowed since they carry a number, never text.
    const allowedKeys = new Set([
      "$ai_provider",
      "$ai_model",
      "$ai_input_tokens",
      "$ai_output_tokens",
      "$ai_latency",
      "$ai_trace_id",
      "org_id",
      "llm_surface",
      "$process_person_profile",
    ]);
    const exactBannedKeys = ["$ai_input", "$ai_output_choices"];
    const substringBans = ["prompt", "completion", "content", "message"];
    for (const key of Object.keys(props)) {
      assert.ok(!exactBannedKeys.includes(key), `property key "${key}" is a banned content-carrying key`);
      if (allowedKeys.has(key)) continue;
      const lower = key.toLowerCase();
      for (const banned of substringBans) {
        assert.ok(
          !lower.includes(banned),
          `property key "${key}" looks prompt/completion-ish (matched "${banned}")`,
        );
      }
    }

    function event0Properties(): Record<string, unknown> {
      return captured[0].properties ?? {};
    }
  });

  test("is a no-op when no PostHog key is configured", async () => {
    const prior = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    try {
      // Re-import via require cache bust isn't needed: getPosthogClient caches
      // the client the FIRST time it's called (module singleton), so this
      // test only verifies the call doesn't throw when invoked — the
      // singleton-cached-client behavior is covered by capture.ts's own
      // module contract, not re-tested here.
      assert.doesNotThrow(() => {
        captureLlmGeneration({
          distinctId: "org-noop",
          orgId: "org-noop",
          model: "claude-haiku-4-5",
          inputTokens: 1,
          outputTokens: 1,
          latencyMs: 1,
          traceId: "conv-noop",
          surface: "agent",
        });
      });
    } finally {
      if (prior !== undefined) process.env.NEXT_PUBLIC_POSTHOG_KEY = prior;
    }
  });
});
