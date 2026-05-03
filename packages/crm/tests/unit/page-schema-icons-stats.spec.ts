// Unit tests for the icon library + stats section + dashboard mockup
// (renderer quality upgrade — May 1, 2026).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  hasIcon,
  iconForItem,
  iconForTitle,
  renderIcon,
} from "@/lib/blueprint/renderers/lucide-icons";
import { renderWithGeneralServiceV1 } from "@/lib/page-schema/renderers/general-service-v1-adapter";
import { schemaFromSoul } from "@/lib/page-schema/schema-from-soul";
import { tokensForPersonality } from "@/lib/page-schema/design-tokens";

describe("Lucide icons — registry", () => {
  test("renderIcon('zap') produces an inline SVG", () => {
    const svg = renderIcon("zap");
    assert.match(svg, /^<svg /);
    assert.match(svg, /viewBox="0 0 24 24"/);
    assert.match(svg, /stroke="currentColor"/);
  });

  test("renderIcon with custom size + color", () => {
    const svg = renderIcon("calendar", { size: 32, color: "#10b981" });
    assert.match(svg, /width="32"/);
    assert.match(svg, /stroke="#10b981"/);
  });

  test("renderIcon returns empty string for unknown icon", () => {
    assert.equal(renderIcon("not-an-icon"), "");
  });

  test("hasIcon recognizes known names", () => {
    assert.equal(hasIcon("zap"), true);
    assert.equal(hasIcon("bot"), true);
    assert.equal(hasIcon("not-real"), false);
    assert.equal(hasIcon(undefined), false);
  });
});

describe("iconForTitle — keyword routing", () => {
  test("'Booking page' → calendar", () => {
    assert.equal(iconForTitle("Booking page"), "calendar");
  });
  test("'AI Agents' → bot", () => {
    assert.equal(iconForTitle("AI Agents"), "bot");
  });
  test("'CRM' → users", () => {
    assert.equal(iconForTitle("CRM"), "users");
  });
  test("'Pipeline' → bar_chart", () => {
    assert.equal(iconForTitle("Pipeline"), "bar_chart");
  });
  test("'Open source' → code", () => {
    assert.equal(iconForTitle("Open source"), "code");
  });
  test("'Free' → zap (tier-name special-case)", () => {
    assert.equal(iconForTitle("Free"), "zap");
  });
  test("'Growth' → trending_up", () => {
    assert.equal(iconForTitle("Growth"), "trending_up");
  });
  test("Unknown title → sparkles fallback", () => {
    assert.equal(iconForTitle("Random asdf"), "sparkles");
    assert.equal(iconForTitle(""), "sparkles");
    assert.equal(iconForTitle(null), "sparkles");
  });
});

describe("iconForItem — explicit icon wins over title inference", () => {
  test("explicit icon name takes precedence", () => {
    assert.equal(iconForItem({ icon: "shield", title: "AI Agent" }), "shield");
  });
  test("unknown explicit icon → infer from title", () => {
    assert.equal(iconForItem({ icon: "fake-icon", title: "Email" }), "mail");
  });
  test("no icon, no title → sparkles", () => {
    assert.equal(iconForItem({}), "sparkles");
  });
});

describe("Renderer — services-grid uses Lucide icons", () => {
  test("Operator-supplied service items render Lucide SVG paths", () => {
    // v1.1.7 — SaaS pack no longer ships SeldonFrame-specific feature
    // items ("Landing Pages / Booking / CRM / AI Agents / 75 MCP Tools").
    // Operator workspaces get items from soul.offerings instead. This
    // test validates the renderer still produces real Lucide SVGs for
    // operator-supplied items (the icon classifier picks up the title).
    const schema = schemaFromSoul({
      business_name: "Acme Bot Co",
      industry: "saas-developer-tools",
      offerings: [
        { name: "AI Agents", description: "Automate your workflow" },
        { name: "Booking", description: "Calendar slots" },
        { name: "CRM", description: "Contact management" },
      ],
    });
    const out = renderWithGeneralServiceV1(
      schema,
      tokensForPersonality("cinematic"),
      schema.media
    );
    // Bot icon (AI Agents) — distinctive M12 8V4 path start.
    assert.ok(
      out.html.includes("M12 8V4"),
      "AI Agents card should render the Lucide 'bot' icon path"
    );
    // The legacy generic placeholder circle should be ABSENT.
    assert.ok(
      !out.html.includes('<circle cx="12" cy="12" r="3"/>'),
      "generic placeholder circle should be replaced by Lucide icons"
    );
  });
});

