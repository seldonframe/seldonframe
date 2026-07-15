// ChatGPT App MCP — the PURE build_workspace rate-limit plan.
//
// WHY subject-first: ChatGPT tool calls originate from OpenAI's SHARED server
// egress IPs, not the end user's IP. Under real traffic every ChatGPT user
// shares a handful of IPs, so the old 3/hour-per-IP limit collapsed the whole
// channel to ~3 builds/hour TOTAL. OpenAI sends _meta["openai/subject"] (an
// anonymized, stable per-user id) on tool calls exactly for rate limiting —
// so the strict allowance keys on the subject, and the IP stays only as a
// coarse backstop against subject-rotation from a single non-OpenAI IP
// (the subject is caller-supplied wire data, so it can be forged — but a
// forger burns their own IP's backstop, never another user's allowance).
//
// Calls WITHOUT a subject (direct/non-ChatGPT MCP callers hitting this public
// endpoint) keep TODAY'S strict per-IP keys — the same `anon-workspace-create`
// bucket the anonymous /api/v1/workspace/create route uses — so this change
// loosens nothing for anonymous direct traffic.
//
// Pure (no redis, no env, no I/O): returns the list of {key, limit, windowMs}
// checks for deps.ts to execute against checkRateLimit.

export type RateLimitCheck = {
  key: string;
  limit: number;
  windowMs: number;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** The strict per-ChatGPT-user allowance (mirrors the anonymous web route). */
export const SUBJECT_HOURLY_LIMIT = 3;
export const SUBJECT_DAILY_LIMIT = 10;

/** The coarse per-IP backstop when a subject is present. Must sit far above
 *  the per-subject cap: one OpenAI egress IP legitimately carries MANY users. */
export const IP_BACKSTOP_HOURLY_LIMIT = 60;
export const IP_BACKSTOP_DAILY_LIMIT = 200;

/**
 * The rate-limit checks to run before creating a workspace from the ChatGPT
 * MCP surface. ALL returned checks must pass (each check INCRs its window
 * counter via checkRateLimit).
 */
export function buildWorkspaceRateLimitChecks(
  ip: string,
  subject: string | undefined,
): RateLimitCheck[] {
  if (subject) {
    return [
      { key: `chatgpt-workspace-create:subject:hour:${subject}`, limit: SUBJECT_HOURLY_LIMIT, windowMs: HOUR_MS },
      { key: `chatgpt-workspace-create:subject:day:${subject}`, limit: SUBJECT_DAILY_LIMIT, windowMs: DAY_MS },
      { key: `chatgpt-workspace-create:ip:hour:${ip}`, limit: IP_BACKSTOP_HOURLY_LIMIT, windowMs: HOUR_MS },
      { key: `chatgpt-workspace-create:ip:day:${ip}`, limit: IP_BACKSTOP_DAILY_LIMIT, windowMs: DAY_MS },
    ];
  }
  // No subject → the pre-existing strict per-IP keys, deliberately SHARED with
  // the anonymous web route's bucket so a direct caller can't double-dip.
  return [
    { key: `anon-workspace-create:hour:${ip}`, limit: SUBJECT_HOURLY_LIMIT, windowMs: HOUR_MS },
    { key: `anon-workspace-create:day:${ip}`, limit: SUBJECT_DAILY_LIMIT, windowMs: DAY_MS },
  ];
}
