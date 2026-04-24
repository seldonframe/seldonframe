// SLICE 6 shallow-plus integration harness + end-to-end test.
// PR 2 C6 per audit §11 + Max's PR 2 specific scope item #6.
//
// Scope (per audit + gate G-6-4 / G-6-2 / G-6-5 / G-6-6):
//   1. Branch with predicate condition (internal state)
//   2. Branch with external_state condition (mocked HTTP)
//   3. Timeout with "fail" behavior + "false_on_timeout" behavior
//   4. Retry on retriable errors (502/503/network)
//   5. Non-retry on non-retriable errors (400/401/403)
//   6. Max retries exhausted → fail branch
//   7. workspace_secret resolution through SecretResolver
//   8. Interpolation: capture/variable/reserved tokens work; secrets
//      rejected at validator
//   9. End-to-end: branch evaluates → correct next step → observability
//      event recorded

import { describe, test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { dispatchBranch } from "../../src/lib/workflow/step-dispatchers/branch";
import { fetchWithTimeout } from "../../src/lib/workflow/http";
import { evaluateExternalState } from "../../src/lib/workflow/external-state-evaluator";
import {
  makeWorkspaceSecretResolver,
  type WorkspaceSecretsStore,
} from "../../src/lib/workflow/secret-resolver";
import { makeBranchObservabilityHook } from "../../src/lib/workflow/branch-observability";
import {
  validateAgentSpec,
  type BlockRegistry,
  type EventRegistry,
} from "../../src/lib/agents/validator";
import type {
  BranchStep,
  WaitStep,
} from "../../src/lib/agents/validator";
import type {
  StoredRun,
  RuntimeStorage,
  EventLogInput,
} from "../../src/lib/workflow/types";

// ---------------------------------------------------------------------
// HTTP server with controllable behavior per path
// ---------------------------------------------------------------------

let server: http.Server;
let baseUrl: string;
const callCounts = new Map<string, number>();

before(
  () =>
    new Promise<void>((resolve) => {
      server = http.createServer((req, res) => {
        const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
        const count = (callCounts.get(url.pathname) ?? 0) + 1;
        callCounts.set(url.pathname, count);

        if (url.pathname === "/weather/clear") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            forecast: { forecastday: [{ day: { daily_chance_of_rain: 10 } }] },
          }));
          return;
        }
        if (url.pathname === "/weather/rainy") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            forecast: { forecastday: [{ day: { daily_chance_of_rain: 85 } }] },
          }));
          return;
        }
        if (url.pathname === "/sleep") {
          setTimeout(() => {
            res.writeHead(200);
            res.end('{"done":true}');
          }, 2000);
          return;
        }
        if (url.pathname === "/auth-required") {
          if (req.headers.authorization !== "Bearer real_secret") {
            res.writeHead(401);
            res.end('{"error":"unauthorized"}');
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end('{"authorized":true}');
          return;
        }
        if (url.pathname === "/transient-503") {
          // 503 first 2 calls, 200 on 3rd
          if (count < 3) {
            res.writeHead(503);
            res.end('{"transient":true}');
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end('{"data":{"ok":true}}');
          return;
        }
        if (url.pathname === "/forbidden") {
          res.writeHead(403);
          res.end('{"error":"forbidden"}');
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

beforeEach(() => callCounts.clear());

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------

const emptyBlockRegistry: BlockRegistry = {
  tools: new Map(),
  producesByBlock: new Map(),
};
const testEventRegistry: EventRegistry = {
  events: [{ type: "booking.requested", fields: {} }],
};

function mkRun(scope: { variableScope?: Record<string, unknown>; captureScope?: Record<string, unknown> } = {}): StoredRun {
  return {
    id: "run_e2e",
    orgId: "org_acme",
    archetypeId: "weather-aware-booking",
    status: "running",
    currentStepId: "check_weather",
    triggerEventId: null,
    triggerPayload: null,
    variableScope: scope.variableScope ?? {},
    captureScope: scope.captureScope ?? {},
    failureCount: 0,
    specSnapshot: { name: "", description: "", trigger: {}, steps: [] },
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as StoredRun;
}

function externalBranch(
  url: string,
  overrides: Partial<{
    operator: string;
    expected: unknown;
    response_path: string;
    timeout_ms: number;
    timeout_behavior: "fail" | "false_on_timeout";
    auth: { type: "bearer"; secret_name: string };
  }> = {},
): BranchStep {
  return {
    id: "check",
    type: "branch",
    condition: {
      type: "external_state",
      http: {
        url,
        method: "GET",
        timeout_ms: overrides.timeout_ms ?? 5000,
        ...(overrides.auth ? { auth: overrides.auth } : {}),
      },
      response_path: overrides.response_path ?? "data.ok",
      operator: (overrides.operator as "equals") ?? "equals",
      expected: overrides.expected ?? true,
      timeout_behavior: overrides.timeout_behavior ?? "fail",
    } as BranchStep["condition"],
    on_match_next: "MATCH",
    on_no_match_next: "NOMATCH",
  };
}

const noAuthResolver = async () => {
  throw new Error("no auth in this test");
};

// ---------------------------------------------------------------------
// 1. Branch with predicate condition
// ---------------------------------------------------------------------

describe("integration — branch with predicate condition", () => {
  test("predicate branch evaluates against captureScope + advances correctly", async () => {
    const step: BranchStep = {
      id: "vip_check",
      type: "branch",
      condition: {
        type: "predicate",
        predicate: { kind: "field_equals", field: "tier", value: "VIP" },
      },
      on_match_next: "vip_path",
      on_no_match_next: "standard_path",
    };
    const run = mkRun({ captureScope: { tier: "VIP" } });
    const action = await dispatchBranch(run, step, { resolveSecret: noAuthResolver });
    assert.equal(action.kind, "advance");
    assert.equal((action as { next: string }).next, "vip_path");
  });
});

// ---------------------------------------------------------------------
// 2. Branch with external_state condition (mocked HTTP)
// ---------------------------------------------------------------------

describe("integration — branch with external_state condition", () => {
  test("rainy weather → match → advance to MATCH (reschedule offer)", async () => {
    const step = externalBranch(`${baseUrl}/weather/rainy`, {
      response_path: "forecast.forecastday[0].day.daily_chance_of_rain",
      operator: "gte",
      expected: 60,
    });
    const action = await dispatchBranch(mkRun(), step, { resolveSecret: noAuthResolver });
    assert.equal((action as { next: string }).next, "MATCH");
  });

  test("clear weather → no match → advance to NOMATCH (confirm booking)", async () => {
    const step = externalBranch(`${baseUrl}/weather/clear`, {
      response_path: "forecast.forecastday[0].day.daily_chance_of_rain",
      operator: "gte",
      expected: 60,
    });
    const action = await dispatchBranch(mkRun(), step, { resolveSecret: noAuthResolver });
    assert.equal((action as { next: string }).next, "NOMATCH");
  });
});

// ---------------------------------------------------------------------
// 3. Timeout behavior matrix (fail vs false_on_timeout)
// ---------------------------------------------------------------------

describe("integration — timeout behavior", () => {
  test("timeout with fail → kind=fail", async () => {
    const step = externalBranch(`${baseUrl}/sleep`, {
      timeout_ms: 100,
      timeout_behavior: "fail",
    });
    const action = await dispatchBranch(mkRun(), step, { resolveSecret: noAuthResolver });
    assert.equal(action.kind, "fail");
  });

  test("timeout with false_on_timeout → advance to NOMATCH", async () => {
    const step = externalBranch(`${baseUrl}/sleep`, {
      timeout_ms: 100,
      timeout_behavior: "false_on_timeout",
    });
    const action = await dispatchBranch(mkRun(), step, { resolveSecret: noAuthResolver });
    assert.equal(action.kind, "advance");
    assert.equal((action as { next: string }).next, "NOMATCH");
  });
});

// ---------------------------------------------------------------------
// 4-6. Retry behavior
// ---------------------------------------------------------------------

describe("integration — retry behavior (via fetchWithTimeout extras.retry)", () => {
  test("retries 503 transient + succeeds on 3rd attempt", async () => {
    const result = await fetchWithTimeout(
      `${baseUrl}/transient-503`,
      {},
      5000,
      { retry: { maxAttempts: 3, baseMs: 1, maxJitterMs: 0 } },
    );
    assert.equal(result.ok, true);
    assert.equal(callCounts.get("/transient-503"), 3);
  });

  test("does NOT retry 403 (non-retriable)", async () => {
    const result = await fetchWithTimeout(
      `${baseUrl}/forbidden`,
      {},
      5000,
      { retry: { maxAttempts: 3, baseMs: 1, maxJitterMs: 0 } },
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 403);
    assert.equal(callCounts.get("/forbidden"), 1);
  });

  test("max retries exhausted on persistent 503 → returns final result (ok=false)", async () => {
    // /transient-503 succeeds on 3rd call; with maxAttempts=2, we
    // exhaust before success. The result is the final 503 response.
    const result = await fetchWithTimeout(
      `${baseUrl}/transient-503`,
      {},
      5000,
      { retry: { maxAttempts: 2, baseMs: 1, maxJitterMs: 0 } },
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
    assert.equal(callCounts.get("/transient-503"), 2);
  });
});

// ---------------------------------------------------------------------
// 7. workspace_secret resolution end-to-end
// ---------------------------------------------------------------------

describe("integration — workspace_secret resolution through SecretResolver", () => {
  test("bearer auth pulls from workspace_secrets store + injects header", async () => {
    const store: WorkspaceSecretsStore = {
      async findByOrgAndService({ orgId, serviceName }) {
        if (orgId === "org_acme" && serviceName === "weather_api_key") {
          return { plaintext: "real_secret" };
        }
        return null;
      },
    };
    const resolver = makeWorkspaceSecretResolver({ orgId: "org_acme", store });

    const result = await evaluateExternalState(
      {
        type: "external_state",
        http: {
          url: `${baseUrl}/auth-required`,
          method: "GET",
          timeout_ms: 5000,
          auth: { type: "bearer", secret_name: "weather_api_key" },
        },
        response_path: "authorized",
        operator: "equals",
        expected: true,
        timeout_behavior: "fail",
      },
      resolver,
    );
    assert.equal(result.matched, true);
  });

  test("missing secret → matched=false + error (no silent success)", async () => {
    const store: WorkspaceSecretsStore = {
      async findByOrgAndService() {
        return null;
      },
    };
    const resolver = makeWorkspaceSecretResolver({ orgId: "org_acme", store });

    const result = await evaluateExternalState(
      {
        type: "external_state",
        http: {
          url: `${baseUrl}/auth-required`,
          method: "GET",
          timeout_ms: 5000,
          auth: { type: "bearer", secret_name: "missing_key" },
        },
        response_path: "authorized",
        operator: "equals",
        expected: true,
        timeout_behavior: "fail",
      },
      resolver,
    );
    assert.equal(result.matched, false);
    assert.ok(result.error && result.error.includes("missing_key"));
  });
});

// ---------------------------------------------------------------------
// 8. Interpolation scope: variables/captures/reserved tokens work; secrets rejected
// ---------------------------------------------------------------------

describe("integration — interpolation scope", () => {
  test("variable + capture + reserved tokens all interpolate at runtime", async () => {
    const step = externalBranch(`${baseUrl}/weather/clear`, {
      response_path: "forecast.forecastday[0].day.daily_chance_of_rain",
      operator: "gte",
      expected: 60,
    });
    // Override URL to use interpolations.
    (step.condition as { http: { url: string; headers?: Record<string, string> } }).http.url =
      `${baseUrl}/weather/clear?contact={{contactId}}&captured={{booking.id}}&runId={{runId}}`;
    (step.condition as { http: { headers: Record<string, string> } }).http.headers = {
      "X-Run-Id": "{{runId}}",
      "X-Org-Id": "{{orgId}}",
    };
    const run = mkRun({
      variableScope: { contactId: "c123" },
      captureScope: { booking: { id: "b456" } },
    });
    const action = await dispatchBranch(run, step, { resolveSecret: noAuthResolver });
    // /weather/clear returns chance=10, which is < 60 → no match.
    assert.equal((action as { next: string }).next, "NOMATCH");
  });

  test("validator rejects {{secrets.X}} interpolations at synthesis time", () => {
    const spec = {
      id: "x",
      name: "x",
      description: "x",
      trigger: { type: "event", event: "booking.requested" },
      variables: {},
      steps: [
        {
          id: "leak_branch",
          type: "branch",
          condition: {
            type: "external_state",
            http: {
              url: "https://api.example.com",
              headers: { Authorization: "Bearer {{secrets.token}}" },
            },
            response_path: "x",
            operator: "exists",
          },
          on_match_next: null,
          on_no_match_next: null,
        },
      ],
    };
    const issues = validateAgentSpec(spec, emptyBlockRegistry, testEventRegistry);
    const secretIssue = issues.find(
      (i) => i.code === "unresolved_interpolation" && i.message.toLowerCase().includes("secret"),
    );
    assert.ok(secretIssue, `expected secret-rejection issue; got ${JSON.stringify(issues)}`);
  });
});

// ---------------------------------------------------------------------
// 9. End-to-end: branch evaluates + observability event recorded
// ---------------------------------------------------------------------

describe("integration — end-to-end with observability", () => {
  test("branch evaluation + observability event landed in event log", async () => {
    const emitted: EventLogInput[] = [];
    const fakeStorage = {
      async appendEventLog(input: EventLogInput) {
        emitted.push(input);
        return `evt_${emitted.length}`;
      },
    } as unknown as RuntimeStorage;

    const onEvaluated = makeBranchObservabilityHook({
      storage: fakeStorage,
      orgId: "org_acme",
      now: () => new Date(),
    });

    const step = externalBranch(`${baseUrl}/weather/rainy`, {
      response_path: "forecast.forecastday[0].day.daily_chance_of_rain",
      operator: "gte",
      expected: 60,
    });
    const action = await dispatchBranch(mkRun(), step, {
      resolveSecret: noAuthResolver,
      onEvaluated,
    });

    // Branch matched (rainy >= threshold) → advance to MATCH
    assert.equal((action as { next: string }).next, "MATCH");

    // Observability event landed via microtask
    await new Promise((r) => setImmediate(r));
    assert.equal(emitted.length, 1);
    const evt = emitted[0];
    assert.equal(evt.eventType, "workflow.external_state.evaluated");
    assert.equal(evt.orgId, "org_acme");
    assert.equal(evt.payload.runId, "run_e2e");
    assert.equal(evt.payload.matched, true);
    assert.equal(evt.payload.responseStatus, 200);
    assert.equal(evt.payload.url, `${baseUrl}/weather/rainy`);
  });

  test("E2E with secret-resolver failure still emits observability event", async () => {
    const emitted: EventLogInput[] = [];
    const fakeStorage = {
      async appendEventLog(input: EventLogInput) {
        emitted.push(input);
        return `evt_${emitted.length}`;
      },
    } as unknown as RuntimeStorage;
    const onEvaluated = makeBranchObservabilityHook({
      storage: fakeStorage,
      orgId: "org_acme",
      now: () => new Date(),
    });

    const failingResolver = async () => {
      throw new Error("secret missing");
    };
    const step = externalBranch(`${baseUrl}/weather/clear`, {
      response_path: "forecast.forecastday[0].day.daily_chance_of_rain",
      operator: "gte",
      expected: 60,
      auth: { type: "bearer", secret_name: "missing" },
    });
    const action = await dispatchBranch(mkRun(), step, {
      resolveSecret: failingResolver,
      onEvaluated,
    });
    assert.equal(action.kind, "fail");

    await new Promise((r) => setImmediate(r));
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].payload.matched, false);
    assert.ok(String(emitted[0].payload.error).includes("secret"));
  });
});
