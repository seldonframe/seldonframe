// evaluateExternalState — runtime that resolves auth, fetches the
// URL via fetchWithTimeout, extracts the response path, applies the
// operator, and returns a structured match result.
//
// SLICE 6 PR 1 C4 per audit §4.3.
//
// Pure-function orchestrator (no DB access here). The caller
// (dispatchBranch in C5) supplies a SecretResolver closure bound to
// the workspace's orgId + Drizzle DB. Keeping this file DB-free
// makes it test-harness-friendly: tests pass a mock SecretResolver
// and a local HTTP server.

import { fetchWithTimeout, extractResponsePath } from "./http";

// ---------------------------------------------------------------------
// Types — mirror the Zod schemas in lib/agents/validator.ts but
// expressed as TS types for the runtime. Keeping them local avoids a
// dependency on the validator module (which imports Zod + lots of
// unrelated schemas).
// ---------------------------------------------------------------------

export type ExternalStateOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "exists"
  | "truthy";

export type AuthConfig =
  | { type: "none" }
  | { type: "bearer"; secret_name: string }
  | { type: "header"; header_name: string; secret_name: string };

export type HttpRequestConfig = {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: string;
  auth?: AuthConfig;
  timeout_ms?: number;
};

export type ExternalStateCondition = {
  type: "external_state";
  http: HttpRequestConfig;
  response_path: string;
  operator: ExternalStateOperator;
  expected?: unknown;
  timeout_behavior?: "fail" | "false_on_timeout";
};

export type EvaluationResult = {
  matched: boolean;
  responseStatus?: number;
  elapsedMs: number;
  error?: string;
};

/**
 * Resolves a `secret_name` to its plaintext value. Caller-provided;
 * typically a closure over (orgId, db) that queries workspace_secrets
 * + decrypts. Thrown errors surface as an evaluation error.
 */
export type SecretResolver = (secretName: string) => Promise<string>;

// ---------------------------------------------------------------------
// applyOperator — pure logic, exported for unit testing
// ---------------------------------------------------------------------

export function applyOperator(
  op: ExternalStateOperator,
  actual: unknown,
  expected: unknown,
): boolean {
  switch (op) {
    case "equals":
      return actual === expected;
    case "not_equals":
      return actual !== expected;
    case "contains":
      if (typeof actual === "string") return typeof expected === "string" && actual.includes(expected);
      if (Array.isArray(actual)) return actual.includes(expected as unknown);
      return false;
    case "gt":
    case "lt":
    case "gte":
    case "lte": {
      if (typeof actual !== "number" || typeof expected !== "number") return false;
      switch (op) {
        case "gt": return actual > expected;
        case "lt": return actual < expected;
        case "gte": return actual >= expected;
        case "lte": return actual <= expected;
      }
      return false;
    }
    case "exists":
      return actual !== undefined && actual !== null;
    case "truthy":
      return Boolean(actual);
  }
}

// ---------------------------------------------------------------------
// evaluateExternalState
// ---------------------------------------------------------------------

export async function evaluateExternalState(
  condition: ExternalStateCondition,
  resolveSecret: SecretResolver,
): Promise<EvaluationResult> {
  const startedAt = Date.now();

  // Resolve auth → construct final headers
  let headers: Record<string, string> = { ...(condition.http.headers ?? {}) };
  if (condition.http.auth && condition.http.auth.type !== "none") {
    try {
      const secret = await resolveSecret(condition.http.auth.secret_name);
      if (condition.http.auth.type === "bearer") {
        headers["Authorization"] = `Bearer ${secret}`;
      } else if (condition.http.auth.type === "header") {
        headers[condition.http.auth.header_name] = secret;
      }
    } catch (err) {
      return {
        matched: false,
        elapsedMs: Date.now() - startedAt,
        error: `secret resolution failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Build query-string URL
  let url = condition.http.url;
  if (condition.http.query && Object.keys(condition.http.query).length > 0) {
    const qs = new URLSearchParams(condition.http.query).toString();
    url += (url.includes("?") ? "&" : "?") + qs;
  }

  // Fire the request
  let status: number | undefined;
  let body: unknown;
  try {
    const result = await fetchWithTimeout(
      url,
      {
        method: condition.http.method ?? "GET",
        headers,
        body: condition.http.body,
      },
      condition.http.timeout_ms ?? 5000,
    );
    status = result.status;
    body = result.body;
    if (!result.ok) {
      return {
        matched: false,
        responseStatus: status,
        elapsedMs: Date.now() - startedAt,
        error: `http ${status} response`,
      };
    }
  } catch (err) {
    const cause = (err as { cause?: string }).cause;
    const msg = err instanceof Error ? err.message : String(err);
    // Timeout with false_on_timeout: explicitly convert to a clean
    // matched=false outcome, NOT an error.
    if (cause === "timeout" && condition.timeout_behavior === "false_on_timeout") {
      return {
        matched: false,
        elapsedMs: Date.now() - startedAt,
        // intentionally no error — condition simply evaluated to false
      };
    }
    return {
      matched: false,
      elapsedMs: Date.now() - startedAt,
      error: `${cause ?? "network"}: ${msg}`,
    };
  }

  // Extract + evaluate
  const actual = extractResponsePath(body, condition.response_path);
  const matched = applyOperator(condition.operator, actual, condition.expected);

  return {
    matched,
    responseStatus: status,
    elapsedMs: Date.now() - startedAt,
  };
}
