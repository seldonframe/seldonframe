// Tests for the post-service-followup HVAC archetype.
// SLICE 9 PR 2 C3 per scenario doc + audit §4.4.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { archetypes } from "../../src/lib/agents/archetypes";
import {
  hvacArchetypes,
  getHvacArchetype,
} from "../../src/lib/hvac/archetypes";
import { postServiceFollowupArchetype } from "../../src/lib/hvac/archetypes/post-service-followup";

describe("post-service-followup archetype — registry isolation (G-9-7)", () => {
  test("appears in HVAC workspace-scoped registry", () => {
    const a = getHvacArchetype("hvac-post-service-followup");
    assert.ok(a);
  });

  test("does NOT appear in global archetype registry", () => {
    assert.equal(archetypes["hvac-post-service-followup"], undefined);
  });

  test("global archetype count remains 6 (SLICE 9 isolation invariant)", () => {
    assert.equal(Object.keys(archetypes).length, 6);
  });

  test("hvac-archetypes registry now has all 4 SLICE 9 archetypes", () => {
    assert.equal(Object.keys(hvacArchetypes).length, 4);
  });
});

describe("post-service-followup archetype — shape", () => {
  test("requires crm + sms + payments + hvac-service-calls", () => {
    assert.deepEqual(
      [...postServiceFollowupArchetype.requiresInstalled].sort(),
      ["crm", "hvac-service-calls", "payments", "sms"].sort(),
    );
  });

  test("trigger is event subscription on payment.completed", () => {
    const t = postServiceFollowupArchetype.specTemplate as {
      trigger: { type: string; event: string };
    };
    assert.equal(t.trigger.type, "event");
    assert.equal(t.trigger.event, "payment.completed");
  });

  test("7 steps: wait → SMS → await → branch → review|escalation; reminder on timeout", () => {
    const steps = (postServiceFollowupArchetype.specTemplate as {
      steps: Array<{ id: string; type: string }>;
    }).steps;
    assert.equal(steps.length, 7);
    const ids = steps.map((s) => s.id);
    assert.deepEqual(ids, [
      "wait_24h",
      "send_satisfaction",
      "await_rating",
      "check_rating",
      "request_review",
      "log_escalation",
      "send_reminder",
    ]);
  });

  test("wait step is 24 hours (86400 seconds)", () => {
    const steps = (postServiceFollowupArchetype.specTemplate as {
      steps: Array<{ id: string; type: string; seconds?: number }>;
    }).steps;
    const wait = steps.find((s) => s.id === "wait_24h");
    assert.equal(wait!.type, "wait");
    assert.equal(wait!.seconds, 86400);
  });

  test("await_event has 48h timeout + on_resume + on_timeout=send_reminder", () => {
    const steps = (postServiceFollowupArchetype.specTemplate as {
      steps: Array<{ id: string; type: string; timeout?: { ms: number }; on_resume?: { next: string }; on_timeout?: { next: string } }>;
    }).steps;
    const a = steps.find((s) => s.id === "await_rating");
    assert.equal(a!.type, "await_event");
    assert.equal(a!.timeout!.ms, 172800000); // 48 hours
    assert.equal(a!.on_resume!.next, "check_rating");
    assert.equal(a!.on_timeout!.next, "send_reminder");
  });

  test("rating branch uses `any` predicate against high-rating literals (4, 5, '4 stars', '5 stars')", () => {
    const steps = (postServiceFollowupArchetype.specTemplate as {
      steps: Array<{ id: string; condition?: { type: string; predicate?: { kind: string; of?: Array<{ kind: string; field?: string; value?: string }> } } }>;
    }).steps;
    const branch = steps.find((s) => s.id === "check_rating");
    assert.equal(branch!.condition!.type, "predicate");
    assert.equal(branch!.condition!.predicate!.kind, "any");
    const subPredicates = branch!.condition!.predicate!.of!;
    assert.equal(subPredicates.length, 4);
    const values = subPredicates.map((p) => p.value).sort();
    assert.deepEqual(values, ["4", "4 stars", "5", "5 stars"]);
    assert.ok(subPredicates.every((p) => p.kind === "field_equals"));
    assert.ok(subPredicates.every((p) => p.field === "rating_reply.body"));
  });

  test("high-rating path → request_review with Google review link", () => {
    const steps = (postServiceFollowupArchetype.specTemplate as {
      steps: Array<{ id: string; args?: Record<string, unknown> }>;
    }).steps;
    const review = steps.find((s) => s.id === "request_review");
    assert.match(String(review!.args!.body), /Google/);
    assert.match(String(review!.args!.body), /desertcool\.example\.com\/review/);
  });

  test("low-rating + ambiguous path → emit_event hvac.satisfaction.escalation", () => {
    const steps = (postServiceFollowupArchetype.specTemplate as {
      steps: Array<{ id: string; type: string; event?: string; data?: Record<string, unknown> }>;
    }).steps;
    const esc = steps.find((s) => s.id === "log_escalation");
    assert.equal(esc!.type, "emit_event");
    assert.equal(esc!.event, "hvac.satisfaction.escalation");
    assert.ok("rating" in esc!.data!);
    assert.ok("rawReply" in esc!.data!);
  });

  test("timeout path → send_reminder (single-shot, no second await)", () => {
    const steps = (postServiceFollowupArchetype.specTemplate as {
      steps: Array<{ id: string; type: string; next?: string | null; args?: Record<string, unknown> }>;
    }).steps;
    const r = steps.find((s) => s.id === "send_reminder");
    assert.equal(r!.type, "mcp_tool_call");
    assert.equal(r!.next, null); // no second await — one-shot to avoid SMS storm
    assert.match(String(r!.args!.body), /just following up/);
  });

  test("primitive coverage — wait + await_event + branch + emit_event + mcp_tool_call (×3)", () => {
    const steps = (postServiceFollowupArchetype.specTemplate as {
      steps: Array<{ type: string }>;
    }).steps;
    const types = new Set(steps.map((s) => s.type));
    assert.ok(types.has("wait"));
    assert.ok(types.has("mcp_tool_call"));
    assert.ok(types.has("await_event"));
    assert.ok(types.has("branch"));
    assert.ok(types.has("emit_event"));
  });
});
