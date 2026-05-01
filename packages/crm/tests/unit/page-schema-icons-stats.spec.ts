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
  test("SaaS features grid renders Lucide SVG paths in service cards", () => {
    // May 1, 2026 — SaaS pack ships product features (Landing Pages /
    // Booking / CRM / AI Agents) with explicit icons (globe / calendar
    // / users / bot). The Lucide globe icon path starts with the
    // canonical circle + path combo.
    const schema = schemaFromSoul({
      business_name: "TestSaaS",
      industry: "saas-developer-tools",
    });
    const out = renderWithGeneralServiceV1(
      schema,
      tokensForPersonality("cinematic"),
      schema.media
    );
    // Globe icon (Landing Pages) — Lucide's globe has a circle + path.
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
  test("SaaS pack includes stats section with 4 default values", () => {
    const schema = schemaFromSoul({
      business_name: "TestSaaS",
      industry: "saas-developer-tools",
    });
    const stats = schema.sections.find((s) => s.intent === "stats");
    assert.ok(stats, "SaaS pack should include a stats section");
    assert.equal(stats!.content.stats?.length, 4);
    // First stat: "75+" / "MCP Tools"
    assert.equal(stats!.content.stats?.[0].value, "75+");
    assert.equal(stats!.content.stats?.[0].label, "MCP Tools");
  });

  test("Local-service pack includes 3 stats", () => {
    const schema = schemaFromSoul({
      business_name: "Phoenix HVAC",
      soul_description: "HVAC repair and installation.",
    });
    const stats = schema.sections.find((s) => s.intent === "stats");
    assert.ok(stats, "Local-service pack should include a stats section");
    assert.equal(stats!.content.stats?.length, 3);
    assert.equal(stats!.content.stats?.[0].value, "500+");
  });

  test("Stats section renders with sf-stat__value + sf-stat__label markup", () => {
    const schema = schemaFromSoul({
      business_name: "TestSaaS",
      industry: "saas-developer-tools",
    });
    const out = renderWithGeneralServiceV1(
      schema,
      tokensForPersonality("cinematic"),
      schema.media
    );
    assert.match(out.html, /sf-stat__value/);
    assert.match(out.html, /sf-stat__label/);
    assert.match(out.html, /id="sf-stats"/);
    // The "75+" value appears literally in the rendered HTML.
    assert.match(out.html, /75\+/);
    assert.match(out.html, /MCP Tools/);
  });
});

describe("Hero dashboard mockup — SaaS only", () => {
  test("SaaS + cinematic → hero contains the dashboard mockup", () => {
    const schema = schemaFromSoul({
      business_name: "TestSaaS",
      industry: "saas-developer-tools",
    });
    const out = renderWithGeneralServiceV1(
      schema,
      tokensForPersonality("cinematic"),
      schema.media
    );
    assert.match(out.html, /sf-hero__mockup/);
    assert.match(out.html, /sf-mockup__chrome/);
    assert.match(out.html, /sf-mockup__sidebar/);
    assert.match(out.html, /Welcome back/);
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
