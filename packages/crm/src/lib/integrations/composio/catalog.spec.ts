// TDD for the curated catalog + the pure toolkit→connection mapping. The live
// network calls (create/use/authorize/delete/triggers) stay untested (they need
// a real Composio project key) — this covers the deterministic surface.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  COMPOSIO_TOOLKITS,
  COMPOSIO_TOOLKIT_SLUGS,
  getComposioToolkit,
  isCatalogToolkit,
  defaultToolsForToolkits,
} from "./catalog";
import { mapToolkitConnections } from "./client";

const EXPECTED_SLUGS = [
  "gmail",
  "googlecalendar",
  "googledrive",
  "slack",
  "notion",
  "hubspot",
  "quickbooks",
  "outlook",
];

test("catalog has the 8 curated toolkits in order", () => {
  assert.equal(COMPOSIO_TOOLKITS.length, 8);
  assert.deepEqual([...COMPOSIO_TOOLKIT_SLUGS], EXPECTED_SLUGS);
});

test("every toolkit has a label and a composio logo URL", () => {
  for (const t of COMPOSIO_TOOLKITS) {
    assert.ok(t.label.length > 0, `${t.slug} missing label`);
    assert.equal(t.logo, `https://logos.composio.dev/api/${t.slug}`);
  }
});

test("gmail pins its canonical new-message trigger", () => {
  const gmail = getComposioToolkit("gmail");
  assert.equal(gmail?.primaryTrigger, "GMAIL_NEW_GMAIL_MESSAGE");
});

test("getComposioToolkit is case-insensitive and trims", () => {
  assert.equal(getComposioToolkit("  GMAIL ")?.slug, "gmail");
  assert.equal(getComposioToolkit("nope"), undefined);
});

test("isCatalogToolkit gate", () => {
  assert.ok(isCatalogToolkit("hubspot"));
  assert.ok(!isCatalogToolkit("github"));
});

// ─── defaultToolsForToolkits (the curated per-toolkit allowlist) ──────────────

test("defaultToolsForToolkits returns the union of curated tools, deduped + order-stable", () => {
  const tools = defaultToolsForToolkits(["gmail", "slack"]);
  assert.ok(tools.includes("GMAIL_SEND_EMAIL"));
  assert.ok(tools.includes("SLACK_SEND_MESSAGE"));
  // Every slug follows the {TOOLKIT}_{ACTION} convention.
  for (const t of tools) assert.match(t, /^[A-Z0-9]+_[A-Z0-9_]+$/);
  // Dedup: union of two distinct toolkits has no repeats.
  assert.equal(new Set(tools).size, tools.length);
});

test("defaultToolsForToolkits is case-insensitive and ignores unknown toolkits", () => {
  const tools = defaultToolsForToolkits(["GMAIL", "definitely-not-real"]);
  assert.ok(tools.includes("GMAIL_SEND_EMAIL"));
  // Only gmail's curated tools (no junk from the unknown slug).
  assert.ok(tools.every((t) => t.startsWith("GMAIL_")));
});

test("defaultToolsForToolkits([]) is empty", () => {
  assert.deepEqual(defaultToolsForToolkits([]), []);
});

// ─── mapToolkitConnections (pure) ─────────────────────────────────────────────

test("maps a connected toolkit to connected=true + accountId", () => {
  const out = mapToolkitConnections([
    {
      slug: "gmail",
      name: "Gmail",
      logo: "https://logos.composio.dev/api/gmail",
      connection: { isActive: true, connectedAccount: { id: "ca_1" } },
    },
  ]);
  assert.deepEqual(out, [
    {
      slug: "gmail",
      name: "Gmail",
      logo: "https://logos.composio.dev/api/gmail",
      connected: true,
      connectedAccountId: "ca_1",
    },
  ]);
});

test("maps an unconnected toolkit to connected=false + null id", () => {
  const out = mapToolkitConnections([{ slug: "slack", name: "Slack" }]);
  assert.deepEqual(out, [
    { slug: "slack", name: "Slack", logo: null, connected: false, connectedAccountId: null },
  ]);
});

test("inactive connection → connected=false even with an account id", () => {
  const out = mapToolkitConnections([
    {
      slug: "notion",
      name: "Notion",
      connection: { isActive: false, connectedAccount: { id: "ca_x" } },
    },
  ]);
  assert.equal(out[0].connected, false);
  assert.equal(out[0].connectedAccountId, "ca_x");
});

test("filters out non-catalog toolkits Composio may return", () => {
  const out = mapToolkitConnections([
    { slug: "github", name: "GitHub", connection: { isActive: true } },
    { slug: "gmail", name: "Gmail" },
  ]);
  assert.deepEqual(
    out.map((c) => c.slug),
    ["gmail"],
  );
});
