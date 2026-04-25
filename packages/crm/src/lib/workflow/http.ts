// Workflow HTTP utility — `fetchWithTimeout` + `extractResponsePath`.
//
// SLICE 6 PR 1 C3 per audit §4.1 + G-6-2 + §12 (body cap).
//
// Design choices:
//   - Uses Node 20+ global `fetch` + `AbortController`. No external
//     dependency (per L-17 blocked-external-dep rule; Node's fetch is
//     already available).
//   - Returns structured result — never throws on HTTP errors (caller
//     inspects `ok` + `status`). Throws only on network / abort /
//     body-too-large failures with a `cause` tag for classification.
//   - 1MB response-body cap per audit §12 risk mitigation.
//   - Dotted response path extractor with array-index support per
//     G-6-1 A. Documented grammar: `field`, `field.nested`, `arr[0]`,
//     `field.arr[0].nested`. Negative indices + quoted keys NOT
//     supported in v1.

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

import { retryWithBackoff, classifyRetriable, type RetryOptions } from "./retry";

export type FetchResult = {
  ok: boolean;
  status: number;
  body: unknown;
  elapsedMs: number;
};

export type FetchOptions = {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
};

export type FetchCause = "timeout" | "network" | "body_too_large";

/** Retry + future extras. Omit the whole arg to get single-attempt semantics. */
export type FetchExtras = {
  retry?: RetryOptions;
};

const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1MB

// ---------------------------------------------------------------------
// fetchWithTimeout
// ---------------------------------------------------------------------

export async function fetchWithTimeout(
  url: string,
  options: FetchOptions,
  timeoutMs: number,
  extras?: FetchExtras,
): Promise<FetchResult> {
  if (!extras?.retry) {
    return fetchSingleAttempt(url, options, timeoutMs);
  }
  // With retry: the inner call throws on RETRIABLE HTTP responses so
  // retryWithBackoff can catch + classify. Non-retriable HTTP responses
  // return normally (caller inspects ok/status). After exhaustion,
  // the last HTTP response is returned (not re-thrown) so the caller
  // still sees ok=false + status.
  let lastHttpResult: FetchResult | null = null;
  try {
    return await retryWithBackoff(async () => {
      const result = await fetchSingleAttempt(url, options, timeoutMs);
      lastHttpResult = result;
      if (!result.ok) {
        const cls = classifyRetriable({ kind: "http", status: result.status });
        if (cls === "retriable") {
          // Throw to trigger retry; preserve shape for classifyError.
          throw Object.assign(new Error(`http ${result.status}`), {
            kind: "http",
            status: result.status,
          });
        }
      }
      return result;
    }, extras.retry);
  } catch (err) {
    // If the last observed state was a retriable HTTP response that
    // exhausted attempts, return it (not-ok but structured). Otherwise
    // the error was a thrown Error (network/timeout/body_too_large) —
    // re-throw so the caller can classify.
    const e = err as { kind?: string; status?: number };
    if (e.kind === "http" && typeof e.status === "number" && lastHttpResult !== null) {
      return lastHttpResult;
    }
    throw err;
  }
}

async function fetchSingleAttempt(
  url: string,
  options: FetchOptions,
  timeoutMs: number,
): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const e = err as { name?: string };
    if (e.name === "AbortError") {
      throw Object.assign(
        new Error(`fetch timed out after ${timeoutMs}ms: ${url}`),
        { cause: "timeout" as FetchCause },
      );
    }
    throw Object.assign(
      new Error(
        `fetch network error: ${err instanceof Error ? err.message : String(err)}`,
      ),
      { cause: "network" as FetchCause },
    );
  }
  clearTimeout(timer);

  // Read body with a 1MB cap. Stream-based read so we short-circuit
  // before buffering the whole response.
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        reader.cancel();
        throw Object.assign(
          new Error(
            `response body exceeded ${MAX_BODY_BYTES} byte cap (got ${totalBytes}+ bytes)`,
          ),
          { cause: "body_too_large" as FetchCause },
        );
      }
      chunks.push(value);
    }
  }

  const buffer = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(buffer);

  let body: unknown = text;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      // Not JSON — fall back to raw string body
      body = text;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
    elapsedMs: Date.now() - startedAt,
  };
}

// ---------------------------------------------------------------------
// extractResponsePath — dotted + array-index syntax
// ---------------------------------------------------------------------

/**
 * Grammar (G-6-1 A):
 *   segment  = keyName ( "[" digit+ "]" )*
 *   path     = segment ( "." segment )*
 * Examples:
 *   ""                           → input as-is
 *   "status"                     → input.status
 *   "data.user.tier"             → input.data.user.tier
 *   "items[0]"                   → input.items[0]
 *   "current.weather[0].main"    → input.current.weather[0].main
 *   "[1].id"                     → input[1].id (array at root)
 *   "grid[1][0]"                 → input.grid[1][0]
 *
 * Returns `undefined` on any missing segment or out-of-bounds index.
 * Negative indices + quoted keys are NOT supported.
 */
export function extractResponsePath(value: unknown, path: string): unknown {
  if (path === "") return value;
  const tokens = tokenizePath(path);
  if (!tokens) return undefined;
  let cursor: unknown = value;
  for (const token of tokens) {
    if (cursor === null || cursor === undefined) return undefined;
    if (typeof token === "number") {
      if (!Array.isArray(cursor)) return undefined;
      if (token < 0 || token >= cursor.length) return undefined;
      cursor = cursor[token];
    } else {
      if (typeof cursor !== "object" || Array.isArray(cursor)) return undefined;
      cursor = (cursor as Record<string, unknown>)[token];
    }
  }
  return cursor;
}

function tokenizePath(path: string): Array<string | number> | null {
  const tokens: Array<string | number> = [];
  let i = 0;
  while (i < path.length) {
    if (path[i] === ".") {
      i += 1;
      continue;
    }
    if (path[i] === "[") {
      const end = path.indexOf("]", i);
      if (end === -1) return null;
      const raw = path.slice(i + 1, end);
      if (!/^\d+$/.test(raw)) return null; // negative / non-digit rejected
      tokens.push(Number(raw));
      i = end + 1;
      continue;
    }
    // Read a key name up to next `.` or `[`
    let j = i;
    while (j < path.length && path[j] !== "." && path[j] !== "[") j += 1;
    if (j === i) return null;
    tokens.push(path.slice(i, j));
    i = j;
  }
  return tokens;
}
