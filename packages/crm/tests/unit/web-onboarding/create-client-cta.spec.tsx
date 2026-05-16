// packages/crm/tests/unit/web-onboarding/create-client-cta.spec.tsx
//
// Bootstrap: run with `node --import tsx --import ./tests/setup-dom.ts --test ...`
// (see packages/crm/tests/setup-dom.ts) — jsdom is mounted before React imports.
//
// Query discipline: base-ui's Dialog and Tooltip mirror content into visible +
// SR-only nodes, so plain `getByText` may match multiple elements. Prefer
// `queryAllByText(...).length > 0` for presence checks and
// `getByRole("button", ...)` for click targets.
import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";

import { CreateClientCta } from "../../../src/components/dashboard/create-client-cta";

describe("CreateClientCta", () => {
  // node:test doesn't trigger @testing-library/react's auto-cleanup sniff
  // (vitest/jest globals only) — DOM leaks between tests and triggers
  // "Found multiple elements" errors. Call cleanup() explicitly.
  afterEach(() => {
    cleanup();
  });

  test("renders an anchor link to /clients/new when under the limit", () => {
    render(<CreateClientCta tier="growth" used={1} limit={3} />);
    // base-ui's Button renders a <button>-styled element, but with
    // `render={<Link href="..."/>} nativeButton={false}` the underlying
    // tag is an <a> that carries role="button". Match on the role we
    // know it gets and assert the href.
    const trigger = screen.getByRole("button", { name: /add client workspace/i });
    assert.equal(trigger.tagName.toLowerCase(), "a", "expected an anchor element");
    assert.equal(trigger.getAttribute("href"), "/clients/new");
  });

  test("renders the usage badge with N/M workspaces label", () => {
    render(<CreateClientCta tier="growth" used={1} limit={3} />);
    assert.ok(
      screen.queryAllByText(/1 \/ 3 workspaces/i).length > 0,
      "usage badge not rendered",
    );
  });

  test("at limit renders a button (not a link) that opens UpgradeModal on click", () => {
    render(<CreateClientCta tier="free" used={1} limit={1} />);
    const button = screen.getByRole("button", { name: /add client workspace/i });
    // Should NOT carry an href at limit — the click goes to the modal,
    // not navigation. If an href existed, middle-click / cmd-click
    // would bypass the modal entirely.
    assert.equal(button.tagName.toLowerCase(), "button", "expected a real <button>, not an <a>");
    assert.equal(button.getAttribute("href"), null, "Unexpected href on at-limit trigger");
    fireEvent.click(button);
    // UpgradeModal's cancel button uses "Maybe later" copy — its presence
    // proves the modal opened.
    assert.ok(
      screen.queryAllByText(/Maybe later/i).length > 0,
      "UpgradeModal did not open on click",
    );
  });

  test("unlimited tier (Scale, limit Infinity) renders without N/M and links to /clients/new", () => {
    render(<CreateClientCta tier="scale" used={5} limit={Number.POSITIVE_INFINITY} />);
    // Unlimited: no fraction
    assert.equal(
      screen.queryAllByText(/\d+\s*\/\s*\d+\s+workspaces/i).length,
      0,
      "Unexpected fraction rendered for unlimited tier",
    );
    // Still resolves to the form route, not the modal — the trigger is
    // a base-ui Button rendered as an <a> (role="button") with the href set.
    const trigger = screen.getByRole("button", { name: /add client workspace/i });
    assert.equal(trigger.tagName.toLowerCase(), "a");
    assert.equal(trigger.getAttribute("href"), "/clients/new");
  });
});