describe("Stats section", () => {
  // v1.1.7 — SAAS_PACK rewritten to be neutral. The previous pack
  // hardcoded "75+ MCP Tools / 2,100+ Tests / 6 Agent Archetypes"
  // — SeldonFrame's own product stats. Now the SaaS pack ships
  // without a stats section so operators don't accidentally
  // advertise SeldonFrame's metrics on their own landing page.
  // (Workspaces that genuinely want stats can add them via
  // update_landing_section once they have real numbers.)
  test("SaaS pack ships WITHOUT a stats section (no fabricated metrics)", () => {
    const schema = schemaFromSoul({
      business_name: "TestSaaS",
      industry: "saas-developer-tools",
    });
    const stats = schema.sections.find((s) => s.intent === "stats");
    assert.equal(
      stats,
      undefined,
      "v1.1.7: SaaS pack should NOT include a default stats section"
    );
  });

  test("Local-service pack still includes 3 default stats", () => {
    // Local-service stats are operator-overridden by applyStatsFromSoul
    // (#8 from v1.1.4) when input.review_count / .review_rating are
    // present. The pack default exists as a fallback.
    const schema = schemaFromSoul({
      business_name: "Phoenix HVAC",
      soul_description: "HVAC repair and installation.",
    });
    const stats = schema.sections.find((s) => s.intent === "stats");
    assert.ok(stats, "Local-service pack should include a stats section");
    assert.equal(stats!.content.stats?.length, 3);
    assert.equal(stats!.content.stats?.[0].value, "500+");
  });

  test("Local-service stats render with sf-stat__value + sf-stat__label markup", () => {
    const schema = schemaFromSoul({
      business_name: "Phoenix HVAC",
      soul_description: "HVAC repair and installation.",
    });
    const out = renderWithGeneralServiceV1(
      schema,
      tokensForPersonality("clean"),
      schema.media
    );
    assert.match(out.html, /sf-stat__value/);
    assert.match(out.html, /sf-stat__label/);
    assert.match(out.html, /id="sf-stats"/);
    // The "500+" value appears literally in the rendered HTML.
    assert.match(out.html, /500\+/);
  });
});

describe("Hero dashboard mockup — disabled in v1.1.7", () => {
  // v1.1.7 — the SaaS hero dashboard mockup hardcoded SeldonFrame's
  // own dashboard preview ("128 Contacts, 42 Active Deals, $24k MRR").
  // When a workspace was misclassified as SaaS (anything mentioning
  // "platform"), the visitor saw a stranger's MRR numbers in the hero.
  // The mockup belongs only on SeldonFrame's own marketing site
  // (apps/web), not on every operator workspace.
  test("SaaS + cinematic → no mockup (was on; now removed)", () => {
    const schema = schemaFromSoul({
      business_name: "TestSaaS",
      industry: "saas-developer-tools",
    });
    const out = renderWithGeneralServiceV1(
      schema,
      tokensForPersonality("cinematic"),
      schema.media
    );
    assert.ok(
      !out.html.includes("sf-hero__mockup"),
      "v1.1.7: dashboard mockup HTML must not appear on operator workspaces"
    );
    assert.ok(
      !out.html.includes("sf-mockup__sidebar"),
      "no fake-sidebar markup either"
    );
  });

  test("SaaS + clean (non-cinematic) → no mockup", () => {
    const schema = schemaFromSoul({
      business_name: "TestSaaS",
      industry: "saas-developer-tools",
    });
    const out = renderWithGeneralServiceV1(
      schema,
      tokensForPersonality("clean"),
      schema.media
    );
    assert.ok(!out.html.includes("sf-hero__mockup"));
  });

  test("Local-service + cinematic → no mockup (mockup gated to SaaS only)", () => {
    const schema = schemaFromSoul({
      business_name: "Phoenix HVAC",
      soul_description: "HVAC repair.",
    });
    const out = renderWithGeneralServiceV1(
      schema,
      tokensForPersonality("cinematic"),
      schema.media
    );
    assert.ok(!out.html.includes("sf-hero__mockup"));
  });
});

describe("Cinematic CSS — stat + mockup classes shipped", () => {
  test("cinematic CSS includes stat-card styling", () => {
    const schema = schemaFromSoul({
      business_name: "TestSaaS",
      industry: "saas-developer-tools",
    });
    const out = renderWithGeneralServiceV1(
      schema,
      tokensForPersonality("cinematic"),
      schema.media
    );
    assert.match(out.head, /\.sf-frame\.sf-cinematic \.sf-stat__value/);
    assert.match(out.head, /\.sf-frame\.sf-cinematic \.sf-services--stats/);
  });

  test("cinematic CSS includes dashboard mockup styling", () => {
    const schema = schemaFromSoul({
      business_name: "TestSaaS",
      industry: "saas-developer-tools",
    });
    const out = renderWithGeneralServiceV1(
      schema,
      tokensForPersonality("cinematic"),
      schema.media
    );
    assert.match(out.head, /\.sf-frame\.sf-cinematic \.sf-hero__mockup/);
    assert.match(out.head, /perspective\(1600px\)/);
  });

  test("cinematic CSS includes section rhythm border-top", () => {
    const schema = schemaFromSoul({
      business_name: "TestSaaS",
      industry: "saas-developer-tools",
    });
    const out = renderWithGeneralServiceV1(
      schema,
      tokensForPersonality("cinematic"),
      schema.media
    );
    // Match the consecutive-section selectors
    assert.match(out.head, /\.sf-services \+ \.sf-faq/);
  });
});
