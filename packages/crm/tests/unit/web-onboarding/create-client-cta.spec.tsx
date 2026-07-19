// packages/crm/tests/unit/web-onboarding/create-client-cta.spec.tsx
//
// Bootstrap: the setup-dom import below MUST stay first — it mounts jsdom
// before React imports (the CI runner passes no --import flag, so the spec
// pulls the bootstrap in itself).
//
// Query discipline: base-ui's Dialog and Tooltip mirror content into visible +
// SR-only nodes, so plain `getByText` may match multiple elements. Prefer
// `queryAllByText(...).length > 0` for presence checks and
// `getByRole("button", ...)` for click targets.
import "../../setup-dom";

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
    // 2026-05-17 fix (see create-client-cta.tsx): the under-limit CTA used
    // to be a base-ui `Button render={<Link/>} nativeButton={false}`
    // (role="button" on an <a>), but that render-prop pattern swallowed
    // Next.js Link clicks — navigation never fired. It was replaced with a
    // plain `<Link className={buttonVariants(...)}>`, which is a real
    // anchor with role="link", not "button". Match on the real role.
    const trigger = screen.getByRole("link", { name: /add client workspace/i });
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
    // Still resolves to the form route, not the modal — the trigger is a
    // plain <Link> (role="link", see 2026-05-17 fix note above) with the
    // href set.
    const trigger = screen.getByRole("link", { name: /add client workspace/i });
    assert.equal(trigger.tagName.toLowerCase(), "a");
    assert.equal(trigger.getAttribute("href"), "/clients/new");
  });
});
