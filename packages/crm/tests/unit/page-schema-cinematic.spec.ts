// Unit tests for the cinematic overlay (renderer upgrade — May 1, 2026).
//
// Pin the activation contract: cinematic CSS + sf-cinematic class only
// applied when DesignTokens.mode === "dark" AND tokens.effects.glassmorphism
// is true. Local-service / professional-service workspaces (light mode)
// stay byte-identical to pre-tokens behavior.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildCinematicCss,
  buildFontLink,
  isCinematicMode,
} from "@/lib/blueprint/renderers/cinematic-overlay";
import { renderWithGeneralServiceV1 } from "@/lib/page-schema/renderers/general-service-v1-adapter";
import { schemaFromSoul } from "@/lib/page-schema/schema-from-soul";
import { tokensForPersonality } from "@/lib/page-schema/design-tokens";

const SAAS_SOUL = {
  business_name: "SeldonFrame",
  industry: "saas-developer-tools",
  tagline: "The open-source Business OS platform",
  soul_description: "Open source AI-native Business OS.",
  github_url: "https://github.com/seldonframe/seldonframe",
  offerings: [
    { name: "Free", description: "$0/mo." },
    { name: "Growth", description: "$29/mo." },
  ],
  faqs: [{ q: "Is it free?", a: "Yes." }],
};

const LOCAL_SOUL = {
  business_name: "Phoenix HVAC",
  soul_description: "HVAC repair and installation in Phoenix.",
  offerings: [{ name: "Repair", description: "Same-day." }],
};

describe("isCinematicMode — activation gate", () => {
  test("dark + glassmorphism → cinematic", () => {
    const tokens = tokensForPersonality("cinematic");
    assert.equal(tokens.mode, "dark");
    assert.equal(tokens.effects.glassmorphism, true);
    assert.equal(isCinematicMode(tokens), true);
  });

  test("light + glassmorphism → NOT cinematic (light mode disqualifies)", () => {
    const tokens = tokensForPersonality("cinematic", { mode: "light" });
    assert.equal(isCinematicMode(tokens), false);
  });

  test("dark without glassmorphism → NOT cinematic", () => {
    const tokens = tokensForPersonality("bold");
    assert.equal(tokens.mode, "dark");
    assert.equal(tokens.effects.glassmorphism, false);
    assert.equal(isCinematicMode(tokens), false);
  });

  test("clean personality → NOT cinematic", () => {
    const tokens = tokensForPersonality("clean");
    assert.equal(isCinematicMode(tokens), false);
  });
});

