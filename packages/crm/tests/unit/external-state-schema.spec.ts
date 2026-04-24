// Tests for ExternalStateConditionSchema + HttpRequestConfigSchema +
// AuthConfigSchema + interpolation-scope validator.
// SLICE 6 PR 1 C2 per audit §3.2 + §3.3 + §3.4 + Max's additional
// specification (interpolation scope excludes secret paths).
//
// Cross-ref Zod validator commit — expect 2.5-3.0x multiplier per
// L-17 2-datapoint settled rule (now 3rd datapoint).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  validateAgentSpec,
  type BlockRegistry,
  type EventRegistry,
} from "../../src/lib/agents/validator";

const emptyBlockRegistry: BlockRegistry = {
  tools: new Map(),
  producesByBlock: new Map(),
};
const testEventRegistry: EventRegistry = {
  events: [{ type: "test.event", fields: {} }],
};

function branchSpec(condition: unknown): unknown {
  return {
    id: "test",
    name: "t",
    description: "t",
    trigger: { type: "event", event: "test.event" },
    variables: {},
    steps: [
      {
        id: "b",
        type: "branch",
        condition,
        on_match_next: null,
        on_no_match_next: null,
      },
    ],
  };
}

function issuesFor(condition: unknown) {
  return validateAgentSpec(
    branchSpec(condition),
    emptyBlockRegistry,
    testEventRegistry,
  );
}

// ---------------------------------------------------------------------
// 1. Happy-path external_state conditions
// ---------------------------------------------------------------------

describe("ExternalStateConditionSchema — happy paths", () => {
  test("minimal GET with equals operator", () => {
    const res = issuesFor({
      type: "external_state",
      http: { url: "https://api.example.com/status" },
      response_path: "status",
      operator: "equals",
      expected: "ok",
    });
    const relevant = res.filter(
      (i) => i.stepId === "b" || i.path.startsWith("steps.0"),
    );
    assert.equal(relevant.length, 0, `unexpected: ${JSON.stringify(relevant)}`);
  });

  test("POST with body + bearer auth", () => {
    const res = issuesFor({
      type: "external_state",
      http: {
        url: "https://api.example.com/query",
        method: "POST",
        body: '{"query":"x"}',
        headers: { "Content-Type": "application/json" },
        auth: { type: "bearer", secret_name: "my_api_key" },
        timeout_ms: 3000,
      },
      response_path: "data.result",
      operator: "contains",
      expected: "success",
      timeout_behavior: "fail",
    });
    const relevant = res.filter((i) => i.stepId === "b");
    // Note: the secret cross-ref emits unknown_secret at synthesis
    // time ONLY if the validator has registry context. Without a
    // secrets registry here, we just verify SCHEMA acceptance.
    const schemaIssues = relevant.filter((i) => i.code === "spec_malformed");
    assert.equal(schemaIssues.length, 0, `unexpected: ${JSON.stringify(schemaIssues)}`);
  });

  test("exists operator (no expected required)", () => {
    const res = issuesFor({
      type: "external_state",
      http: { url: "https://api.example.com" },
      response_path: "data",
      operator: "exists",
    });
    const relevant = res.filter((i) => i.stepId === "b" && i.code === "spec_malformed");
    assert.equal(relevant.length, 0);
  });

  test("truthy operator (no expected required)", () => {
    const res = issuesFor({
      type: "external_state",
      http: { url: "https://api.example.com" },
      response_path: "data.ok",
      operator: "truthy",
    });
    const relevant = res.filter((i) => i.stepId === "b" && i.code === "spec_malformed");
    assert.equal(relevant.length, 0);
  });

  test("timeout_behavior='false_on_timeout' accepted", () => {
    const res = issuesFor({
      type: "external_state",
      http: { url: "https://api.example.com" },
      response_path: "x",
      operator: "equals",
      expected: 1,
      timeout_behavior: "false_on_timeout",
    });
    const relevant = res.filter((i) => i.stepId === "b" && i.code === "spec_malformed");
    assert.equal(relevant.length, 0);
  });

  test("numeric operator (gt/lt) with number expected", () => {
    for (const op of ["gt", "lt", "gte", "lte"]) {
      const res = issuesFor({
        type: "external_state",
        http: { url: "https://api.example.com" },
        response_path: "count",
        operator: op,
        expected: 10,
      });
      const relevant = res.filter((i) => i.stepId === "b" && i.code === "spec_malformed");
      assert.equal(relevant.length, 0, `${op} should pass: ${JSON.stringify(relevant)}`);
    }
  });
});

