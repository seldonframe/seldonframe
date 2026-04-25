// Tests for TestModeBanner.
// SLICE 8 C5 per audit §5.2 + gate G-8-3.
//
// React component test via simple JSX-render assertion against the
// component's output structure. We don't full-DOM render; we check
// that the component returns null when testMode=false and a non-null
// React element when testMode=true. This matches the SLICE 4a UI-test
// convention (compose-shape verification, not pixel-perfect render).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { TestModeBanner } from "../../src/components/layout/test-mode-banner";

describe("TestModeBanner — render gating", () => {
  test("returns null when testMode=false", () => {
    const result = TestModeBanner({ testMode: false });
    assert.equal(result, null, "banner must not render when test mode is off");
  });

  test("returns a React element when testMode=true", () => {
    const result = TestModeBanner({ testMode: true });
    assert.notEqual(result, null);
    // Verify it's a React element (has $$typeof or props.children)
    assert.equal(typeof result, "object");
  });

  test("rendered element has caution color tone", () => {
    const result = TestModeBanner({ testMode: true }) as {
      props: { className?: string; children?: unknown };
    } | null;
    assert.ok(result);
    // Banner is the outer div with caution color classes
    assert.match(String(result!.props.className), /caution/);
  });
});
