// Distributed rate limiter. Prefers Upstash Redis (fixed-window counter via
// INCR+EXPIRE) when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set.
// Falls back to an in-process Map otherwise — correct for dev and single-instance
// deploys, under-counts (ie. lets through more than the cap) when Vercel spawns
// multiple function instances.
//
// Signature is async — callers must `await`. Existing call sites:
//   - packages/crm/src/app/api/v1/workspace/create/route.ts
//   - packages/crm/src/app/api/v1/seldon-it/route.ts
//   - packages/crm/src/app/api/v1/brain/query/route.ts
//   - packages/crm/src/app/api/v1/public/analyze-url/route.ts
//   - packages/crm/src/lib/api/guard.ts

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL?.trim() ?? "";
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ?? "";
const REDIS_ENABLED = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

const counters = new Map<string, { count: number; resetAt: number }>();

const KEY_PREFIX = "sf:ratelimit:";

type PipelineResult =
  | { result: number | string | null }
  | { error: string };

async function upstashPipeline(commands: unknown[][]): Promise<PipelineResult[]> {
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Upstash pipeline ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as PipelineResult[];
}

function inMemoryCheck(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const current = counters.get(key);
  if (!current || current.resetAt <= now) {
    counters.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

export async function checkRateLimit(
  key: string,
  limit = 120,
  windowMs = 60_000
): Promise<boolean> {
  if (!REDIS_ENABLED) {
    return inMemoryCheck(key, limit, windowMs);
  }

  const redisKey = `${KEY_PREFIX}${key}`;
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  try {
    // Fixed-window counter: INCR, EXPIRE NX (TTL set only on first creation
    // so ongoing INCRs within the window don't reset it).
    //
    // Failure mode: if EXPIRE NX fails network-side after INCR succeeds, the
    // key exists with no TTL. This self-heals on the next request — INCR runs,
    // EXPIRE NX sees no TTL, sets it. Worst case: a stuck counter persists for
    // a few extra seconds until the next rate-limit check on the same key.
    const [incrResult, expireResult] = await upstashPipeline([
      ["INCR", redisKey],
      ["EXPIRE", redisKey, windowSeconds, "NX"],
    ]);

    if ("error" in incrResult) {
      throw new Error(incrResult.error);
    }
    const count = typeof incrResult.result === "number" ? incrResult.result : Number(incrResult.result);
    if (!Number.isFinite(count)) {
      throw new Error(`Unexpected INCR result: ${JSON.stringify(incrResult)}`);
    }

    // If EXPIRE with NX failed on a fresh counter (shouldn't), we still have
    // data integrity — the key will expire naturally when a future INCR hits it.
    void expireResult;

    return count <= limit;
  } catch (error) {
    // Never let rate-limit errors take down the request path. Fall back to
    // in-memory for this call and log once.
    console.warn(
      `[rate-limit] Redis failed; falling back to in-memory: ${error instanceof Error ? error.message : String(error)}`
    );
    return inMemoryCheck(key, limit, windowMs);
  }
}

// Sync wrapper for call sites that cannot be async (none today, but keeps the
// door open without a second signature surface). Uses in-memory ONLY.
export function checkRateLimitInMemory(
  key: string,
  limit = 120,
  windowMs = 60_000
): boolean {
  return inMemoryCheck(key, limit, windowMs);
}

export function isRateLimiterDistributed(): boolean {
  return REDIS_ENABLED;
}