// ---------------------------------------------------------------------
// 2. URL validation
// ---------------------------------------------------------------------

describe("HttpRequestConfigSchema — URL validation", () => {
  test("rejects malformed URL", () => {
    const res = issuesFor({
      type: "external_state",
      http: { url: "not-a-url" },
      response_path: "x",
      operator: "exists",
    });
    assert.ok(res.filter((i) => i.code === "spec_malformed").length > 0);
  });

  test("rejects missing URL field", () => {
    const res = issuesFor({
      type: "external_state",
      http: {},
      response_path: "x",
      operator: "exists",
    });
    assert.ok(res.filter((i) => i.code === "spec_malformed").length > 0);
  });

  test("accepts http:// and https:// schemes", () => {
    for (const url of ["http://example.com", "https://api.example.com/path?q=1"]) {
      const res = issuesFor({
        type: "external_state",
        http: { url },
        response_path: "x",
        operator: "exists",
      });
      const relevant = res.filter((i) => i.stepId === "b" && i.code === "spec_malformed");
      assert.equal(relevant.length, 0, `expected ${url} to pass`);
    }
  });
});

// ---------------------------------------------------------------------
// 3. Operator + expected cross-ref (superRefine)
// ---------------------------------------------------------------------

describe("ExternalStateConditionSchema — operator × expected cross-ref", () => {
  test("rejects equals without expected", () => {
    const res = issuesFor({
      type: "external_state",
      http: { url: "https://api.example.com" },
      response_path: "x",
      operator: "equals",
    });
    assert.ok(res.filter((i) => i.code === "spec_malformed").length > 0);
  });

  test("rejects gt without expected", () => {
    const res = issuesFor({
      type: "external_state",
      http: { url: "https://api.example.com" },
      response_path: "x",
      operator: "gt",
    });
    assert.ok(res.filter((i) => i.code === "spec_malformed").length > 0);
  });

  test("rejects unknown operator value", () => {
    const res = issuesFor({
      type: "external_state",
      http: { url: "https://api.example.com" },
      response_path: "x",
      operator: "startsWith",
      expected: "foo",
    });
    assert.ok(res.filter((i) => i.code === "spec_malformed").length > 0);
  });
});

// ---------------------------------------------------------------------
// 4. Timeout bounds
// ---------------------------------------------------------------------

describe("HttpRequestConfigSchema — timeout bounds (1s-30s)", () => {
  test("accepts 1000ms (min)", () => {
    const res = issuesFor({
      type: "external_state",
      http: { url: "https://api.example.com", timeout_ms: 1000 },
      response_path: "x",
      operator: "exists",
    });
    assert.equal(res.filter((i) => i.code === "spec_malformed" && i.stepId === "b").length, 0);
  });

  test("accepts 30000ms (max)", () => {
    const res = issuesFor({
      type: "external_state",
      http: { url: "https://api.example.com", timeout_ms: 30000 },
      response_path: "x",
      operator: "exists",
    });
    assert.equal(res.filter((i) => i.code === "spec_malformed" && i.stepId === "b").length, 0);
  });

  test("rejects below 1000ms", () => {
    const res = issuesFor({
      type: "external_state",
      http: { url: "https://api.example.com", timeout_ms: 500 },
      response_path: "x",
      operator: "exists",
    });
    assert.ok(res.filter((i) => i.code === "spec_malformed").length > 0);
  });

  test("rejects above 30000ms", () => {
    const res = issuesFor({
      type: "external_state",
      http: { url: "https://api.example.com", timeout_ms: 60000 },
      response_path: "x",
      operator: "exists",
    });
    assert.ok(res.filter((i) => i.code === "spec_malformed").length > 0);
  });
});

// ---------------------------------------------------------------------
// 5. AuthConfigSchema discriminator
// ---------------------------------------------------------------------

