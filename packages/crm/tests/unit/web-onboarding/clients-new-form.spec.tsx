// packages/crm/tests/unit/web-onboarding/clients-new-form.spec.tsx
//
// Bootstrap: run with `node --import tsx --import ./tests/setup-dom.ts --test ...`
// (see packages/crm/tests/setup-dom.ts). jsdom mounts before React imports so
// the form's Input/Button primitives and the UpgradeModal Dialog have a real DOM.
//
// Query discipline: base-ui mirrors some content into SR-only nodes. Use
// queryAllByText for presence-only checks and getByRole / getByPlaceholderText
// for click/change targets (same pattern as upgrade-modal.spec.tsx).
import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import React from "react";

import { ClientsNewForm } from "../../../src/app/(dashboard)/clients/new/clients-new-form";

// Lightweight EventSource stub. The form constructs `new EventSource(url)`;
// we intercept globally so tests can drive the event stream.
type Listener = (e: { data: string }) => void;
class FakeEventSource {
  static last: FakeEventSource | null = null;
  static instances: FakeEventSource[] = [];
  listeners: Record<string, Listener[]> = {};
  url: string;
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.last = this;
    FakeEventSource.instances.push(this);
  }
  addEventListener(event: string, fn: Listener) {
    (this.listeners[event] ??= []).push(fn);
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
  FakeEventSource.instances = [];
}

// Mock next/navigation's useRouter so `router.push` in the done handler doesn't
// blow up in jsdom. We register it by patching require.cache before the form
// imports — but since ClientsNewForm imports at module-load, we patch on a
// per-test basis via globalThis.
// In practice, the tests below don't fire the "done" event, so the default
// next/navigation behavior is fine — jsdom's navigation throws are swallowed
// by the act() boundary.

describe("ClientsNewForm", () => {
  beforeEach(() => {
    installFakeEventSource();
  });

  afterEach(() => {
    // @testing-library/react auto-cleanup only fires when an `afterEach`
    // global is detected (vitest/jest). node:test doesn't satisfy that
    // sniff, so the previous test's DOM leaks into the next render and
    // causes "Found multiple elements" errors. Call cleanup() explicitly.
    cleanup();
  });

  test("submits, opens EventSource, renders progress checkmarks as events arrive", async () => {
    render(<ClientsNewForm />);
    fireEvent.change(screen.getByPlaceholderText(/https:\/\//i), {
      target: { value: "https://acme.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /build workspace/i }));

    const es = FakeEventSource.last;
    assert.ok(es, "EventSource was constructed");
    assert.match(
      es!.url,
      /\/api\/v1\/web\/workspaces\/create-from-url\?url=https%3A%2F%2Facme\.com/,
    );

    act(() => es!.fire("fetching", { url: "https://acme.com" }));
    assert.equal(
      screen.getByTestId("progress-fetching").getAttribute("data-state"),
      "done",
    );

    act(() => es!.fire("extracting", {}));
    assert.equal(
      screen.getByTestId("progress-extracting").getAttribute("data-state"),
      "done",
    );
  });

  test("on error code 412 the form swaps to the BYOK prompt", async () => {
    render(<ClientsNewForm />);
    fireEvent.change(screen.getByPlaceholderText(/https:\/\//i), {
      target: { value: "https://acme.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /build workspace/i }));

    const es = FakeEventSource.last;
    act(() => es!.fire("error", { code: 412, reason: "needs_byok" }));

    assert.ok(screen.getByPlaceholderText(/sk-ant-/i), "BYOK input appeared");
    assert.ok(
      screen.getByRole("button", { name: /save key and continue/i }),
      "BYOK save button rendered",
    );
  });

  test("on error code 402 the UpgradeModal opens", async () => {
    render(<ClientsNewForm />);
    fireEvent.change(screen.getByPlaceholderText(/https:\/\//i), {
      target: { value: "https://acme.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /build workspace/i }));

    const es = FakeEventSource.last;
    act(() =>
      es!.fire("error", {
        code: 402,
        reason: "workspace_limit_reached",
        tier: "free",
        used: 1,
        limit: 1,
        upgradeUrl: "/settings/billing?upgrade=growth",
      }),
    );

    // UpgradeModal's cancel button uses "Maybe later" copy — its presence
    // proves the modal is open.
    assert.ok(
      screen.queryAllByText(/Maybe later/i).length > 0,
      "UpgradeModal rendered",
    );
  });

  test("on error code 422 the form shows an error banner and keeps the URL filled in", async () => {
    render(<ClientsNewForm />);
    const input = screen.getByPlaceholderText(/https:\/\//i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "https://acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: /build workspace/i }));

    const es = FakeEventSource.last;
    act(() => es!.fire("error", { code: 422, reason: "extraction_failed" }));

    assert.ok(screen.getByRole("alert"), "Error banner rendered with role=alert");
    assert.equal(input.value, "https://acme.com", "URL preserved on error");
  });
});
