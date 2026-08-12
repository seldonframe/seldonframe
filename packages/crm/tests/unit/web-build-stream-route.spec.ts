import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveWebBuildGate } from "@/app/api/v1/web/build/stream/route";

test("flag off → not_found regardless of rate or url", async () => {
  const out = await resolveWebBuildGate(
    {},
    "1.2.3.4",
    async () => false,
    async () => true,
  );
  assert.deepEqual(out, { kind: "not_found" });
});

test("flag on + valid url + under limit → ok", async () => {
  const out = await resolveWebBuildGate(
    { SF_WEB_UNGATED_BUILD: "1" },
    "1.2.3.4",
    async () => true,
    async () => true,
  );
  assert.deepEqual(out, { kind: "ok" });
});

test("flag on + invalid url → invalid_url without ever consuming the rate limit", async () => {
  let rateCheckCalled = false;
  const out = await resolveWebBuildGate(
    { SF_WEB_UNGATED_BUILD: "1" },
    "1.2.3.4",
    async () => false,
    async () => {
      rateCheckCalled = true;
      return true;
    },
  );
  assert.deepEqual(out, { kind: "invalid_url" });
  assert.equal(
    rateCheckCalled,
    false,
    "a typo'd/unreachable URL must not burn one of the visitor's free daily builds",
  );
});

test("flag on + valid url + over limit → rate_limited", async () => {
  const out = await resolveWebBuildGate(
    { SF_WEB_UNGATED_BUILD: "1" },
    "1.2.3.4",
    async () => true,
    async () => false,
  );
  assert.deepEqual(out, { kind: "rate_limited" });
});
