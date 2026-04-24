// retryWithBackoff + classifyRetriable — transient-failure recovery
// for HTTP calls in branch evaluation.
//
// SLICE 6 PR 2 C2 per audit §4.5 + G-6-4 B.
//
// Policy (v1, fixed defaults):
//   maxAttempts = 3  (initial + 2 retries)
//   baseMs      = 200
//   multiplier  = 2x (exponential)
//   maxJitterMs = 50 (±50ms uniform)
//
// Retriable classification:
//   HTTP 429, 500, 502, 503, 504   → retriable
//   HTTP 4xx (400/401/403/404) etc → non-retriable
//   FetchCause "timeout" / "network" → retriable
//   FetchCause "body_too_large"     → non-retriable

// ---------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------

export type RetriableClass = "retriable" | "non_retriable";

export type ClassifyInput =
  | { kind: "http"; status: number }
  | { kind: "error"; cause: string | undefined };

const RETRIABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);

export function classifyRetriable(input: ClassifyInput): RetriableClass {
  if (input.kind === "http") {
    return RETRIABLE_HTTP_STATUSES.has(input.status) ? "retriable" : "non_retriable";
  }
  // error kind — timeout + network are retriable; body_too_large + unknown cause are not
  if (input.cause === "timeout" || input.cause === "network") return "retriable";
  return "non_retriable";
}

// ---------------------------------------------------------------------
// retryWithBackoff
// ---------------------------------------------------------------------

export type RetryOptions = {
  maxAttempts?: number;      // total attempts (initial + retries); default 3
  baseMs?: number;            // default 200
  multiplier?: number;        // default 2
  maxJitterMs?: number;       // default 50 (symmetric: ±maxJitterMs)
};

export type RetryableError = {
  status?: number;
  kind?: "http";
  cause?: string;
};

function classifyError(err: unknown): RetriableClass {
  if (err === null || err === undefined) return "non_retriable";
  const e = err as RetryableError;
  if (e.kind === "http" && typeof e.status === "number") {
    return classifyRetriable({ kind: "http", status: e.status });
  }
  if (typeof e.cause === "string") {
    return classifyRetriable({ kind: "error", cause: e.cause });
  }
  return "non_retriable";
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseMs = opts.baseMs ?? 200;
  const multiplier = opts.multiplier ?? 2;
  const maxJitterMs = opts.maxJitterMs ?? 50;

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (classifyError(err) === "non_retriable") throw err;
      if (attempt >= maxAttempts - 1) throw err;

      // Exponential backoff with symmetric jitter.
      const baseDelay = baseMs * Math.pow(multiplier, attempt);
      const jitter = maxJitterMs === 0 ? 0 : (Math.random() * 2 - 1) * maxJitterMs;
      const delay = Math.max(0, baseDelay + jitter);
      await sleep(delay);
    }
  }
  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
