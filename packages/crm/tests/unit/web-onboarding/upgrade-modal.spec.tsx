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
// 2026-05-27 — Updated for the deferred-card signup flow. Free-tier users
// now see a SIMPLER "Add a card to unlock more workspaces" modal that
// routes to /signup/billing instead of the dual Growth/Scale cards (card
// capture was a 100% drop-off in the mandatory signup chain; the upgrade
// modal is now the first card-ask). Paid-tier users (tier="growth") still
// see the dual-tier upgrade comparison since they've already passed
// through the card step. The two test groups below cover both branches.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

import { UpgradeModal } from "../../../src/components/billing/upgrade-modal";

describe("UpgradeModal — free tier (add-a-card branch)", () => {
  test("renders the add-a-card title and subtitle", () => {
    render(<UpgradeModal open={true} onOpenChange={() => {}} tier="free" used={1} limit={1} />);
    assert.ok(
      screen.queryAllByText(/add a card to unlock more workspaces/i).length > 0,
      "Add-a-card title missing",
    );
    assert.ok(
      screen.queryAllByText(/used 1\/1 free workspace/i).length > 0,
      "N/N subtitle missing — copy should follow 'used N/N free workspaces' shape",
    );
  });

  test("does NOT render the Growth/Scale tier cards on free", () => {
    // Free-tier users see a single card-capture CTA — surfacing the
    // tier matrix here is the old (drop-off) UX. The tier comparison
    // is downstream of "do they have a card on file at all".
    render(<UpgradeModal open={true} onOpenChange={() => {}} tier="free" used={1} limit={1} />);
    assert.equal(screen.queryAllByText(/\$29/).length, 0, "Growth price should not render on free");
    assert.equal(screen.queryAllByText(/\$99/).length, 0, "Scale price should not render on free");
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

describe("UpgradeModal — paid tier (Growth → Scale upgrade branch)", () => {
  test("renders both tier cards when tier=growth", () => {
    render(<UpgradeModal open={true} onOpenChange={() => {}} tier="growth" used={3} limit={3} />);
    // base-ui Dialog renders title/description into a visible + an SR-only
    // node, so plain getByText fails with "multiple elements". Use queryAllByText
    // for presence-only assertions.
    assert.ok(screen.queryAllByText(/Growth/i).length > 0, "Growth card not rendered");
    assert.ok(screen.queryAllByText(/Scale/i).length > 0, "Scale card not rendered");
    assert.ok(screen.queryAllByText(/\$29/).length > 0, "Growth price not rendered");
    assert.ok(screen.queryAllByText(/\$99/).length > 0, "Scale price not rendered");
  });

  test("interpolates used and limit into the subtitle", () => {
    render(<UpgradeModal open={true} onOpenChange={() => {}} tier="growth" used={3} limit={3} />);
    assert.ok(
      screen.queryAllByText(/3 of 3 workspaces used/).length > 0,
      "Dynamic subtitle missing",
    );
  });

  test("upgrade buttons POST to /api/stripe/checkout with the correct priceId", async () => {
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
      render(<UpgradeModal open={true} onOpenChange={() => {}} tier="growth" used={3} limit={3} />);
      fireEvent.click(screen.getByRole("button", { name: /upgrade to growth/i }));
      // Allow the click handler microtask to flush.
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(fetchMock.calls.length, 1, "Stripe checkout endpoint was not called");
      assert.equal(fetchMock.calls[0]!.url, "/api/stripe/checkout");
      assert.match(JSON.stringify(fetchMock.calls[0]!.body), /priceId/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
