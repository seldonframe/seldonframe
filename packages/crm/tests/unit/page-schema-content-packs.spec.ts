// Unit tests for content packs (B1) + schemaFromSoul (A5).
//
// Pins the structural contract: every business type produces a complete
// PageSchema with the required sections + actions + trust badges, and Soul
// data overrides pack defaults where present.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  applyContentPackToSchema,
  getContentPack,
} from "@/lib/page-schema/content-packs";
import { schemaFromSoul } from "@/lib/page-schema/schema-from-soul";
import {
  selectRenderer,
  RENDERER_REGISTRY,
} from "@/lib/page-schema/registry";
import {
  tokensForPersonality,
  PERSONALITY_DEFAULTS,
} from "@/lib/page-schema/design-tokens";
import type { BusinessType } from "@/lib/page-schema/types";

describe("getContentPack — every business type returns a usable pack", () => {
  const types: BusinessType[] = [
    "local_service",
    "professional_service",
    "saas",
    "agency",
    "ecommerce",
    "other",
  ];

  for (const type of types) {
    test(`${type} pack has hero + faq + cta + footer sections`, () => {
      const pack = getContentPack(type);
      const intents = pack.sections.map((s) => s.intent);
      assert.ok(intents.includes("hero"), "missing hero");
      assert.ok(intents.includes("faq"), "missing faq");
      assert.ok(intents.includes("cta"), "missing cta");
      assert.ok(intents.includes("footer"), "missing footer");
    });

    test(`${type} pack has at least one primary action`, () => {
      const pack = getContentPack(type);
      const primary = pack.actions.find((a) => a.style === "primary");
      assert.ok(primary, "no primary action defined");
      assert.ok(primary!.text.length > 0, "primary action has empty text");
      assert.ok(primary!.href.length > 0, "primary action has empty href");
    });

    test(`${type} pack returns deep-cloned data (mutating doesn't leak)`, () => {
      const a = getContentPack(type);
      const b = getContentPack(type);
      a.sections[0].content.headline = "MUTATED";
      assert.notEqual(b.sections[0].content.headline, "MUTATED");
    });
  }
});

describe("content packs honor business-type personality", () => {
  test("local_service shows phone in nav (operator dials in)", () => {
    const pack = getContentPack("local_service");
    assert.equal(pack.nav.show_phone, true);
    assert.equal(pack.footer.show_phone, true);
    assert.equal(pack.footer.show_hours, true);
  });

  test("saas does NOT show phone (no telephone for software)", () => {
    const pack = getContentPack("saas");
    assert.equal(pack.nav.show_phone, false);
    assert.equal(pack.footer.show_phone, false);
    assert.equal(pack.footer.show_hours, false);
  });

  test("local_service trust badges include 'Licensed & insured'", () => {
    const pack = getContentPack("local_service");
    assert.ok(
      pack.trust_badges.some((b) => /Licensed/i.test(b)),
      `expected a 'Licensed' badge, got ${JSON.stringify(pack.trust_badges)}`
    );
  });

  test("saas trust badges are NEUTRAL (no SeldonFrame-specific 'Open source / MIT licensed' copy)", () => {
    // v1.1.7 — SAAS_PACK rewritten neutral. The previous pack hardcoded
    // SeldonFrame's own marketing badges ("Open source", "MIT licensed",
    // "Free forever to self-host") — when ANY workspace got
    // misclassified as SaaS, the visitor saw SeldonFrame branding on a
    // stranger's landing page. Now the SaaS pack ships generic copy.
    const pack = getContentPack("saas");
    assert.ok(
      !pack.trust_badges.some((b) => /MIT licensed|Open source/i.test(b)),
      `saas pack must not carry SeldonFrame-specific badges, got ${JSON.stringify(pack.trust_badges)}`
    );
    assert.ok(
      !pack.trust_badges.some((b) => /licensed (?:and|&) insured/i.test(b)),
      "saas pack must not carry the 'Licensed & insured' local-service badge"
    );
  });

  test("saas hero CTA is generic (no SeldonFrame-specific 'Start for $0')", () => {
    // v1.1.7 — generic "Get started" CTA. SeldonFrame's own marketing
    // CTAs live in apps/web, not in the operator-workspace content pack.
    const pack = getContentPack("saas");
    const heroPrimary = pack.actions.find(
      (a) => a.id === "hero_primary" && a.placement.includes("hero")
    );
    assert.ok(heroPrimary, "missing saas hero_primary");
    assert.doesNotMatch(
      heroPrimary!.text,
      /Start for \$0|MCP|MIT licensed/,
      "must not carry SeldonFrame-specific copy"
    );
    // Generic CTA — actionable + neutral
    assert.match(heroPrimary!.text, /get started|book|try|sign/i);
  });
});

