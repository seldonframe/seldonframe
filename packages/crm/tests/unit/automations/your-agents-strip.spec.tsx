// Agent truth slice (Task 3, P4-lite) — the /automations "Your agents" strip.
// Max's live-run finding: "i don't see the agents for zen in /automations".
// renderToString, no jsdom (repo convention) — fixture rows, no DB.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import { YourAgentsStrip } from "../../../src/components/automations/your-agents-strip";
import type { DeployedAgentStripRow } from "../../../src/lib/agent-receipts/store";

const ROWS: DeployedAgentStripRow[] = [
  {
    deploymentId: "dep-1",
    templateId: "tmpl-1",
    agentName: "Zen Front Desk",
    triggerKind: "push",
    active: true,
  },
  {
    deploymentId: "dep-2",
    templateId: "tmpl-2",
    agentName: "Weekly Digest",
    triggerKind: "schedule",
    active: false,
  },
];

describe("<YourAgentsStrip> — populated", () => {
  test("renders ONE row per deployed agent", () => {
    const html = renderToString(<YourAgentsStrip rows={ROWS} />);
    const matches = html.match(/data-your-agents-row/g) ?? [];
    assert.equal(matches.length, 2);
  });

  test("each row shows the agent name and links to /studio/agents/[templateId]", () => {
    const html = renderToString(<YourAgentsStrip rows={ROWS} />);
    assert.match(html, /Zen Front Desk/);
    assert.match(html, /Weekly Digest/);
    assert.match(html, /href="\/studio\/agents\/tmpl-1"/);
    assert.match(html, /href="\/studio\/agents\/tmpl-2"/);
  });

  test("trigger kind chip renders push/schedule/event as shown text", () => {
    const html = renderToString(<YourAgentsStrip rows={ROWS} />);
    assert.match(html, /data-trigger-chip[^>]*>\s*push/);
    assert.match(html, /data-trigger-chip[^>]*>\s*schedule/);
  });

  test("the live dot renders ONLY for active rows (L-36: presence/absence, not opacity)", () => {
    const html = renderToString(<YourAgentsStrip rows={ROWS} />);
    const liveDots = html.match(/data-your-agents-live-dot/g) ?? [];
    assert.equal(liveDots.length, 1, "exactly one active row should render the live dot");
  });

  test("no empty-state copy renders when there are rows", () => {
    const html = renderToString(<YourAgentsStrip rows={ROWS} />);
    assert.ok(!html.includes("data-your-agents-empty"));
  });
});

describe("<YourAgentsStrip> — empty state", () => {
  test("renders the empty-state line with both two-doors links, no rows", () => {
    const html = renderToString(<YourAgentsStrip rows={[]} />);
    assert.match(html, /data-your-agents-empty/);
    assert.match(html, /No deployed agents yet/);
    assert.match(html, /href="\/studio\/agents"/);
    assert.match(html, /href="\/record"/);
    assert.ok(!html.includes("data-your-agents-row"));
  });
});
