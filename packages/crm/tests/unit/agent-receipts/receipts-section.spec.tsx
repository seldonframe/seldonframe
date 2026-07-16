// Agent receipts slice (Task 3) — <AgentRunReceiptsSection>.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import { AgentRunReceiptsSection } from "../../../src/components/agent-receipts/receipts-section";
import type { AgentRunReceiptViewRow } from "../../../src/lib/agent-receipts/store";

const ROWS: AgentRunReceiptViewRow[] = [
  {
    id: "r1",
    when: "2026-07-16T00:04:00Z",
    deploymentId: "dep_1",
    agentLabel: "Acme Plumbing",
    triggerKind: "push",
    sourceRef: "msg_123",
    status: "ok",
    summary: "Forwarded to ops@acme.com",
    toolCalls: [{ tool: "GMAIL_SEND_EMAIL", ok: true, note: "GMAIL_SEND_EMAIL succeeded." }],
  },
  {
    id: "r2",
    when: "2026-07-16T01:00:00Z",
    deploymentId: null,
    agentLabel: "—",
    triggerKind: "schedule",
    sourceRef: null,
    status: "error",
    summary: "failed: timeout",
    toolCalls: [],
  },
];

describe("<AgentRunReceiptsSection> — empty state", () => {
  test("renders the empty state when rows is empty", () => {
    const html = renderToString(<AgentRunReceiptsSection rows={[]} />);
    assert.match(html, /data-agent-run-receipts-empty/);
    assert.match(html, /No agent runs yet/);
  });
});

describe("<AgentRunReceiptsSection> — rows", () => {
  test("renders one row per receipt with data-agent-run-receipt-row", () => {
    const html = renderToString(<AgentRunReceiptsSection rows={ROWS} />);
    const matches = html.match(/data-agent-run-receipt-row/g) ?? [];
    assert.equal(matches.length, 2);
  });

  test("renders the agent label, trigger kind, source ref, and summary", () => {
    const html = renderToString(<AgentRunReceiptsSection rows={ROWS} />);
    assert.match(html, /Acme Plumbing/);
    assert.match(html, /push/);
    assert.match(html, /msg_123/);
    assert.match(html, /Forwarded to ops@acme\.com/);
  });

  test("a null sourceRef renders an em dash", () => {
    const html = renderToString(<AgentRunReceiptsSection rows={[ROWS[1]]} />);
    assert.match(html, /—/);
  });

  test("renders the OK/Error outcome badges", () => {
    const html = renderToString(<AgentRunReceiptsSection rows={ROWS} />);
    assert.match(html, />OK</);
    assert.match(html, />Error</);
  });

  test("tool calls render inside a details/summary, expandable, never shown for an empty list", () => {
    const html = renderToString(<AgentRunReceiptsSection rows={ROWS} />);
    assert.match(html, /data-agent-run-receipt-tool-calls/);
    assert.match(html, /1<!-- -->\s*tool call/);
    assert.match(html, /GMAIL_SEND_EMAIL succeeded\./);
    // Only ROWS[0] has tool calls — exactly one details block.
    const detailsCount = (html.match(/data-agent-run-receipt-tool-calls/g) ?? []).length;
    assert.equal(detailsCount, 1);
  });
});