describe("buildCinematicCss", () => {
  test("returns empty for non-cinematic tokens", () => {
    assert.equal(buildCinematicCss(tokensForPersonality("clean")), "");
    assert.equal(buildCinematicCss(tokensForPersonality("bold")), "");
  });

  test("returns CSS scoped under .sf-frame.sf-cinematic", () => {
    const css = buildCinematicCss(tokensForPersonality("cinematic"));
    assert.ok(css.length > 1000, "css too short");
    assert.match(css, /\.sf-frame\.sf-cinematic/);
  });

  test("substitutes accent color into the CSS", () => {
    const css = buildCinematicCss(
      tokensForPersonality("cinematic", { palette: { accent: "#abc123" } })
    );
    assert.match(css, /#abc123/);
  });

  test("substitutes display + body font names", () => {
    const css = buildCinematicCss(tokensForPersonality("cinematic"));
    // Cinematic default = Instrument Serif (display) + Barlow (body)
    assert.match(css, /Instrument Serif/);
    assert.match(css, /Barlow/);
  });

  test("rejects CSS-injection-style font names (sanitized to Inter)", () => {
    const css = buildCinematicCss(
      tokensForPersonality("cinematic", {
        typography: {
          display: "Evil}; @import 'malicious'; }",
          body: "</style><script>",
          scale: "editorial",
        },
      })
    );
    // The substituted output should not contain the injected fragments
    assert.ok(!css.includes("</style>"), "must strip </style>");
    assert.ok(!css.includes("@import 'malicious'"), "must strip @import injection");
  });
});

describe("buildFontLink", () => {
  test("returns Google Fonts <link> when display + body differ", () => {
    const tokens = tokensForPersonality("cinematic");
    const html = buildFontLink(tokens);
    assert.match(html, /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">/);
    assert.match(html, /Instrument\+Serif/);
    assert.match(html, /Barlow/);
  });

  test("returns empty for system-ui-only typography", () => {
    const tokens = tokensForPersonality("cinematic", {
      typography: { display: "system-ui", body: "system-ui", scale: "comfortable" },
    });
    assert.equal(buildFontLink(tokens), "");
  });
});

describe("renderWithGeneralServiceV1 — cinematic vs light", () => {
  test("SaaS schema + cinematic tokens → output has sf-cinematic class", () => {
    const schema = schemaFromSoul(SAAS_SOUL);
    const tokens = tokensForPersonality("cinematic");
    const out = renderWithGeneralServiceV1(schema, tokens, schema.media);
    assert.match(out.html, /class="sf-frame sf-cinematic"/);
  });

  test("SaaS + cinematic → head includes Google Fonts link tags", () => {
    const schema = schemaFromSoul(SAAS_SOUL);
    const tokens = tokensForPersonality("cinematic");
    const out = renderWithGeneralServiceV1(schema, tokens, schema.media);
    assert.match(out.head, /fonts\.googleapis\.com/);
  });

  test("SaaS + cinematic → CSS includes the cinematic overlay rules", () => {
    const schema = schemaFromSoul(SAAS_SOUL);
    const tokens = tokensForPersonality("cinematic");
    const out = renderWithGeneralServiceV1(schema, tokens, schema.media);
    // Strip the wrapping <style> tag to inspect raw CSS
    assert.match(out.head, /\.sf-frame\.sf-cinematic/);
  });

  test("Local-service + clean → output has sf-light class (NOT cinematic)", () => {
    // May 1, 2026 — `clean` personality (mode:"light") now triggers the
    // light/professional overlay. Different visual universe from cinematic.
    const schema = schemaFromSoul(LOCAL_SOUL);
    const tokens = tokensForPersonality("clean");
    const out = renderWithGeneralServiceV1(schema, tokens, schema.media);
    assert.ok(out.html.includes("sf-light"), "light mode should tag sf-light");
    assert.ok(!out.html.includes("sf-cinematic"), "must not be cinematic");
  });

  test("Local-service + clean → head emits Inter preconnect <link> (light mode loads Inter)", () => {
    // Light mode loads Inter via explicit <link rel="preconnect"> +
    // <link rel="stylesheet"> tags. The legacy BASE_CSS still has its
    // own @import for Inter + Instrument Serif (loaded inside the
    // <style> block, not via <link>); that's the V1-existing path
    // shared with non-tokens callers. Pin the cinematic-vs-light
    // distinction by checking the explicit <link> ONLY for the family
    // we expect light mode to preconnect (Inter).
    const schema = schemaFromSoul(LOCAL_SOUL);
    const tokens = tokensForPersonality("clean");
    const out = renderWithGeneralServiceV1(schema, tokens, schema.media);
    assert.ok(out.head.includes('<link rel="preconnect"'), "light mode preconnects for Inter");
    // The cinematic font stack (Instrument Serif + Barlow) is NOT loaded
    // via the explicit <link> tags in light mode. Check the <link href=>
    // lines, not the inner CSS @import.
    const linkLines = out.head.split("\n").filter((line) => line.startsWith("<link"));
    const inLinks = linkLines.join(" ");
    assert.ok(!inLinks.includes("Instrument+Serif"), "light mode <link> tags must not load Instrument Serif");
    assert.ok(!inLinks.includes("Barlow"), "light mode <link> tags must not load Barlow");
  });

  test("Local-service + clean → CSS includes light overlay (sf-frame.sf-light rules)", () => {
    const schema = schemaFromSoul(LOCAL_SOUL);
    const out = renderWithGeneralServiceV1(
      schema,
      tokensForPersonality("clean"),
      schema.media
    );
    assert.match(out.head, /\.sf-frame\.sf-light/);
  });

  test("Cinematic CSS payload is meaningfully larger than light", () => {
    const schema = schemaFromSoul(LOCAL_SOUL);
    const lightOut = renderWithGeneralServiceV1(
      schema,
      tokensForPersonality("clean"),
      schema.media
    );
    const cinematicOut = renderWithGeneralServiceV1(
      schema,
      tokensForPersonality("cinematic"),
      schema.media
    );
    // Both modes ship overlays (light is ~7kb, cinematic ~12kb); cinematic
    // is bigger because of the dashboard-mockup styling + glass effects.
    assert.ok(
      cinematicOut.head.length > lightOut.head.length,
      `cinematic head should be larger (got cinematic=${cinematicOut.head.length}, light=${lightOut.head.length})`
    );
  });
});

describe("SaaS pack pricing-section dedupe", () => {
  test("SaaS schema does NOT include a separate pricing services-grid", () => {
    const schema = schemaFromSoul(SAAS_SOUL);
    // Features section: should appear (the offerings grid).
    const features = schema.sections.filter((s) => s.intent === "features");
    assert.equal(features.length, 1, "expected exactly one features section");
    // Pricing section: should be ABSENT for SaaS pack post-dedupe.
    const pricing = schema.sections.filter((s) => s.intent === "pricing");
    assert.equal(pricing.length, 0, "SaaS pack must not duplicate pricing as a separate section");
  });
});