describe("applyContentPackToSchema — FAQ defaults inject", () => {
  test("FAQ section gets pack default_faqs filled in", () => {
    const partial = applyContentPackToSchema("saas", "TestCo");
    const faq = partial.sections.find((s) => s.intent === "faq");
    assert.ok(faq, "no faq section");
    assert.ok(faq!.content.faqs && faq!.content.faqs.length > 0, "FAQ has no items");
    // The SaaS default FAQ should at least mention pricing or self-host
    const allText = JSON.stringify(faq!.content.faqs);
    assert.match(allText, /self-host|pricing|free/i);
  });
});

describe("schemaFromSoul — merges Soul data onto pack defaults", () => {
  const seldonFrameSoul = {
    business_name: "SeldonFrame",
    industry: "saas-developer-tools",
    tagline: "The open-source Business OS platform",
    soul_description:
      "Open-source AI-native Business OS for indie operators, agencies, and SMBs.",
    offerings: [
      { name: "Free", price: 0, description: "1 workspace, 50 contacts." },
      { name: "Growth", price: 29, description: "3 workspaces, custom domain." },
      { name: "Scale", price: 99, description: "Unlimited workspaces, white-label." },
    ],
    faqs: [
      { q: "Is it free?", a: "Yes, free forever." },
      { q: "Self-host?", a: "Yes, MIT licensed." },
    ],
    pipeline_stages: [
      { name: "Lead", order: 1 },
      { name: "Demo Scheduled", order: 2 },
    ],
  };

  test("classifies as saas → uses SaaS pack", () => {
    const schema = schemaFromSoul(seldonFrameSoul);
    assert.equal(schema.business.type, "saas");
  });

  test("hero headline = soul.tagline (not pack default)", () => {
    const schema = schemaFromSoul(seldonFrameSoul);
    const hero = schema.sections.find((s) => s.intent === "hero");
    assert.equal(hero?.content.headline, "The open-source Business OS platform");
  });

  test("features section is empty by default — populated from soul.offerings", () => {
    // v1.1.7 — SAAS_PACK ships an empty features list so enrichOfferings
    // populates from the operator's soul.offerings instead of the
    // previous SeldonFrame-specific defaults ("Landing Pages / Booking
    // System / 75 MCP Tools / Brain Layer"). When a misclassified
    // workspace had no offerings, the operator was advertising
    // SeldonFrame's products on their own landing page.
    const schema = schemaFromSoul(seldonFrameSoul);
    const features = schema.sections.find((s) => s.intent === "features");
    assert.ok(features, "saas pack should produce a features section");
    // soul.offerings is the pricing-tier list (Free/Growth/Scale) for
    // this fixture; enrichOfferings populates them as items.
    assert.equal(features!.content.items?.length, 3);
    const titles = features!.content.items?.map((i) => i.title);
    assert.deepEqual(titles, ["Free", "Growth", "Scale"]);
  });

  test("FAQ section uses soul.faqs (overrides defaults)", () => {
    const schema = schemaFromSoul(seldonFrameSoul);
    const faq = schema.sections.find((s) => s.intent === "faq");
    assert.equal(faq?.content.faqs?.length, 2);
    assert.equal(faq?.content.faqs?.[0].question, "Is it free?");
  });

  test("explicit business_type override wins over auto-classification", () => {
    const schema = schemaFromSoul(
      { ...seldonFrameSoul, soul_description: "Roofing contractor" },
      { business_type: "saas" }
    );
    assert.equal(schema.business.type, "saas");
  });

  test("template-style action hrefs (`{github_url}`) are dropped when missing", () => {
    // v1.1.7 — SAAS_PACK no longer hardcodes GitHub/Docs/Discord nav
    // links pointing at SeldonFrame's repo. The classifier output
    // doesn't carry GitHub URLs by default, so the action would be
    // filtered. Keep the test as a regression guard: if any action
    // ever does template a github_url, it must resolve or disappear.
    const schema = schemaFromSoul({
      business_name: "TestCo",
      industry: "saas",
    });
    const githubAction = schema.actions.find((a) => a.text === "GitHub");
    // v1.1.7: SAAS_PACK no longer ships a GitHub action — undefined OK.
    if (githubAction) {
      assert.doesNotMatch(githubAction.href, /\{github_url\}/);
    }
  });

  test("schemaFromSoul never emits a literal {github_url} or {docs_url} template", () => {
    // v1.1.7 — explicit invariant. Even if a future content-pack
    // change reintroduces github_url action templates, schemaFromSoul
    // must never leak the literal placeholder into the rendered page.
    const schema = schemaFromSoul({
      business_name: "TestCo",
      industry: "saas",
    });
    for (const action of schema.actions) {
      assert.doesNotMatch(
        action.href,
        /\{[a-z_]+\}/,
        `action ${action.id} leaked an unresolved placeholder: ${action.href}`
      );
    }
  });

  test("local-service Soul never gets SaaS pack content", () => {
    const localSoul = {
      business_name: "Phoenix Roofing",
      soul_description: "Roofing contractor in Phoenix, AZ.",
      offerings: [{ name: "Roof Repair", description: "Same-day repair." }],
    };
    const schema = schemaFromSoul(localSoul);
    assert.equal(schema.business.type, "local_service");
    // Local-service pack uses 'services' not 'features'.
    assert.ok(schema.sections.some((s) => s.intent === "services"));
    assert.ok(!schema.sections.some((s) => s.intent === "features"));
    // Trust badges should mention "Licensed", not "Open source".
    assert.ok(schema.proof.trust_badges.some((b) => /Licensed|insured/i.test(b)));
  });
});

