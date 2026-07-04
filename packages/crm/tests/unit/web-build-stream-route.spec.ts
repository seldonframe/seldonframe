import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveWebBuildGate } from "@/app/api/v1/web/build/stream/route";

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
