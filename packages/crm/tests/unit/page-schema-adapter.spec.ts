// Unit tests for the GeneralServiceV1Renderer adapter (A5).
//
// Pins the conversion contract end-to-end: PageSchema → Blueprint → HTML.
// The legacy renderer's full output is huge (themed CSS + animation
// scripts), so we assert against substrings that prove content + CTAs +
// nav-phone-conditionality landed correctly.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  blueprintFromSchema,
} from "@/lib/page-schema/renderers/blueprint-from-schema";
import {
  GeneralServiceV1Renderer,
  renderWithGeneralServiceV1,
} from "@/lib/page-schema/renderers/general-service-v1-adapter";
import { schemaFromSoul } from "@/lib/page-schema/schema-from-soul";
import { tokensForPersonality } from "@/lib/page-schema/design-tokens";
import type { PageSchema } from "@/lib/page-schema/types";

const seldonFrameSoul = {
  business_name: "SeldonFrame",
  industry: "saas-developer-tools",
  business_type: "saas",
  tagline: "The open-source Business OS platform",
  soul_description: "Open-source AI-native Business OS for builders.",
  github_url: "https://github.com/seldonframe/seldonframe",
  docs_url: "https://seldonframe.com/docs",
  discord_url: "https://discord.gg/sbVUu976NW",
  offerings: [
    { name: "Free", description: "$0 forever." },
    { name: "Growth", description: "$29/mo + usage." },
    { name: "Scale", description: "$99/mo + usage." },
  ],
  faqs: [
    { q: "Is it free?", a: "Yes." },
    { q: "Self-host?", a: "MIT licensed." },
  ],
};

describe("blueprintFromSchema — workspace conversion", () => {
  test("PageBusiness → Blueprint.workspace with name + tagline + theme", () => {
    const schema = schemaFromSoul(seldonFrameSoul);
    const tokens = tokensForPersonality("clean");
    const blueprint = blueprintFromSchema(schema, tokens);

    assert.equal(blueprint.workspace.name, "SeldonFrame");
    assert.equal(
      blueprint.workspace.tagline,
      "The open-source Business OS platform"
    );
    assert.equal(blueprint.workspace.theme.mode, "light"); // clean = light
    assert.equal(blueprint.workspace.theme.accent, "#14b8a6"); // default
  });

  test("SaaS workspace gets empty contact.phone (no phone CTA in nav)", () => {
    const schema = schemaFromSoul(seldonFrameSoul);
    const tokens = tokensForPersonality("clean");
    const blueprint = blueprintFromSchema(schema, tokens);
    assert.equal(blueprint.workspace.contact.phone, "");
  });

  test("local_service workspace gets default Mon-Fri 9-5 hours", () => {
    const localSoul = {
      business_name: "Phoenix HVAC",
      soul_description: "HVAC repair and installation in Phoenix.",
    };
    const schema = schemaFromSoul(localSoul);
    const tokens = tokensForPersonality("clean");
    const blueprint = blueprintFromSchema(schema, tokens);
    assert.deepEqual(blueprint.workspace.contact.hours.mon, [9, 17]);
    assert.equal(blueprint.workspace.contact.hours.sat, null);
  });

  test("industry string maps from business type", () => {
    const saasSchema = schemaFromSoul(seldonFrameSoul);
    const localSchema = schemaFromSoul({
      business_name: "X",
      soul_description: "HVAC repair",
    });
    const tokens = tokensForPersonality("clean");
    assert.equal(blueprintFromSchema(saasSchema, tokens).workspace.industry, "saas");
    assert.equal(
      blueprintFromSchema(localSchema, tokens).workspace.industry,
      "general-service"
    );
  });
});

describe("blueprintFromSchema — section conversion + actions", () => {
  test("hero section gets primary + secondary CTAs from PageSchema actions", () => {
    const schema = schemaFromSoul(seldonFrameSoul);
    const blueprint = blueprintFromSchema(schema, tokensForPersonality("clean"));

    const hero = blueprint.landing.sections.find((s) => s.type === "hero");
    assert.ok(hero, "no hero section produced");
    if (hero?.type !== "hero") throw new Error("not a hero");
    assert.equal(hero.headline, "The open-source Business OS platform");
    assert.match(hero.ctaPrimary.label, /Start for \$0/);
    // Secondary CTA = "See a demo →" → /book per SaaS pack
    assert.ok(hero.ctaSecondary);
    assert.equal(hero.ctaSecondary?.href, "/book");
  });

  test("services section becomes services-grid with offerings as items", () => {
    const schema = schemaFromSoul(seldonFrameSoul);
    const blueprint = blueprintFromSchema(schema, tokensForPersonality("clean"));

    const services = blueprint.landing.sections.find(
      (s) => s.type === "services-grid"
    );
    assert.ok(services, "no services-grid produced");
    if (services?.type !== "services-grid") throw new Error("wrong type");
    // 3 offerings (Free, Growth, Scale)
    assert.equal(services.items.length, 3);
    assert.equal(services.items[1].title, "Growth");
  });

  test("FAQ section carries soul.faqs as items", () => {
    const schema = schemaFromSoul(seldonFrameSoul);
    const blueprint = blueprintFromSchema(schema, tokensForPersonality("clean"));

    const faq = blueprint.landing.sections.find((s) => s.type === "faq");
    assert.ok(faq, "no faq section");
    if (faq?.type !== "faq") throw new Error("wrong type");
    assert.equal(faq.items.length, 2);
    assert.equal(faq.items[0].question, "Is it free?");
  });

  test("hidden sections are dropped", () => {
    const schema: PageSchema = {
      ...schemaFromSoul(seldonFrameSoul),
    };
    // Hide the FAQ section
    const faqIndex = schema.sections.findIndex((s) => s.intent === "faq");
    schema.sections[faqIndex].visible = false;

    const blueprint = blueprintFromSchema(schema, tokensForPersonality("clean"));
    assert.ok(
      !blueprint.landing.sections.some((s) => s.type === "faq"),
      "hidden faq leaked into blueprint"
    );
  });

  test("sections respect order (lower order renders first)", () => {
    const schema = schemaFromSoul(seldonFrameSoul);
    const blueprint = blueprintFromSchema(schema, tokensForPersonality("clean"));

    // Hero (order 10) must come before features (order 30) must come
    // before footer (order 100).
    const types = blueprint.landing.sections.map((s) => s.type);
    const heroIdx = types.indexOf("hero");
    const trustIdx = types.indexOf("trust-strip");
    const footerIdx = types.indexOf("footer");
    assert.ok(heroIdx < trustIdx, "hero should render before trust-strip");
    assert.ok(trustIdx < footerIdx, "trust-strip should render before footer");
  });
});