describe("selectRenderer — registry fallbacks", () => {
  test("returns general-service-v1 for SaaS + clean (registry-backed)", () => {
    const r = selectRenderer("saas", "clean");
    assert.equal(r.id, "general-service-v1");
  });

  test("returns general-service-v1 for any business type (V1 invariant)", () => {
    for (const type of [
      "local_service",
      "professional_service",
      "saas",
      "agency",
      "ecommerce",
      "other",
    ] as const) {
      const r = selectRenderer(type, "clean");
      assert.equal(r.id, "general-service-v1", `failed for ${type}`);
    }
  });

  test("registry contains at least one renderer (no empty registry)", () => {
    assert.ok(RENDERER_REGISTRY.length >= 1);
  });
});

describe("tokensForPersonality — fills required fields with sensible defaults", () => {
  test("cinematic personality enables effects + dark mode", () => {
    const t = tokensForPersonality("cinematic");
    assert.equal(t.mode, "dark");
    assert.equal(t.effects.glassmorphism, true);
    assert.equal(t.effects.video_background, true);
    assert.equal(t.motion, "cinematic");
  });

  test("clean personality is light + minimal effects", () => {
    const t = tokensForPersonality("clean");
    assert.equal(t.mode, "light");
    assert.equal(t.effects.glassmorphism, false);
    assert.equal(t.effects.video_background, false);
  });

  test("operator override beats personality default", () => {
    const t = tokensForPersonality("cinematic", {
      mode: "light",
      palette: { accent: "#ff00ff" },
    });
    assert.equal(t.mode, "light");
    assert.equal(t.palette.accent, "#ff00ff");
    // But unspecified fields still come from the personality default.
    assert.equal(t.effects.glassmorphism, true);
  });

  test("PERSONALITY_DEFAULTS has an entry per personality", () => {
    const personalities = [
      "cinematic",
      "clean",
      "editorial",
      "bold",
      "minimal",
      "playful",
    ] as const;
    for (const p of personalities) {
      assert.ok(PERSONALITY_DEFAULTS[p], `missing defaults for ${p}`);
    }
  });
});
