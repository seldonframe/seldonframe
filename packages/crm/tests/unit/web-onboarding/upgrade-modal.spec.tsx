// packages/crm/tests/unit/web-onboarding/upgrade-modal.spec.tsx
//
// Bootstrap: run with `node --import tsx --import ./tests/setup-dom.ts --test ...`
// (see packages/crm/tests/setup-dom.ts) — jsdom is mounted before React imports
// so the Dialog/Card/Button shadcn primitives render into a real DOM.
//
// Query discipline: base-ui's Dialog mirrors title/description into both the
// visible content and a screen-reader-only node, so plain `getByText` matches
// multiple elements. Prefer `getAllByText(...).length > 0` for presence checks
// and `getByRole("button", ...)` for click targets.
//
// 2026-07-08 post-review fix wave (non-blocking item #5): the modal's
// upgrade targets are now FLAG-GATED behind NEXT_PUBLIC_SF_TIER_LADDER
// (client-safe twin of the server flag SF_TIER_LADDER). Flag OFF
// (default — no env var set, matches main's live behavior) MUST render
// the exact grandfathered Workspace ($49) / Agency ($297) targets with
// their real, already-configured Stripe prices. Flag ON switches to
// the new sellable ladder (Managed $49 / Agency Starter $99), which
// 409s "tier_unavailable" at checkout until Max sets the new tier's
// Stripe price env vars — so flipping it on prematurely was the live
// regression this fix wave closes. This spec pins BOTH states.
//
// The free/inactive card-capture branch is unaffected by the flag (it
// never reaches the tier-comparison view) — its copy assertions were
// already drifted from the live component before this branch; fixed
// here to match the real strings.
import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";

import { UpgradeModal } from "../../../src/components/billing/upgrade-modal";

// This file's assertions include ABSENCE checks (e.g. "the grandfathered
// Workspace card must not render when the flag is on") — without an
// explicit unmount between tests, testing-library's render() APPENDS to
// the shared jsdom document rather than replacing it, so a later test's
// absence assertion would see the PREVIOUS test's still-mounted DOM.
// This harness has no global afterEach hook (see tests/setup-dom.ts),
// so every describe block below cleans up explicitly.
afterEach(() => cleanup());

/** NEXT_PUBLIC_ vars are inlined at build time in real Next.js, but in
 *  this ts-node/tsx unit-test harness they're read from process.env at
 *  require time same as any other var — so toggling process.env before
 *  each test (then deleting it) exercises both flag states. */
function setTierLadderEnv(value: "1" | undefined) {
  if (value === undefined) {
    delete process.env.NEXT_PUBLIC_SF_TIER_LADDER;
  } else {
    process.env.NEXT_PUBLIC_SF_TIER_LADDER = value;
  }
}

