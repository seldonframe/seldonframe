import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { isAgentLifecycleEnabled } from "@/lib/agents/lifecycle/policy";

describe("isAgentLifecycleEnabled", () => {
  test("strict '1' → true", () => {
    assert.equal(isAgentLifecycleEnabled({ SF_AGENT_LIFECYCLE: "1" }), true);
  });

  test("undefined → false", () => {
    assert.equal(isAgentLifecycleEnabled({}), false);
  });

  test("truthy-but-not-'1' strings never open the gate", () => {
    for (const v of ["true", "yes", "on", "TRUE", "01", " 1", "1 "]) {
      assert.equal(isAgentLifecycleEnabled({ SF_AGENT_LIFECYCLE: v }), false, `expected "${v}" to be false`);
    }
  });
});