describe("AuthConfigSchema — discriminator variants", () => {
  test("accepts type='none'", () => {
    const res = issuesFor({
      type: "external_state",
      http: {
        url: "https://api.example.com",
        auth: { type: "none" },
      },
      response_path: "x",
      operator: "exists",
    });
    assert.equal(res.filter((i) => i.code === "spec_malformed" && i.stepId === "b").length, 0);
  });

  test("accepts type='bearer' with secret_name", () => {
    const res = issuesFor({
      type: "external_state",
      http: {
        url: "https://api.example.com",
        auth: { type: "bearer", secret_name: "my_api" },
      },
      response_path: "x",
      operator: "exists",
    });
    assert.equal(res.filter((i) => i.code === "spec_malformed" && i.stepId === "b").length, 0);
  });

  test("accepts type='header' with header_name + secret_name", () => {
    const res = issuesFor({
      type: "external_state",
      http: {
        url: "https://api.example.com",
        auth: { type: "header", header_name: "X-Api-Key", secret_name: "my_api" },
      },
      response_path: "x",
      operator: "exists",
    });
    assert.equal(res.filter((i) => i.code === "spec_malformed" && i.stepId === "b").length, 0);
  });

  test("rejects bearer without secret_name", () => {
    const res = issuesFor({
      type: "external_state",
      http: {
        url: "https://api.example.com",
        auth: { type: "bearer" },
      },
      response_path: "x",
      operator: "exists",
    });
    assert.ok(res.filter((i) => i.code === "spec_malformed").length > 0);
  });

  test("rejects header without header_name", () => {
    const res = issuesFor({
      type: "external_state",
      http: {
        url: "https://api.example.com",
        auth: { type: "header", secret_name: "my_api" },
      },
      response_path: "x",
      operator: "exists",
    });
    assert.ok(res.filter((i) => i.code === "spec_malformed").length > 0);
  });

  test("rejects unknown auth type", () => {
    const res = issuesFor({
      type: "external_state",
      http: {
        url: "https://api.example.com",
        auth: { type: "basic", username: "u", password: "p" },
      },
      response_path: "x",
      operator: "exists",
    });
    assert.ok(res.filter((i) => i.code === "spec_malformed").length > 0);
  });
});

// ---------------------------------------------------------------------
// 6. Interpolation-scope enforcement (Max's additional specification)
// ---------------------------------------------------------------------

describe("external_state interpolation scope — no secrets in interpolation", () => {
  test("rejects {{secrets.apiKey}} in url", () => {
    const res = issuesFor({
      type: "external_state",
      http: { url: "https://api.example.com?key={{secrets.apiKey}}" },
      response_path: "x",
      operator: "exists",
    });
    const issue = res.find((i) => i.code === "unresolved_interpolation" && i.message.toLowerCase().includes("secret"));
    assert.ok(issue, `expected interpolation-scope issue for secrets; got ${JSON.stringify(res)}`);
  });

  test("rejects {{secrets.X}} in headers value", () => {
    const res = issuesFor({
      type: "external_state",
      http: {
        url: "https://api.example.com",
        headers: { Authorization: "Bearer {{secrets.token}}" },
      },
      response_path: "x",
      operator: "exists",
    });
    const issue = res.find((i) => i.code === "unresolved_interpolation" && i.message.toLowerCase().includes("secret"));
    assert.ok(issue);
  });

  test("rejects {{secrets.X}} in body", () => {
    const res = issuesFor({
      type: "external_state",
      http: {
        url: "https://api.example.com",
        method: "POST",
        body: '{"key":"{{secrets.apiKey}}"}',
      },
      response_path: "x",
      operator: "exists",
    });
    const issue = res.find((i) => i.code === "unresolved_interpolation" && i.message.toLowerCase().includes("secret"));
    assert.ok(issue);
  });

  test("accepts {{contactId}} / {{runId}} / {{orgId}} / {{now}} in interpolation positions", () => {
    const res = issuesFor({
      type: "external_state",
      http: {
        url: "https://api.example.com/contacts/{{contactId}}",
        headers: { "X-Run-Id": "{{runId}}", "X-Org-Id": "{{orgId}}" },
      },
      response_path: "x",
      operator: "exists",
    });
    // contactId might surface as unresolved_interpolation (not in
    // variables scope) but NOT with a "secret" message. Filter
    // specifically: no "secret"-related rejections.
    const secretIssues = res.filter((i) => i.code === "unresolved_interpolation" && i.message.toLowerCase().includes("secret"));
    assert.equal(secretIssues.length, 0);
  });
});
