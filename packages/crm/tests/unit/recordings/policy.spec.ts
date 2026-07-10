import { test } from "node:test";
import assert from "node:assert/strict";
import { isRecordToAgentOn, MAX_RECORDINGS_PER_SESSION } from "@/lib/recordings/policy";

test("on only when strictly '1'", () => {
  assert.equal(isRecordToAgentOn({ SF_RECORD_TO_AGENT: "1" }), true);
  assert.equal(isRecordToAgentOn({ SF_RECORD_TO_AGENT: "true" }), false);
  assert.equal(isRecordToAgentOn({ SF_RECORD_TO_AGENT: undefined }), false);
  assert.equal(isRecordToAgentOn({}), false);
});
test("limits are sane", () => { assert.equal(MAX_RECORDINGS_PER_SESSION, 6); });
