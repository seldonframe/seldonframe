// Tests for evaluateExternalState — runtime that fetches + extracts +
// applies operator. SLICE 6 PR 1 C4 per audit §4.3.

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

import {
  evaluateExternalState,
  applyOperator,
  type SecretResolver,
} from "../../src/lib/workflow/external-state-evaluator";
import type { ExternalStateCondition } from "../../src/lib/workflow/external-state-evaluator";

// ---------------------------------------------------------------------
// applyOperator — pure logic
// ---------------------------------------------------------------------

describe("applyOperator", () => {
  test("equals — primitive equality", () => {
    assert.equal(applyOperator("equals", "ok", "ok"), true);
    assert.equal(applyOperator("equals", "ok", "not_ok"), false);
    assert.equal(applyOperator("equals", 42, 42), true);
    assert.equal(applyOperator("equals", true, true), true);
  });

  test("not_equals", () => {
    assert.equal(applyOperator("not_equals", "ok", "not_ok"), true);
    assert.equal(applyOperator("not_equals", "ok", "ok"), false);
  });

  test("contains — string substring", () => {
    assert.equal(applyOperator("contains", "hello world", "world"), true);
    assert.equal(applyOperator("contains", "hello", "world"), false);
  });

  test("contains — array membership", () => {
    assert.equal(applyOperator("contains", ["a", "b", "c"], "b"), true);
    assert.equal(applyOperator("contains", ["a", "b"], "z"), false);
  });

  test("gt / gte / lt / lte — numeric comparison", () => {
    assert.equal(applyOperator("gt", 10, 5), true);
    assert.equal(applyOperator("gt", 5, 10), false);
    assert.equal(applyOperator("gte", 10, 10), true);
    assert.equal(applyOperator("lt", 3, 10), true);
    assert.equal(applyOperator("lte", 10, 10), true);
  });

  test("gt with non-number operand returns false (type mismatch)", () => {
    assert.equal(applyOperator("gt", "not-a-number", 5), false);
    assert.equal(applyOperator("gt", 10, "not-a-number"), false);
  });

  test("exists — true when value is NOT undefined/null", () => {
    assert.equal(applyOperator("exists", "x", undefined), true);
    assert.equal(applyOperator("exists", 0, undefined), true); // zero exists
    assert.equal(applyOperator("exists", false, undefined), true); // false exists
    assert.equal(applyOperator("exists", "", undefined), true); // empty string exists
    assert.equal(applyOperator("exists", undefined, undefined), false);
    assert.equal(applyOperator("exists", null, undefined), false);
  });

  test("truthy — JS truthiness", () => {
    assert.equal(applyOperator("truthy", "hello", undefined), true);
    assert.equal(applyOperator("truthy", 1, undefined), true);
    assert.equal(applyOperator("truthy", true, undefined), true);
    assert.equal(applyOperator("truthy", 0, undefined), false);
    assert.equal(applyOperator("truthy", "", undefined), false);
    assert.equal(applyOperator("truthy", null, undefined), false);
    assert.equal(applyOperator("truthy", undefined, undefined), false);
  });
});

// ---------------------------------------------------------------------
// evaluateExternalState — end-to-end via local HTTP server
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
        if (url.pathname === "/check-auth") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            authorization: req.headers.authorization ?? null,
            custom: req.headers["x-api-key"] ?? null,
          }));
          return;
        }
        if (url.pathname === "/sleep") {
          setTimeout(() => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end('{"done":true}');
          }, 2000);
          return;
        }
        if (url.pathname === "/500") {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end('{"error":"server"}');
          return;
        }
        res.writeHead(404);
        res.end();
      });
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    }),
);

after(
  () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
    }),
);

const noAuthResolver: SecretResolver = async () => {
  throw new Error("no secret resolver configured");
};

function baseCondition(
  overrides: Partial<ExternalStateCondition> = {},
): ExternalStateCondition {
  return {
    type: "external_state",
    http: { url: `${baseUrl}/status`, method: "GET", timeout_ms: 5000 },
    response_path: "status",
    operator: "equals",
    expected: "active",
    timeout_behavior: "fail",
    ...overrides,
  };
}

describe("evaluateExternalState — happy path match", () => {
  test("matched=true when response_path + operator match", async () => {
    const result = await evaluateExternalState(baseCondition(), noAuthResolver);
    assert.equal(result.matched, true);
    assert.equal(result.responseStatus, 200);
    assert.ok(result.elapsedMs >= 0);
    assert.equal(result.error, undefined);
  });

  test("matched=false when operator returns false", async () => {
    const result = await evaluateExternalState(
      baseCondition({ expected: "not_active" }),
      noAuthResolver,
    );
    assert.equal(result.matched, false);
    assert.equal(result.responseStatus, 200);
    assert.equal(result.error, undefined);
  });

  test("exists operator with found value", async () => {
    const result = await evaluateExternalState(
      baseCondition({ operator: "exists", expected: undefined, response_path: "tier" }),
      noAuthResolver,
    );
    assert.equal(result.matched, true);
  });

  test("exists operator with missing path", async () => {
    const result = await evaluateExternalState(
      baseCondition({ operator: "exists", expected: undefined, response_path: "nonexistent" }),
      noAuthResolver,
    );
    assert.equal(result.matched, false);
  });

  test("gt operator with count > 10", async () => {
    const result = await evaluateExternalState(
      baseCondition({ response_path: "count", operator: "gt", expected: 10 }),
      noAuthResolver,
    );
    assert.equal(result.matched, true);
  });
});

