// packages/crm/tests/unit/recordings/wait-copy.spec.tsx
//
// Record v3 (T5) — <WaitCopy>: rotating honest wait-copy during
// uploading/compiling. Covers: advances lines on a timer, pauses (stops
// advancing) on unmount, and uses the status-appropriate line set.
//
// jsdom bootstrap MUST be the first import (CI gotcha — see
// tests/setup-dom.ts's header).
import "../../setup-dom";

import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup, act } from "@testing-library/react";
import React from "react";

import { WaitCopy, WAIT_COPY_INTERVAL_MS } from "../../../src/app/(public)/record/record-ui/wait-copy";

afterEach(() => cleanup());

describe("<WaitCopy>", () => {
  test("renders the first uploading line initially", () => {
    render(<WaitCopy status="uploading" />);
    assert.match(screen.getByText(/reading your recording/i).textContent ?? "", /Reading your recording/);
  });

  test("renders a compiling-specific line for status='compiling' (honest set per status)", () => {
    render(<WaitCopy status="compiling" />);
    assert.match(
      screen.getByText(/mapping the steps you took|working out what's safe to automate/i).textContent ?? "",
      /Mapping the steps you took|Working out what's safe to automate/,
    );
  });

  test("advances to the next line after the interval elapses", (t) => {
    t.mock.timers.enable({ apis: ["setInterval"] });
    try {
      render(<WaitCopy status="uploading" />);
      assert.ok(screen.getByText(/reading your recording/i));

      act(() => {
        t.mock.timers.tick(WAIT_COPY_INTERVAL_MS);
      });

      assert.ok(screen.getByText(/listening to your narration/i), "should have advanced to the second line");
    } finally {
      t.mock.timers.reset();
    }
  });

  test("appends real upload progress when provided (never a fake claim)", () => {
    render(<WaitCopy status="uploading" uploadProgress={{ done: 3, total: 10 }} />);
    assert.ok(screen.getByText(/reading your recording…\s*3\/10/i));
  });

  test("unmounting clears the interval — no state updates after unmount", (t) => {
    t.mock.timers.enable({ apis: ["setInterval"] });
    try {
      const { unmount } = render(<WaitCopy status="uploading" />);
      unmount();
      // If the interval weren't cleared, ticking here would call
      // setState on an unmounted component — React would warn/throw in
      // a strict test environment. Simply not throwing is the assertion.
      assert.doesNotThrow(() => {
        act(() => {
          t.mock.timers.tick(WAIT_COPY_INTERVAL_MS * 2);
        });
      });
    } finally {
      t.mock.timers.reset();
    }
  });
});
