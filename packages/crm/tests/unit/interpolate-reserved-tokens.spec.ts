// Tests for reserved-token interpolation.
// SLICE 6 PR 2 C3 per Max's additional spec in gate resolution.
//
// Per SLICE 6 audit §3.1 + PR 2 scope, three reserved tokens resolve
// from the run context (NOT from variable/capture scope):
//   {{runId}}  → run.id
//   {{orgId}}  → run.orgId
//   {{now}}    → new Date().toISOString() (UTC)
//
// Reserved tokens take precedence over variableScope + captureScope
// entries with the same name (shouldn't happen in practice, but the
// precedence ensures reserved token semantics can't be shadowed).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveInterpolations,
  resolveInterpolationsInString,
} from "../../src/lib/workflow/interpolate";
import type { StoredRun } from "../../src/lib/workflow/types";

function mkRun(overrides: Partial<StoredRun> = {}): StoredRun {
  return {
    id: "run_abc123",
    orgId: "org_acme",
    archetypeId: "daily-digest",
    status: "running",
    currentStepId: "s1",
    triggerEventId: null,
    triggerPayload: null,
    variableScope: {},
    captureScope: {},
    failureCount: 0,
    specSnapshot: { name: "", description: "", trigger: {}, steps: [] },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as StoredRun;
}

// ---------------------------------------------------------------------
// {{runId}}
// ---------------------------------------------------------------------

describe("interpolate — {{runId}} reserved token", () => {
  test("resolves to run.id in strings", () => {
    const out = resolveInterpolationsInString(
      "https://api.example.com/runs/{{runId}}",
      mkRun({ id: "run_xyz" }),
    );
    assert.equal(out, "https://api.example.com/runs/run_xyz");
  });

  test("resolves in object values (headers)", () => {
    const out = resolveInterpolations(
      { "X-Run-Id": "{{runId}}" },
      mkRun({ id: "run_xyz" }),
    );
    assert.deepEqual(out, { "X-Run-Id": "run_xyz" });
  });

  test("resolves multiple occurrences in one string", () => {
    const out = resolveInterpolationsInString(
      "{{runId}}-{{runId}}",
      mkRun({ id: "R" }),
    );
    assert.equal(out, "R-R");
  });
});

// ---------------------------------------------------------------------
// {{orgId}}
// ---------------------------------------------------------------------

describe("interpolate — {{orgId}} reserved token", () => {
  test("resolves to run.orgId", () => {
    const out = resolveInterpolationsInString(
      "org={{orgId}}",
      mkRun({ orgId: "org_acme" }),
    );
    assert.equal(out, "org=org_acme");
  });
});

// ---------------------------------------------------------------------
// {{now}}
// ---------------------------------------------------------------------

describe("interpolate — {{now}} reserved token", () => {
  test("resolves to an ISO 8601 UTC timestamp", () => {
    const out = resolveInterpolationsInString("t={{now}}", mkRun());
    // Match a valid ISO 8601 UTC (ends in Z, includes T)
    const match = out.match(/^t=(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)$/);
    assert.ok(match, `expected ISO 8601 Z-suffix; got "${out}"`);
  });

  test("two calls produce two valid timestamps", () => {
    const a = resolveInterpolationsInString("{{now}}", mkRun());
    const b = resolveInterpolationsInString("{{now}}", mkRun());
    assert.match(a, /Z$/);
    assert.match(b, /Z$/);
  });
});

// ---------------------------------------------------------------------
// Precedence + isolation
// ---------------------------------------------------------------------

describe("interpolate — reserved tokens take precedence over scope entries", () => {
  test("{{runId}} uses run.id even if variableScope has a runId entry", () => {
    const out = resolveInterpolationsInString(
      "{{runId}}",
      mkRun({ id: "REAL_RUN", variableScope: { runId: "VAR_SCOPE_VALUE" } }),
    );
    assert.equal(out, "REAL_RUN");
  });

  test("{{orgId}} uses run.orgId even if captureScope has an orgId entry", () => {
    const out = resolveInterpolationsInString(
      "{{orgId}}",
      mkRun({ orgId: "REAL_ORG", captureScope: { orgId: "CAP_VALUE" } }),
    );
    assert.equal(out, "REAL_ORG");
  });
});

// ---------------------------------------------------------------------
// Strict behavior preservation — existing scope resolution unchanged
// ---------------------------------------------------------------------

describe("interpolate — strict-behavior preservation (non-reserved tokens)", () => {
  test("variableScope lookup still works", () => {
    const out = resolveInterpolationsInString(
      "{{contactId}}",
      mkRun({ variableScope: { contactId: "c123" } }),
    );
    assert.equal(out, "c123");
  });

  test("captureScope dotted-path lookup still works", () => {
    const out = resolveInterpolationsInString(
      "{{booking.id}}",
      mkRun({ captureScope: { booking: { id: "b456" } } }),
    );
    assert.equal(out, "b456");
  });

  test("unknown roots pass through raw (no accidental reserved-token match)", () => {
    const out = resolveInterpolationsInString("{{someUnknownThing}}", mkRun());
    assert.equal(out, "{{someUnknownThing}}");
  });
});
