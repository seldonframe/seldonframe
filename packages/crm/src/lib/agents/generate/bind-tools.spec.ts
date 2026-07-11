// TDD for T6 (the generator's empty-allowlist authoring bug — the same class
// of bug T1 fixed in compile-agent.ts's bindingForToolkit). Prod data
// confirms every generated starter template's composio bindings
// (googlecalendar/slack/gmail across multiple orgs) carry `enabledTools: []`
// and therefore resolve to ZERO real tools at runtime (resolveComposioBinding
// wraps ONLY the allowlist). bindToolsForIntent (sentence-keyed) and
// bindToolIds (id-keyed) both route through bindingForEntry — fixing that one
// function fixes both call sites.

import { test } from "node:test";
import assert from "node:assert/strict";

import { bindToolsForIntent, bindToolIds } from "./bind-tools";
import { defaultToolsForToolkits } from "@/lib/integrations/composio/catalog";
import type { AgentIntent } from "./parse-intent";

function intentWithPromptHint(promptHint: string): AgentIntent {
  // Only promptHint is read by bindToolsForIntent — the rest of AgentIntent
  // isn't relevant to this seam, so a minimal cast keeps the fixture honest
  // about what's actually exercised.
  return { promptHint } as AgentIntent;
}

test("bindToolsForIntent: a composio-catalog keyword hit gets the curated default tools, never an empty allowlist", () => {
  const { connectors } = bindToolsForIntent(intentWithPromptHint("log every lead to Notion"));
  const notion = connectors.find((c) => c.kind === "composio" && c.enabledToolkits.includes("notion"));
  assert.ok(notion, "expected a composio notion binding");
  assert.ok(notion!.kind === "composio");
  assert.deepEqual(
    (notion as { enabledTools: string[] }).enabledTools,
    defaultToolsForToolkits(["notion"]),
  );
  assert.notDeepEqual((notion as { enabledTools: string[] }).enabledTools, []);
});

test("bindToolIds: an explicit composio catalog id gets the curated default tools, never an empty allowlist", () => {
  const connectors = bindToolIds(["gmail"]);
  const gmail = connectors.find((c) => c.kind === "composio" && c.enabledToolkits.includes("gmail"));
  assert.ok(gmail, "expected a composio gmail binding");
  assert.deepEqual(
    (gmail as { enabledTools: string[] }).enabledTools,
    defaultToolsForToolkits(["gmail"]),
  );
});

test("vetted (postiz) bindings are unchanged — still an empty allowlist (no toolkit-default catalog for vetted connectors)", () => {
  const connectors = bindToolIds(["postiz"]);
  const postiz = connectors.find((c) => c.kind === "vetted" && c.id === "postiz");
  assert.ok(postiz, "expected a vetted postiz binding");
  assert.deepEqual((postiz as { enabledTools: string[] }).enabledTools, []);
});