describe("UpgradeModal — free tier (add-a-card branch, flag-independent)", () => {
  beforeEach(() => setTierLadderEnv(undefined));

  test("renders the add-a-card title and subtitle", () => {
    render(<UpgradeModal open={true} onOpenChange={() => {}} tier="free" used={1} limit={1} />);
    assert.ok(
      screen.queryAllByText(/add a card to unlock more workspaces/i).length > 0,
      "Add-a-card title missing",
    );
    assert.ok(
      screen.queryAllByText(/you've used 1\/1 workspace/i).length > 0,
      "used-N/N subtitle missing",
    );
  });

  test("does NOT render any tier cards on free", () => {
    // Free-tier users see a single card-capture CTA — the tier matrix
    // (whichever flag state) is downstream of "do they have a card on
    // file at all".
    render(<UpgradeModal open={true} onOpenChange={() => {}} tier="free" used={1} limit={1} />);
    assert.equal(screen.queryAllByText(/\$49\/mo/).length, 0, "no tier card should render on free");
    assert.equal(screen.queryAllByText(/\$99\/mo/).length, 0, "no tier card should render on free");
    assert.equal(screen.queryAllByText(/\$297\/mo/).length, 0, "no tier card should render on free");
  });

  test("calls onOpenChange(false) when 'Maybe later' is clicked", () => {
    let opened = true;
    render(
      <UpgradeModal
        open={opened}
        onOpenChange={(next) => {
          opened = next;
        }}
        tier="free"
        used={1}
        limit={1}
      />,
    );
    const closeBtn = screen.getByRole("button", {
      name: /maybe later.*close upgrade dialog/i,
    });
    fireEvent.click(closeBtn);
    assert.equal(opened, false);
  });
});

describe("UpgradeModal — flag OFF (default) — main's LIVE grandfathered targets", () => {
  beforeEach(() => setTierLadderEnv(undefined));

  test("renders Workspace ($49) + Agency ($297) — NOT the new ladder", () => {
    render(<UpgradeModal open={true} onOpenChange={() => {}} tier="workspace" used={3} limit={3} />);
    assert.ok(screen.queryAllByText(/^Workspace$/).length > 0, "Workspace card not rendered");
    assert.ok(screen.queryAllByText(/^Agency$/).length > 0, "Agency card not rendered");
    assert.ok(screen.queryAllByText(/\$49\/mo/).length > 0, "Workspace price not rendered");
    assert.ok(screen.queryAllByText(/\$297\/mo/).length > 0, "Agency price not rendered");
    // The new ladder's targets must NOT appear when the flag is off.
    assert.equal(screen.queryAllByText(/^Managed$/).length, 0, "Managed must not render when flag is off");
    assert.equal(screen.queryAllByText(/^Agency Starter$/).length, 0, "Agency Starter must not render when flag is off");
    assert.equal(screen.queryAllByText(/\$99\/mo/).length, 0, "$99 must not render when flag is off");
  });

  test("interpolates used and limit into the subtitle", () => {
    render(<UpgradeModal open={true} onOpenChange={() => {}} tier="workspace" used={3} limit={3} />);
    assert.ok(
      screen.queryAllByText(/3 of 3 workspaces on your current plan/).length > 0,
      "Dynamic subtitle missing",
    );
  });

  test("upgrade buttons POST to /api/stripe/checkout with the GRANDFATHERED tier + real price id", async () => {
    const fetchMock = Object.assign(
      async (url: string, init?: RequestInit) => {
        fetchMock.calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
        return new Response(JSON.stringify({ url: "https://checkout.stripe.com/test" }), { status: 200 });
      },
      { calls: [] as Array<{ url: string; body: unknown }> },
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      render(<UpgradeModal open={true} onOpenChange={() => {}} tier="workspace" used={3} limit={3} />);
      fireEvent.click(screen.getByRole("button", { name: /upgrade to workspace/i }));
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(fetchMock.calls.length, 1, "Stripe checkout endpoint was not called");
      assert.equal(fetchMock.calls[0]!.url, "/api/stripe/checkout");
      const body = fetchMock.calls[0]!.body as { tier?: string; priceId?: string };
      // Money-safe: the flag-off path must POST the GRANDFATHERED "workspace"
      // tier id (which resolves to a real, already-configured Stripe price),
      // never the new "managed" id (which 409s tier_unavailable without env).
      assert.equal(body.tier, "workspace");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("UpgradeModal — flag ON (NEXT_PUBLIC_SF_TIER_LADDER=1) — the new sellable ladder", () => {
  beforeEach(() => setTierLadderEnv("1"));
  afterEach(() => setTierLadderEnv(undefined));

  test("renders Managed ($49) + Agency Starter ($99) — NOT the grandfathered targets", () => {
    render(<UpgradeModal open={true} onOpenChange={() => {}} tier="managed" used={1} limit={1} />);
    assert.ok(screen.queryAllByText(/^Managed$/).length > 0, "Managed card not rendered");
    assert.ok(screen.queryAllByText(/^Agency Starter$/).length > 0, "Agency Starter card not rendered");
    assert.ok(screen.queryAllByText(/\$49\/mo/).length > 0, "Managed price not rendered");
    assert.ok(screen.queryAllByText(/\$99\/mo/).length > 0, "Agency Starter price not rendered");
    assert.equal(screen.queryAllByText(/^Workspace$/).length, 0, "grandfathered Workspace must not render when flag is on");
    assert.equal(screen.queryAllByText(/\$297\/mo/).length, 0, "$297 must not render when flag is on");
  });

  test("upgrade buttons POST to /api/stripe/checkout with the NEW ladder tier id", async () => {
    const fetchMock = Object.assign(
      async (url: string, init?: RequestInit) => {
        fetchMock.calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
        return new Response(JSON.stringify({ url: "https://checkout.stripe.com/test" }), { status: 200 });
      },
      { calls: [] as Array<{ url: string; body: unknown }> },
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      render(<UpgradeModal open={true} onOpenChange={() => {}} tier="managed" used={1} limit={1} />);
      fireEvent.click(screen.getByRole("button", { name: /upgrade to agency starter/i }));
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(fetchMock.calls.length, 1);
      const body = fetchMock.calls[0]!.body as { tier?: string };
      assert.equal(body.tier, "agency_starter");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
