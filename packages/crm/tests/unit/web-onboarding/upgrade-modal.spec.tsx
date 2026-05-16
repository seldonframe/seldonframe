// packages/crm/tests/unit/web-onboarding/upgrade-modal.spec.tsx
// React Testing Library is already a transitive dep via the existing
// component snapshot tests in packages/crm/tests/unit/blocks/.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

import { UpgradeModal } from "../../../src/components/billing/upgrade-modal";

describe("UpgradeModal", () => {
  test("renders both tier cards when open", () => {
    render(<UpgradeModal open={true} onOpenChange={() => {}} tier="free" used={1} limit={1} />);
    assert.ok(screen.getByText(/Growth/i));
    assert.ok(screen.getByText(/Scale/i));
    assert.ok(screen.getByText(/\$29/));
    assert.ok(screen.getByText(/\$99/));
  });

  test("interpolates used and limit into the subtitle", () => {
    render(<UpgradeModal open={true} onOpenChange={() => {}} tier="free" used={1} limit={1} />);
    assert.ok(screen.getByText(/1 of 1 workspaces used/));
  });

  test("calls onOpenChange(false) when the close link is clicked", () => {
    let opened = true;
    render(
      <UpgradeModal open={opened} onOpenChange={(next) => { opened = next; }} tier="free" used={1} limit={1} />
    );
    fireEvent.click(screen.getByText(/Maybe later/i));
    assert.equal(opened, false);
  });

  test("upgrade buttons POST to /api/stripe/checkout with the correct priceId", async () => {
    const fetchMock = async (url: string, init?: RequestInit) => {
      fetchMock.calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      return new Response(JSON.stringify({ url: "https://checkout.stripe.com/test" }), { status: 200 });
    };
    fetchMock.calls = [] as Array<{ url: string; body: unknown }>;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      render(<UpgradeModal open={true} onOpenChange={() => {}} tier="free" used={1} limit={1} />);
      fireEvent.click(screen.getByRole("button", { name: /upgrade to growth/i }));
      // Allow the click handler microtask to flush.
      await Promise.resolve();
      assert.equal(fetchMock.calls.length, 1);
      assert.equal(fetchMock.calls[0]!.url, "/api/stripe/checkout");
      assert.match(JSON.stringify(fetchMock.calls[0]!.body), /priceId/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
