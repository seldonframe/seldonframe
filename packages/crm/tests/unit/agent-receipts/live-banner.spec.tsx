// Agent receipts slice (Task 3) — <DeploymentLiveBanner>.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import { DeploymentLiveBanner } from "../../../src/components/agent-receipts/live-banner";
import type { DeploymentLiveStatus } from "../../../src/lib/agent-receipts/live-status";

describe("<DeploymentLiveBanner>", () => {
  test("renders nothing when status is null (no deployment)", () => {
    const html = renderToString(<DeploymentLiveBanner status={null} />);
    assert.equal(html, "");
  });

  test("renders nothing when the deployment is inactive", () => {
    const status: DeploymentLiveStatus = {
      active: false,
      triggerKind: "push",
      todayCount: 3,
      lastReceiptAt: "2026-07-16T00:04:00Z",
    };
    const html = renderToString(<DeploymentLiveBanner status={status} />);
    assert.equal(html, "");
  });

  test("renders the LIVE sentence + a data attribute when active", () => {
    const status: DeploymentLiveStatus = {
      active: true,
      triggerKind: "push",
      todayCount: 3,
      lastReceiptAt: "2026-07-16T00:04:00Z",
    };
    const html = renderToString(<DeploymentLiveBanner status={status} />);
    assert.match(html, /data-deployment-live-banner/);
    assert.match(html, /LIVE — watching via push · 3 runs today · last 00:04/);
  });

  test("surfaces the connected account when present", () => {
    const status: DeploymentLiveStatus = {
      active: true,
      triggerKind: "push",
      todayCount: 1,
      lastReceiptAt: "2026-07-16T00:04:00Z",
      connectedAccountLabel: "ops@acme.com",
    };
    const html = renderToString(<DeploymentLiveBanner status={status} />);
    assert.match(html, /reading ops@acme\.com/);
  });
});
