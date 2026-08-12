import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveWebBuildGate } from "@/app/api/v1/web/build/stream/route";
import { WEB_BUILD_RATE_LIMITED_MESSAGE } from "@/lib/web-build/policy";

test("flag off → not_found regardless of rate", async () => {
  const out = await resolveWebBuildGate({}, "1.2.3.4", async () => true);
  assert.deepEqual(out, { kind: "not_found" });
});

test("flag on + under limit → ok", async () => {
  const out = await resolveWebBuildGate({ SF_WEB_UNGATED_BUILD: "1" }, "1.2.3.4", async () => true);
  assert.deepEqual(out, { kind: "ok" });
});

test("flag on + over limit → rate_limited", async () => {
  const out = await resolveWebBuildGate({ SF_WEB_UNGATED_BUILD: "1" }, "1.2.3.4", async () => false);
  assert.deepEqual(out, { kind: "rate_limited" });
});

// 2026-07-18 — honesty fix (persona-loop finding): the gate above counts
// every attempt against the cap, including ones that never produce a
// workspace (extraction_failed, invalid_url, credits_exhausted all run this
// same rateCheck before the build's outcome is known). The rate-limited
// copy must not claim the visitor "built" anything — only that they used up
// today's tries.
test("rate-limited copy doesn't claim a build happened", () => {
  assert.doesNotMatch(WEB_BUILD_RATE_LIMITED_MESSAGE, /built/i);
  assert.match(WEB_BUILD_RATE_LIMITED_MESSAGE, /sign up/i);
});
