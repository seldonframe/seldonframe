// ChatGPT App MCP — tests for the PURE build_workspace rate-limit plan.
//
// ChatGPT tool calls arrive from OpenAI's SHARED server egress IPs, so an
// IP-keyed 3/hour limit collapses the whole channel to ~3 builds/hour across
// ALL ChatGPT users. The plan keys the strict limit on _meta["openai/subject"]
// (OpenAI's anonymized per-user id, sent exactly for rate limiting) and keeps
// the IP only as a coarse backstop. The plan builder is pure (no redis, no
// env) — deps.ts executes it against checkRateLimit.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildWorkspaceRateLimitChecks,
  SUBJECT_HOURLY_LIMIT,
  SUBJECT_DAILY_LIMIT,
  IP_BACKSTOP_HOURLY_LIMIT,
  IP_BACKSTOP_DAILY_LIMIT,
} from "../../../src/lib/chatgpt-app/rate-limit-plan";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

describe("buildWorkspaceRateLimitChecks — subject present (a real ChatGPT call)", () => {
  const checks = buildWorkspaceRateLimitChecks("20.1.2.3", "sub_abc");

  test("strict 3/hr + 10/day limits key on the SUBJECT, not the IP", () => {
    const hourly = checks.find((c) => c.limit === SUBJECT_HOURLY_LIMIT);
    const daily = checks.find((c) => c.limit === SUBJECT_DAILY_LIMIT);
    assert.ok(hourly && daily, "both strict windows present");
    assert.equal(SUBJECT_HOURLY_LIMIT, 3);
    assert.equal(SUBJECT_DAILY_LIMIT, 10);
    assert.match(hourly!.key, /sub_abc/);
    assert.match(daily!.key, /sub_abc/);
    assert.doesNotMatch(hourly!.key, /20\.1\.2\.3/);
    assert.equal(hourly!.windowMs, HOUR_MS);
    assert.equal(daily!.windowMs, DAY_MS);
  });

  test("keeps a COARSE per-IP backstop (catches subject-rotation from one non-OpenAI IP)", () => {
    const ipChecks = checks.filter((c) => c.key.includes("20.1.2.3"));
    assert.ok(ipChecks.length >= 1, "an IP-keyed backstop must remain");
    const hourly = ipChecks.find((c) => c.windowMs === HOUR_MS);
    assert.ok(hourly);
    assert.equal(hourly!.limit, IP_BACKSTOP_HOURLY_LIMIT);
    assert.ok(
      IP_BACKSTOP_HOURLY_LIMIT >= 60,
      "backstop ceiling must be much higher than the per-subject cap",
    );
    const daily = ipChecks.find((c) => c.windowMs === DAY_MS);
    assert.ok(daily);
    assert.equal(daily!.limit, IP_BACKSTOP_DAILY_LIMIT);
  });

  test("two subjects on the same IP share the backstop keys but NOT the subject keys", () => {
    const a = buildWorkspaceRateLimitChecks("20.1.2.3", "sub_a");
    const b = buildWorkspaceRateLimitChecks("20.1.2.3", "sub_b");
    const subjectKeys = (cs: typeof a) => cs.filter((c) => c.limit === SUBJECT_HOURLY_LIMIT).map((c) => c.key);
    const ipKeys = (cs: typeof a) => cs.filter((c) => c.key.includes("20.1.2.3")).map((c) => c.key).sort();
    assert.notDeepEqual(subjectKeys(a), subjectKeys(b));
    assert.deepEqual(ipKeys(a), ipKeys(b));
  });
});

describe("buildWorkspaceRateLimitChecks — subject missing (a direct/non-ChatGPT caller)", () => {
  const checks = buildWorkspaceRateLimitChecks("9.9.9.9", undefined);

  test("falls back to TODAY'S strict per-IP keys — no loosening for anonymous direct callers", () => {
    assert.deepEqual(checks, [
      { key: "anon-workspace-create:hour:9.9.9.9", limit: 3, windowMs: HOUR_MS },
      { key: "anon-workspace-create:day:9.9.9.9", limit: 10, windowMs: DAY_MS },
    ]);
  });
});