describe("renderWithGeneralServiceV1 — end-to-end render", () => {
  test("produces non-empty html + head", () => {
    const schema = schemaFromSoul(seldonFrameSoul);
    const tokens = tokensForPersonality("clean");
    const out = renderWithGeneralServiceV1(schema, tokens, schema.media);

    assert.ok(out.html.length > 1000, "html too short");
    assert.ok(out.head.startsWith("<style>"), "head missing CSS wrap");
    assert.equal(out.framework, "static");
  });

  test("rendered HTML contains the workspace name in the navbar", () => {
    const schema = schemaFromSoul(seldonFrameSoul);
    const out = renderWithGeneralServiceV1(
      schema,
      tokensForPersonality("clean"),
      schema.media
    );
    // The nav brand has the workspace name.
    assert.match(out.html, /SeldonFrame/);
  });

  test("rendered HTML contains the SaaS hero CTA", () => {
    const schema = schemaFromSoul(seldonFrameSoul);
    const out = renderWithGeneralServiceV1(
      schema,
      tokensForPersonality("clean"),
      schema.media
    );
    assert.match(out.html, /Start for \$0/);
  });

  test("SaaS workspace HTML has NO phone CTA in nav (B2 verification)", () => {
    const schema = schemaFromSoul(seldonFrameSoul);
    const out = renderWithGeneralServiceV1(
      schema,
      tokensForPersonality("clean"),
      schema.media
    );
    // sf-navbar__cta is the phone CTA pill class. SaaS pages should not
    // render it (no phone in PageBusiness → empty Blueprint contact.phone
    // → renderNavbar's isUsablePhone() returns false → CTA omitted).
    assert.ok(
      !out.html.includes('sf-navbar__cta'),
      "SaaS rendered HTML must not contain the navbar phone CTA"
    );
  });

  test("local-service workspace HTML preserves phone CTA in nav", () => {
    // A local-service Soul with explicit phone — overrides keep working.
    const schema = schemaFromSoul(
      {
        business_name: "Phoenix HVAC",
        soul_description: "HVAC repair and installation in Phoenix.",
      },
      {
        business_overrides: { phone: "+15551234567" },
      }
    );
    const out = renderWithGeneralServiceV1(
      schema,
      tokensForPersonality("clean"),
      schema.media
    );
    assert.ok(
      out.html.includes('sf-navbar__cta'),
      "local-service rendered HTML must include the navbar phone CTA"
    );
  });

  test("CTA section button has a real href (B2 verification)", () => {
    const schema = schemaFromSoul(seldonFrameSoul);
    const out = renderWithGeneralServiceV1(
      schema,
      tokensForPersonality("clean"),
      schema.media
    );
    // The hero/cta primary should link to /intake (SaaS pack default).
    assert.match(out.html, /href="\/intake"/);
  });

  test("rendered HTML contains FAQ questions from Soul", () => {
    const schema = schemaFromSoul(seldonFrameSoul);
    const out = renderWithGeneralServiceV1(
      schema,
      tokensForPersonality("clean"),
      schema.media
    );
    assert.match(out.html, /Is it free\?/);
    assert.match(out.html, /Self-host\?/);
  });

  test("removePoweredBy flag suppresses 'Powered by' link", () => {
    const schema = schemaFromSoul(seldonFrameSoul);
    const tokens = tokensForPersonality("clean");
    const withBranding = renderWithGeneralServiceV1(schema, tokens, schema.media, {
      removePoweredBy: false,
    });
    const withoutBranding = renderWithGeneralServiceV1(schema, tokens, schema.media, {
      removePoweredBy: true,
    });
    // The Powered-by footer link contains "Powered by" — should appear in
    // withBranding but not withoutBranding.
    assert.match(withBranding.html, /Powered by/);
    assert.ok(
      !withoutBranding.html.includes("Powered by"),
      "removePoweredBy:true must suppress the badge"
    );
  });
});

describe("GeneralServiceV1Renderer.meta", () => {
  test("registered with id 'general-service-v1'", () => {
    assert.equal(GeneralServiceV1Renderer.meta.id, "general-service-v1");
  });
  test("supports every business type", () => {
    const types = GeneralServiceV1Renderer.meta.supports.business_types;
    for (const t of [
      "local_service",
      "professional_service",
      "saas",
      "agency",
      "ecommerce",
      "other",
    ]) {
      assert.ok(types.includes(t as never), `missing ${t}`);
    }
  });
  test("framework is 'static' (no client-side React)", () => {
    assert.equal(GeneralServiceV1Renderer.meta.framework, "static");
  });
});
