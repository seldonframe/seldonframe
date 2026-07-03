// Tests for the eval-trust-rail persistence schema (migration 0060):
// eval_runs, agent_improve_proposals, and marketplace_listings.trust_stats.
//
// Task 1 of the improve-verb + trust-rail plan
// (docs/superpowers/plans/2026-07-02-improve-verb-trust-rail.md). This is the
// FIRST task — it creates the schema everything else builds on. No prior-task
// interfaces exist yet.
//
// Imports from "@/db/schema" (the INDEX, not the file directly) to prove the
// new schema file is actually re-exported — the plan calls out that a past
// production outage came from a migration landing without its index export.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { evalRuns, agentImproveProposals, marketplaceListings } from "@/db/schema";

describe("eval_runs table shape", () => {
  test("has the expected columns", () => {
    const cols = evalRuns as unknown as Record<string, unknown>;
    for (const key of [
      "id",
      "orgId",
      "subjectKind",
      "subjectId",
      "kind",
      "passRate",
      "scenarioCount",
      "passedCount",
      "graderModel",
      "blueprintVersion",
      "resultsSummary",
      "createdAt",
    ]) {
      assert.ok(key in cols, `evalRuns is missing column "${key}"`);
    }
  });
});

describe("agent_improve_proposals table shape", () => {
  test("has the expected columns", () => {
    const cols = agentImproveProposals as unknown as Record<string, unknown>;
    for (const key of [
      "id",
      "orgId",
      "agentId",
      "basedOnVersion",
      "patch",
      "rationale",
      "baselineRunId",
      "candidateRunId",
      "status",
      "createdAt",
      "resolvedAt",
    ]) {
      assert.ok(key in cols, `agentImproveProposals is missing column "${key}"`);
    }
  });
});

describe("marketplace_listings.trust_stats", () => {
  test("trustStats column exists on the listings table", () => {
    const cols = marketplaceListings as unknown as Record<string, unknown>;
    assert.ok("trustStats" in cols, "marketplaceListings is missing column \"trustStats\"");
  });
});
