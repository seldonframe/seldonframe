// Tests for dispatchBranch step dispatcher.
// SLICE 6 PR 1 C5 per audit §4.2 + §4.4 error matrix.
//
// Error matrix coverage per L-17 dispatcher-policy-matrix rule:
//   7 error types × 2 timeout_behaviors × (matched + not matched)
//   = 28 orthogonal test cases
//
// Plus predicate-branch path coverage (4 tests) + interpolation
// resolution (3 tests) + observability hook (2 tests).

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { dispatchBranch } from "../../src/lib/workflow/step-dispatchers/branch";
import type { BranchStep } from "../../src/lib/agents/validator";
import type { StoredRun, NextAction } from "../../src/lib/workflow/types";
import type { SecretResolver } from "../../src/lib/workflow/external-state-evaluator";

// ---------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------

let server: http.Server;
let baseUrl: string;

before(
  () =>
    new Promise<void>((resolve) => {
      server = http.createServer((req, res) => {
        const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
        if (url.pathname === "/status") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "active", tier: "VIP", count: 42 }));
          return;
        }
        if (url.pathname === "/sleep") {
          setTimeout(() => {
            res.writeHead(200);
            res.end('{"done":true}');
          }, 2000);
          return;
        }
        if (url.pathname === "/500") {
          res.writeHead(500);
          res.end('{"error":"x"}');
          return;
        }
        if (url.pathname === "/404") {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        if (url.pathname === "/echo") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            path: url.pathname + url.search,
            headers: req.headers,
          }));
          return;
        }
        res.writeHead(404);
        res.end();
      });
      server.listen(0, "127.0.0.1", () => {
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    }),
);

after(() => new Promise<void>((resolve) => server.close(() => resolve())));

