import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { matchWorkspaceByPhoneNumber } from "../../../../src/lib/agents/voice/resolve-workspace-by-number";

const rows = [
  { id: "org-a", integrations: { twilio: { fromNumber: "+18335551234" } } },
  { id: "org-b", integrations: { twilio: { fromNumber: "(512) 555-0111" } } },
  { id: "org-c", integrations: {} },
];

describe("matchWorkspaceByPhoneNumber", () => {
  test("matches on normalized E.164", () => {
    assert.equal(matchWorkspaceByPhoneNumber("+18335551234", rows), "org-a");
  });
  test("normalizes the stored number before comparing", () => {
    assert.equal(matchWorkspaceByPhoneNumber("+15125550111", rows), "org-b");
  });
  test("returns null when nothing matches", () => {
    assert.equal(matchWorkspaceByPhoneNumber("+19998887777", rows), null);
  });
});