describe("evaluateExternalState — auth resolution", () => {
  test("bearer auth injects Authorization header", async () => {
    const resolver: SecretResolver = async (secretName) => {
      assert.equal(secretName, "my_api_key");
      return "super_secret_token";
    };
    const result = await evaluateExternalState(
      {
        type: "external_state",
        http: {
          url: `${baseUrl}/check-auth`,
          method: "GET",
          timeout_ms: 5000,
          auth: { type: "bearer", secret_name: "my_api_key" },
        },
        response_path: "authorization",
        operator: "equals",
        expected: "Bearer super_secret_token",
        timeout_behavior: "fail",
      },
      resolver,
    );
    assert.equal(result.matched, true);
  });

  test("header auth injects the configured header", async () => {
    const resolver: SecretResolver = async () => "custom_token";
    const result = await evaluateExternalState(
      {
        type: "external_state",
        http: {
          url: `${baseUrl}/check-auth`,
          method: "GET",
          timeout_ms: 5000,
          auth: { type: "header", header_name: "X-Api-Key", secret_name: "s" },
        },
        response_path: "custom",
        operator: "equals",
        expected: "custom_token",
        timeout_behavior: "fail",
      },
      resolver,
    );
    assert.equal(result.matched, true);
  });

  test("secret resolver failure → error result (branch fails)", async () => {
    const badResolver: SecretResolver = async () => {
      throw new Error("secret not found");
    };
    const result = await evaluateExternalState(
      {
        type: "external_state",
        http: {
          url: `${baseUrl}/status`,
          method: "GET",
          timeout_ms: 5000,
          auth: { type: "bearer", secret_name: "missing" },
        },
        response_path: "status",
        operator: "equals",
        expected: "active",
        timeout_behavior: "fail",
      },
      badResolver,
    );
    assert.equal(result.matched, false);
    assert.ok(result.error && result.error.includes("secret"));
  });
});

describe("evaluateExternalState — error handling", () => {
  test("5xx response → matched=false + error recorded", async () => {
    const result = await evaluateExternalState(
      baseCondition({ http: { url: `${baseUrl}/500`, method: "GET", timeout_ms: 5000 } }),
      noAuthResolver,
    );
    assert.equal(result.matched, false);
    assert.equal(result.responseStatus, 500);
    assert.ok(result.error && result.error.toLowerCase().includes("http"));
  });

  test("timeout with timeout_behavior='fail' → matched=false + error", async () => {
    const result = await evaluateExternalState(
      baseCondition({
        http: { url: `${baseUrl}/sleep`, method: "GET", timeout_ms: 100 },
        timeout_behavior: "fail",
      }),
      noAuthResolver,
    );
    assert.equal(result.matched, false);
    assert.ok(result.error && result.error.toLowerCase().includes("timeout"));
  });

  test("timeout with timeout_behavior='false_on_timeout' → matched=false + NO error", async () => {
    const result = await evaluateExternalState(
      baseCondition({
        http: { url: `${baseUrl}/sleep`, method: "GET", timeout_ms: 100 },
        timeout_behavior: "false_on_timeout",
      }),
      noAuthResolver,
    );
    assert.equal(result.matched, false);
    // timeout_behavior=false_on_timeout explicitly converts the
    // timeout into a clean "condition false" outcome, NOT an error.
    assert.equal(result.error, undefined);
  });

  test("network failure (connection refused) → matched=false + error", async () => {
    const result = await evaluateExternalState(
      baseCondition({ http: { url: "http://127.0.0.1:1", method: "GET", timeout_ms: 1000 } }),
      noAuthResolver,
    );
    assert.equal(result.matched, false);
    assert.ok(result.error);
  });

  test("path not found → matched=false (no error for exists; error for equals)", async () => {
    // exists with missing path → matched=false (no error; predicate
    // evaluated as "value does not exist")
    const existsResult = await evaluateExternalState(
      baseCondition({ operator: "exists", expected: undefined, response_path: "not_a_field" }),
      noAuthResolver,
    );
    assert.equal(existsResult.matched, false);
    assert.equal(existsResult.error, undefined);

    // equals with missing path → matched=false (value is undefined
    // which !== expected)
    const equalsResult = await evaluateExternalState(
      baseCondition({ response_path: "not_a_field" }),
      noAuthResolver,
    );
    assert.equal(equalsResult.matched, false);
    assert.equal(equalsResult.error, undefined);
  });
});
