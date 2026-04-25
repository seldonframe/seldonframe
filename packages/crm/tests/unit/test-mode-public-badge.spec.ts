// Tests for TestModePublicBadge.
// SLICE 8 C6 per audit §5.3 + gate G-8-3 (Option B).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { TestModePublicBadge } from "../../src/components/layout/test-mode-public-badge";

describe("TestModePublicBadge — render gating", () => {
  test("returns null when testMode=false", () => {
    assert.equal(TestModePublicBadge({ testMode: false }), null);
  });

  test("returns a React element when testMode=true", () => {
    const result = TestModePublicBadge({ testMode: true });
    assert.notEqual(result, null);
    assert.equal(typeof result, "object");
  });

  test("badge has 'Demo / Test environment' copy", () => {
    const result = TestModePublicBadge({ testMode: true }) as {
      props: { children?: unknown };
    } | null;
    assert.ok(result);
    assert.match(String(result!.props.children), /Demo \/ Test environment/);
  });
});
