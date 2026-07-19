// packages/crm/tests/unit/web-onboarding/try-client.spec.tsx
//
// Bootstrap: the setup-dom import below MUST stay first — it mounts jsdom
// before React imports (same pattern as clients-new-form.spec.tsx).
//
// 2026-07-16 — credits_exhausted honesty fix. When the SSE error reason is
// credits_exhausted, retrying can never succeed until credits are added, so
// the /try error card must show the server's honest `message` and must NOT
// render a "Try again" button (which would imply retrying could work).
import "../../setup-dom";

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import React from "react";

import { TryClient } from "../../../src/app/(public)/try/try-client";

// Lightweight EventSource stub (mirrors clients-new-form.spec.tsx).
type Listener = (e: { data: string }) => void;
class FakeEventSource {
  static last: FakeEventSource | null = null;
  listeners: Record<string, Listener[]> = {};
  url: string;
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.last = this;
  }
  addEventListener(event: string, fn: Listener) {
    (this.listeners[event] ??= []).push(fn);
  }
  removeEventListener(event: string, fn: Listener) {
    const list = this.listeners[event];
    if (!list) return;
    this.listeners[event] = list.filter((l) => l !== fn);
  }
  close() {
    this.closed = true;
  }
  fire(event: string, data: unknown) {
    for (const fn of this.listeners[event] ?? []) fn({ data: JSON.stringify(data) });
  }
}

function installFakeEventSource() {
  (globalThis as unknown as { EventSource: typeof FakeEventSource }).EventSource = FakeEventSource;
  FakeEventSource.last = null;
}

function submitUrl(value: string) {
  const input = screen.getByLabelText("Your website URL");
  fireEvent.change(input, { target: { value } });
  fireEvent.click(screen.getByText("Build it"));
}

describe("TryClient — SSE error honesty", () => {
  beforeEach(() => {
    installFakeEventSource();
  });

  afterEach(() => {
    cleanup();
  });

  test("credits_exhausted error shows the server message and NO 'Try again' button", async () => {
    render(<TryClient initialUrl="" />);
    await act(async () => {
      submitUrl("https://flowtechac.com");
    });

    const message =
      "The AI account powering this build is out of credits, so retrying won't help right now.";
    await act(async () => {
      FakeEventSource.last!.fire("error", {
        code: 422,
        reason: "credits_exhausted",
        message,
      });
    });

    assert.ok(screen.queryAllByText(message).length > 0, "honest server message must be shown");
    assert.equal(
      screen.queryAllByText("Try again").length,
      0,
      "credits_exhausted is non-retryable — no Try again button",
    );
  });

  test("internal_error still shows the generic copy WITH a 'Try again' button", async () => {
    render(<TryClient initialUrl="" />);
    await act(async () => {
      submitUrl("https://acme.com");
    });

    await act(async () => {
      FakeEventSource.last!.fire("error", { code: 500, reason: "internal_error" });
    });

    assert.ok(
      screen.queryAllByText("Something broke on our end. Give it another try.").length > 0,
      "generic copy stays for genuinely transient errors",
    );
    assert.ok(
      screen.queryAllByText("Try again").length > 0,
      "transient errors keep the retry affordance",
    );
  });
});
