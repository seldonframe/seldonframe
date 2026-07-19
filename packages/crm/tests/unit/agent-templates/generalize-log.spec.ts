// Agent truth slice (Task 1) — the generalize-actions server-side
// observability log-line builder. Max's real production failure ("Couldn't
// check for personal details") left ZERO trace in Vercel logs; this pure
// helper is what generalize-actions.ts calls on every non-ok propose result
// so the next failure is self-diagnosing (typed error + model id + scrubbed
// upstream message). Pure/DI'd (no db, no LLM) — mirrors generalize.spec's
// convention of testing the pure core directly.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildGeneralizeFailureLog, GENERALIZE_PROPOSE_FAILURE_LOG_PREFIX } from "../../../src/lib/agent-templates/generalize-log";

describe("buildGeneralizeFailureLog", () => {
  test("llm_failed with an upstream error message: includes typed error, model, and scrubbed upstream", () => {
    const { message, payload } = buildGeneralizeFailureLog({
      templateId: "tmpl-1",
      orgId: "org-1",
      result: { ok: false, error: "llm_failed" },
      model: "claude-haiku-4-5",
      upstreamMessage: "model claude-haiku-4-5 not found (404)",
    });
    assert.equal(message, GENERALIZE_PROPOSE_FAILURE_LOG_PREFIX);
    assert.deepEqual(payload, {
      templateId: "tmpl-1",
      orgId: "org-1",
      error: "llm_failed",
      model: "claude-haiku-4-5",
      upstream: "model claude-haiku-4-5 not found (404)",
    });
  });

  test("malformed_llm_output with NO upstream message (no throw, just bad shape): upstream key omitted", () => {
    const { payload } = buildGeneralizeFailureLog({
      templateId: "tmpl-2",
      orgId: "org-2",
      result: { ok: false, error: "malformed_llm_output" },
      model: "claude-haiku-4-5",
      upstreamMessage: null,
    });
    assert.deepEqual(payload, {
      templateId: "tmpl-2",
      orgId: "org-2",
      error: "malformed_llm_output",
      model: "claude-haiku-4-5",
    });
    assert.ok(!("upstream" in payload));
  });

  test("empty_skill_md: still logs (model + error), no upstream", () => {
    const { payload } = buildGeneralizeFailureLog({
      templateId: "tmpl-3",
      orgId: "org-3",
      result: { ok: false, error: "empty_skill_md" },
      model: "claude-haiku-4-5",
    });
    assert.equal(payload.error, "empty_skill_md");
    assert.equal(payload.model, "claude-haiku-4-5");
  });

  test("a blank/whitespace-only upstream message is treated as absent (never an empty upstream key)", () => {
    const { payload } = buildGeneralizeFailureLog({
      templateId: "tmpl-4",
      orgId: "org-4",
      result: { ok: false, error: "llm_failed" },
      model: "claude-haiku-4-5",
      upstreamMessage: "   ",
    });
    assert.ok(!("upstream" in payload));
  });

  test("scrubs a credential shape out of the upstream message (reuses receipts scrubSecretShapes)", () => {
    const { payload } = buildGeneralizeFailureLog({
      templateId: "tmpl-5",
      orgId: "org-5",
      result: { ok: false, error: "llm_failed" },
      model: "claude-haiku-4-5",
      upstreamMessage: "Unauthorized: Bearer sk-ant-abc123secret failed",
    });
    assert.ok(!payload.upstream?.includes("sk-ant-abc123secret"));
    assert.match(payload.upstream ?? "", /\[redacted\]/);
  });

  test("caps the scrubbed upstream string at 200 chars (review fix NB-1, same rationale as deriveReceiptSummary's cap)", () => {
    const longMessage = "x".repeat(500);
    const { payload } = buildGeneralizeFailureLog({
      templateId: "tmpl-7",
      orgId: "org-7",
      result: { ok: false, error: "llm_failed" },
      model: "claude-haiku-4-5",
      upstreamMessage: longMessage,
    });
    assert.equal(payload.upstream?.length, 200);
  });

  test("never echoes skill-md content — the function takes no such parameter", () => {
    // Structural guarantee: buildGeneralizeFailureLog's input type has no
    // customSkillMd field, so it is impossible for a caller to (even
    // accidentally) pass persona text into the log line.
    const { payload } = buildGeneralizeFailureLog({
      templateId: "tmpl-6",
      orgId: "org-6",
      result: { ok: false, error: "llm_failed" },
      model: "claude-haiku-4-5",
      upstreamMessage: "network error",
    });
    assert.deepEqual(Object.keys(payload).sort(), ["error", "model", "orgId", "templateId", "upstream"]);
  });
});
