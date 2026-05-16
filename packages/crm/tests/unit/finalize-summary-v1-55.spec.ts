// Tests for the v1.55.0 finalize_workspace summary template.
//
// The summary is built in skills/mcp-server/src/tools.js but we test
// it via a pure helper extracted into this spec to avoid pulling in
// the entire MCP server module. The helper is also exported from
// skills/mcp-server/src/finalize-summary.js (NEW in this PR) so
// the tools.js handler delegates to it.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

// Note: skills/mcp-server is ESM. We import the helper via relative
// path from the test file. tsx + node:test handle the ESM resolution.
import { buildFinalizeSummary } from "../../../../skills/mcp-server/src/finalize-summary.js";

const baseSnapshot = {
  workspace: {
    name: "Ignitify Cooling and Heating",
    slug: "ignitify-cooling-and-heating",
    settings: { crmPersonality: { vertical: "hvac" } },
  },
  public_urls: {
    home: "https://ignitify-cooling-and-heating.app.seldonframe.com",
    book: "https://ignitify-cooling-and-heating.app.seldonframe.com/book",
    intake: "https://ignitify-cooling-and-heating.app.seldonframe.com/intake",
  },
  chatbot: {
    agent_id: "ag_abc123",
    embed_url: "https://app.seldonframe.com/api/v1/public/agent/ignitify-cooling-and-heating--default/embed.js",
    embed_snippet: '<script src="https://app.seldonframe.com/api/v1/public/agent/ignitify-cooling-and-heating--default/embed.js" async></script>',
    status: "test",
    preview_url: "https://ignitify-cooling-and-heating.app.seldonframe.com",
  },
  ops_stack: {
    admin_url: "https://app.seldonframe.com/admin/ws-123",
    booking_url: "https://ignitify-cooling-and-heating.app.seldonframe.com/book",
    intake_url: "https://ignitify-cooling-and-heating.app.seldonframe.com/intake",
    automations_url: "https://app.seldonframe.com/automations",
  },
  available_automations: [
    { id: "speed-to-lead", name: "Speed-to-Lead", configured: false },
    { id: "missed-call-text-back", name: "Missed-Call Text Back", configured: false },
    { id: "review-requester", name: "Review Requester", configured: false },
    { id: "appointment-confirm-sms", name: "Appointment Confirm via SMS", configured: false },
    { id: "weather-aware-booking", name: "Weather-Aware Booking", configured: false },
    { id: "daily-digest", name: "Daily Digest", configured: false },
    { id: "win-back", name: "Win-Back", configured: false },
  ],
  tier: {
    current_tier: "free",
    current_tier_label: "Free",
    client_portal_url: "https://app.seldonframe.com/customer/ignitify-cooling-and-heating/login",
  },
};

describe("buildFinalizeSummary — HVAC fixture", () => {
  test("includes the chatbot embed snippet front-and-center", () => {
    const out = buildFinalizeSummary({ snapshot: baseSnapshot, durationSec: 32, aestheticArchetype: "bold-urgency" });
    assert.ok(out.includes(baseSnapshot.chatbot.embed_snippet), "embed snippet must appear verbatim");
    const snippetIdx = out.indexOf(baseSnapshot.chatbot.embed_snippet);
    const automationsIdx = out.indexOf("Activate any:");
    assert.ok(snippetIdx < automationsIdx, "embed snippet should appear BEFORE the automations callout");
  });

  test("lists all 7 automations", () => {
    const out = buildFinalizeSummary({ snapshot: baseSnapshot, durationSec: 32, aestheticArchetype: "bold-urgency" });
    for (const name of ["Speed-to-Lead", "Missed-Call Text Back", "Review Requester", "Appointment Confirm via SMS", "Weather-Aware Booking", "Daily Digest", "Win-Back"]) {
      assert.ok(out.includes(name), `automation '${name}' should appear`);
    }
  });

  test("includes the automations dashboard URL + API-key helper note", () => {
    const out = buildFinalizeSummary({ snapshot: baseSnapshot, durationSec: 32, aestheticArchetype: "bold-urgency" });
    assert.ok(out.includes("https://app.seldonframe.com/automations"), "automations URL");
    assert.ok(out.includes("API keys"), "API-key helper note");
    assert.ok(out.includes("Twilio"), "Twilio mentioned");
  });

  test("includes the chatbot preview URL with 'demo for your client' framing", () => {
    const out = buildFinalizeSummary({ snapshot: baseSnapshot, durationSec: 32, aestheticArchetype: "bold-urgency" });
    assert.ok(out.includes(baseSnapshot.chatbot.preview_url), "preview URL");
    assert.ok(out.includes("Demo for your client") || out.includes("demo for your client"), "demo framing");
  });

  test("closes with the landing-page nudge naming the archetype", () => {
    const out = buildFinalizeSummary({ snapshot: baseSnapshot, durationSec: 32, aestheticArchetype: "bold-urgency" });
    assert.ok(out.includes("bold-urgency"), "archetype name should appear in the landing-page nudge");
    assert.ok(out.includes("landing-page-creation"), "skill name should appear");
  });

  test("includes duration_sec in the header", () => {
    const out = buildFinalizeSummary({ snapshot: baseSnapshot, durationSec: 32, aestheticArchetype: "bold-urgency" });
    assert.ok(out.includes("(32 seconds)") || out.includes("32 seconds"), "duration should appear");
  });

  test("includes business name in the header", () => {
    const out = buildFinalizeSummary({ snapshot: baseSnapshot, durationSec: 32, aestheticArchetype: "bold-urgency" });
    assert.ok(out.includes("Ignitify Cooling and Heating"), "business name should appear");
  });

  test("does NOT include legacy 'Powered by your Claude Code key' text", () => {
    const out = buildFinalizeSummary({ snapshot: baseSnapshot, durationSec: 32, aestheticArchetype: "bold-urgency" });
    assert.ok(!out.includes("Powered by your Claude Code key"), "legacy text should be gone");
  });

  test("does NOT include legacy 'Landing page rendered' claim", () => {
    const out = buildFinalizeSummary({ snapshot: baseSnapshot, durationSec: 32, aestheticArchetype: "bold-urgency" });
    assert.ok(!out.includes("Landing page rendered"), "legacy text should be gone");
  });
});

describe("buildFinalizeSummary — null chatbot fallback", () => {
  test("graceful summary when chatbot auto-creation failed", () => {
    const fixture = { ...baseSnapshot, chatbot: null };
    const out = buildFinalizeSummary({ snapshot: fixture, durationSec: 30, aestheticArchetype: "clinical-trust" });
    assert.ok(out.includes("scaffold pending") || out.includes("Chatbot creation failed"), "should mention chatbot fallback path");
    assert.ok(out.includes("Activate any:"), "automations callout should still appear");
  });
});

describe("buildFinalizeSummary — null archetype fallback (pre-v1.54 workspaces)", () => {
  test("landing-page nudge omits archetype name when null", () => {
    const out = buildFinalizeSummary({ snapshot: baseSnapshot, durationSec: 30, aestheticArchetype: null });
    assert.ok(out.includes("Want a landing page"), "landing-page nudge appears");
    assert.ok(!out.includes("null"), "the literal string 'null' should not appear");
  });
});