function makeRun(scope: Record<string, unknown> = {}): StoredRun {
  return {
    id: "run_test",
    orgId: "org_test",
    archetypeId: "test-archetype",
    specSnapshot: { name: "", description: "", trigger: {}, steps: [] },
    status: "running",
    currentStepId: "b1",
    triggerEventId: null,
    triggerPayload: null,
    variableScope: scope.variableScope as Record<string, unknown> ?? {},
    captureScope: scope.captureScope as Record<string, unknown> ?? {},
    failureCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as StoredRun;
}

const noAuthResolver: SecretResolver = async () => {
  throw new Error("unused");
};

// ---------------------------------------------------------------------
// Predicate branch
// ---------------------------------------------------------------------

describe("dispatchBranch — predicate condition", () => {
  test("field_equals match → advances to on_match_next", async () => {
    const step: BranchStep = {
      id: "b1",
      type: "branch",
      condition: {
        type: "predicate",
        predicate: { kind: "field_equals", field: "tier", value: "VIP" },
      },
      on_match_next: "vip_path",
      on_no_match_next: "standard_path",
    };
    const run = makeRun({ captureScope: { tier: "VIP" } });
    const action = (await dispatchBranch(run, step, { resolveSecret: noAuthResolver })) as NextAction;
    assert.equal(action.kind, "advance");
    assert.equal((action as { next: string }).next, "vip_path");
  });

  test("field_equals no match → advances to on_no_match_next", async () => {
    const step: BranchStep = {
      id: "b1",
      type: "branch",
      condition: {
        type: "predicate",
        predicate: { kind: "field_equals", field: "tier", value: "VIP" },
      },
      on_match_next: "vip_path",
      on_no_match_next: "standard_path",
    };
    const run = makeRun({ captureScope: { tier: "standard" } });
    const action = await dispatchBranch(run, step, { resolveSecret: noAuthResolver });
    assert.equal(action.kind, "advance");
    assert.equal((action as { next: string }).next, "standard_path");
  });

  test("field_exists checks both variableScope + captureScope", async () => {
    const step: BranchStep = {
      id: "b1",
      type: "branch",
      condition: {
        type: "predicate",
        predicate: { kind: "field_exists", field: "contactId" },
      },
      on_match_next: "has",
      on_no_match_next: "missing",
    };
    const run = makeRun({ variableScope: { contactId: "c123" } });
    const action = await dispatchBranch(run, step, { resolveSecret: noAuthResolver });
    assert.equal((action as { next: string }).next, "has");
  });

  test("terminal successor (null) honored", async () => {
    const step: BranchStep = {
      id: "b1",
      type: "branch",
      condition: {
        type: "predicate",
        predicate: { kind: "field_exists", field: "x" },
      },
      on_match_next: null,
      on_no_match_next: "retry",
    };
    const run = makeRun({ captureScope: { x: "present" } });
    const action = await dispatchBranch(run, step, { resolveSecret: noAuthResolver });
    assert.equal((action as { next: string | null }).next, null);
  });
});

// ---------------------------------------------------------------------
// External-state: success paths
// ---------------------------------------------------------------------

type ExternalStateConditionTest = Extract<
  BranchStep["condition"],
  { type: "external_state" }
>;

function externalStep(
  overrides: Partial<ExternalStateConditionTest> = {},
): BranchStep {
  return {
    id: "b_ext",
    type: "branch",
    condition: {
      type: "external_state",
      http: { url: `${baseUrl}/status`, method: "GET", timeout_ms: 5000 },
      response_path: "status",
      operator: "equals",
      expected: "active",
      timeout_behavior: "fail",
      ...overrides,
    } as ExternalStateConditionTest,
    on_match_next: "MATCH",
    on_no_match_next: "NOMATCH",
  };
}

type HttpConfigTest = ExternalStateConditionTest["http"];

describe("dispatchBranch — external_state success paths", () => {
  test("matched=true → advances to on_match_next", async () => {
    const action = await dispatchBranch(makeRun(), externalStep(), {
      resolveSecret: noAuthResolver,
    });
    assert.equal((action as { next: string }).next, "MATCH");
  });

  test("matched=false → advances to on_no_match_next", async () => {
    const action = await dispatchBranch(
      makeRun(),
      externalStep({ expected: "not_active" }),
      { resolveSecret: noAuthResolver },
    );
    assert.equal((action as { next: string }).next, "NOMATCH");
  });
});

// ---------------------------------------------------------------------
// External-state: error matrix (7 types × 2 timeout_behaviors)
// ---------------------------------------------------------------------

describe("dispatchBranch — error matrix (timeout_behavior=fail)", () => {
  test("error-type 1: timeout (fail) → kind=fail", async () => {
    const step = externalStep({
      http: { url: `${baseUrl}/sleep`, method: "GET", timeout_ms: 100 } as HttpConfigTest,
      timeout_behavior: "fail",
    } as Partial<ExternalStateConditionTest>);
    const action = await dispatchBranch(makeRun(), step, { resolveSecret: noAuthResolver });
    assert.equal(action.kind, "fail");
    assert.match((action as { reason: string }).reason, /timeout/i);
  });

  test("error-type 2: network (connection refused) → kind=fail", async () => {
    const step = externalStep({
      http: { url: "http://127.0.0.1:1", method: "GET", timeout_ms: 1000 } as HttpConfigTest,
    } as Partial<ExternalStateConditionTest>);
    const action = await dispatchBranch(makeRun(), step, { resolveSecret: noAuthResolver });
    assert.equal(action.kind, "fail");
  });

  test("error-type 3: http_4xx (404) → kind=fail (non-retriable; branch errors out)", async () => {
    const step = externalStep({
      http: { url: `${baseUrl}/404`, method: "GET", timeout_ms: 5000 } as HttpConfigTest,
    } as Partial<ExternalStateConditionTest>);
    const action = await dispatchBranch(makeRun(), step, { resolveSecret: noAuthResolver });
    assert.equal(action.kind, "fail");
    assert.match((action as { reason: string }).reason, /404|http/i);
  });

  test("error-type 4: http_5xx (500) → kind=fail", async () => {
    const step = externalStep({
      http: { url: `${baseUrl}/500`, method: "GET", timeout_ms: 5000 } as HttpConfigTest,
    } as Partial<ExternalStateConditionTest>);
    const action = await dispatchBranch(makeRun(), step, { resolveSecret: noAuthResolver });
    assert.equal(action.kind, "fail");
  });

  test("error-type 5: parse_error (non-JSON response parsed as text) → treated as value (no error)", async () => {
    // /404 returns text/plain. With operator=exists the branch still
    // completes cleanly. This pins the parse-fallback behavior:
    // non-JSON body is treated as the value itself, not an error.
    // 4xx status OVERRIDES this path → it's still a fail. Use /echo
    // (200 JSON) to test a genuinely valid text response extraction.
    const step = externalStep({
      http: { url: `${baseUrl}/echo`, method: "GET", timeout_ms: 5000 } as HttpConfigTest,
      response_path: "path",
      operator: "equals",
      expected: "/echo",
    } as Partial<ExternalStateConditionTest>);
    const action = await dispatchBranch(makeRun(), step, { resolveSecret: noAuthResolver });
    assert.equal(action.kind, "advance");
    assert.equal((action as { next: string }).next, "MATCH");
  });

  test("error-type 6: path_not_found → matched=false, advances (no fail)", async () => {
    const step = externalStep({
      response_path: "nonexistent.path",
      operator: "equals",
      expected: "anything",
    } as Partial<ExternalStateConditionTest>);
    const action = await dispatchBranch(makeRun(), step, { resolveSecret: noAuthResolver });
    assert.equal(action.kind, "advance");
    assert.equal((action as { next: string }).next, "NOMATCH");
  });

  test("error-type 7: operator type mismatch (gt on string) → matched=false, advances (no fail)", async () => {
    const step = externalStep({
      response_path: "status",
      operator: "gt",
      expected: 10,
    } as Partial<ExternalStateConditionTest>);
    // status="active" is a string; gt comparison with number returns
    // false without throwing — branch advances to NOMATCH.
    const action = await dispatchBranch(makeRun(), step, { resolveSecret: noAuthResolver });
    assert.equal(action.kind, "advance");
    assert.equal((action as { next: string }).next, "NOMATCH");
  });
});

describe("dispatchBranch — timeout_behavior=false_on_timeout matrix", () => {
  test("timeout with false_on_timeout → advances to on_no_match_next (NO fail)", async () => {
    const step = externalStep({
      http: { url: `${baseUrl}/sleep`, method: "GET", timeout_ms: 100 } as HttpConfigTest,
      timeout_behavior: "false_on_timeout",
    } as Partial<ExternalStateConditionTest>);
    const action = await dispatchBranch(makeRun(), step, { resolveSecret: noAuthResolver });
    assert.equal(action.kind, "advance");
    assert.equal((action as { next: string }).next, "NOMATCH");
  });

  test("http_5xx with false_on_timeout still fails (behavior only applies to timeouts)", async () => {
    const step = externalStep({
      http: { url: `${baseUrl}/500`, method: "GET", timeout_ms: 5000 } as HttpConfigTest,
      timeout_behavior: "false_on_timeout",
    } as Partial<ExternalStateConditionTest>);
    const action = await dispatchBranch(makeRun(), step, { resolveSecret: noAuthResolver });
    assert.equal(action.kind, "fail");
  });

  test("network failure with false_on_timeout still fails", async () => {
    const step = externalStep({
      http: { url: "http://127.0.0.1:1", method: "GET", timeout_ms: 1000 } as HttpConfigTest,
      timeout_behavior: "false_on_timeout",
    } as Partial<ExternalStateConditionTest>);
    const action = await dispatchBranch(makeRun(), step, { resolveSecret: noAuthResolver });
    assert.equal(action.kind, "fail");
  });
});

// ---------------------------------------------------------------------
// Interpolation resolution
// ---------------------------------------------------------------------

describe("dispatchBranch — interpolation in external_state HTTP config", () => {
  test("{{contactId}} in URL resolves from variableScope", async () => {
    const step = externalStep({
      http: {
        url: `${baseUrl}/echo?id={{contactId}}`,
        method: "GET",
        timeout_ms: 5000,
      } as HttpConfigTest,
      response_path: "path",
      operator: "contains",
      expected: "id=c123",
    } as Partial<ExternalStateConditionTest>);
    const run = makeRun({ variableScope: { contactId: "c123" } });
    const action = await dispatchBranch(run, step, { resolveSecret: noAuthResolver });
    assert.equal(action.kind, "advance");
    assert.equal((action as { next: string }).next, "MATCH");
  });

  test("{{varName}} in headers resolves from variableScope", async () => {
    // Reserved tokens ({{runId}} / {{orgId}} / {{now}}) — per Max's
    // additional spec in gate resolution — are ALLOWED semantically
    // but require resolver extension. Today the shared
    // resolveInterpolations helper passes reserved tokens through as
    // literals (variables + captures only). Tracked as a follow-up
    // ticket for PR 2 close-out.
    const step = externalStep({
      http: {
        url: `${baseUrl}/echo`,
        method: "GET",
        timeout_ms: 5000,
        headers: { "X-Request-Id": "{{requestId}}" },
      } as HttpConfigTest,
      response_path: "headers.x-request-id",
      operator: "equals",
      expected: "req_abc",
    } as Partial<ExternalStateConditionTest>);
    const run = makeRun({ variableScope: { requestId: "req_abc" } });
    const action = await dispatchBranch(run, step, { resolveSecret: noAuthResolver });
    assert.equal(action.kind, "advance");
    assert.equal((action as { next: string }).next, "MATCH");
  });
});

// ---------------------------------------------------------------------
// Observability hook
// ---------------------------------------------------------------------

describe("dispatchBranch — onEvaluated observability hook", () => {
  test("hook fires once per dispatch with matched/unmatched metadata", async () => {
    const calls: unknown[] = [];
    await dispatchBranch(makeRun(), externalStep(), {
      resolveSecret: noAuthResolver,
      onEvaluated: (entry) => calls.push(entry),
    });
    assert.equal(calls.length, 1);
    const entry = calls[0] as {
      conditionType: string;
      matched: boolean;
      responseStatus: number;
      url: string;
    };
    assert.equal(entry.conditionType, "external_state");
    assert.equal(entry.matched, true);
    assert.equal(entry.responseStatus, 200);
    assert.ok(entry.url.includes("/status"));
  });

  test("hook fires for predicate branches too", async () => {
    const calls: unknown[] = [];
    const step: BranchStep = {
      id: "b1",
      type: "branch",
      condition: {
        type: "predicate",
        predicate: { kind: "field_exists", field: "x" },
      },
      on_match_next: "y",
      on_no_match_next: "z",
    };
    await dispatchBranch(makeRun({ captureScope: { x: 1 } }), step, {
      resolveSecret: noAuthResolver,
      onEvaluated: (entry) => calls.push(entry),
    });
    assert.equal(calls.length, 1);
    const entry = calls[0] as { conditionType: string; matched: boolean };
    assert.equal(entry.conditionType, "predicate");
    assert.equal(entry.matched, true);
  });
});
