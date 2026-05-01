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

  test("saas trust badges include 'Open source' (no 'Licensed & insured')", () => {
    const pack = getContentPack("saas");
    assert.ok(
      pack.trust_badges.some((b) => /Open source/i.test(b)),
      "missing 'Open source'"
    );
    // "Licensed & insured" is the local-service-flavored badge we want to
    // keep out of SaaS. "MIT licensed" (a software-license badge) is fine
    // and shows up in the SaaS pack — match the full local-service phrase
    // rather than just "Licensed".
    assert.ok(
      !pack.trust_badges.some((b) => /licensed (?:and|&) insured/i.test(b)),
      "saas pack must not carry the 'Licensed & insured' local-service badge"
    );
  });

  test("saas hero CTA = 'Start for $0 →'", () => {
    const pack = getContentPack("saas");
    const heroPrimary = pack.actions.find(
      (a) => a.id === "hero_primary" && a.placement.includes("hero")
    );
    assert.ok(heroPrimary, "missing saas hero_primary");
    assert.match(heroPrimary!.text, /Start for \$0/);
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

  test("features section has product capabilities (NOT offerings) — SaaS pack ships hardcoded items", () => {
    // May 1, 2026 — SaaS pack ships 4 product features (Landing Pages,
    // Booking System, CRM + Pipeline, AI Agents). enrichOfferings sees
    // pre-populated items and skips overwriting with soul.offerings
    // (which on SaaS workspaces is the pricing tier list — wrong for a
    // features grid).
    const schema = schemaFromSoul(seldonFrameSoul);
    const features = schema.sections.find((s) => s.intent === "features");
    assert.ok(features, "saas pack should produce a features section");
    assert.equal(features!.content.items?.length, 4);
    const titles = features!.content.items?.map((i) => i.title);
    assert.deepEqual(titles, ["Landing Pages", "Booking System", "CRM + Pipeline", "AI Agents"]);
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
    // No github_url in the Soul → SaaS pack's GitHub button gets filtered out
    // rather than rendering as `https://...{github_url}`.
    const schema = schemaFromSoul({
      business_name: "TestCo",
      industry: "saas",
    });
    const githubAction = schema.actions.find((a) => a.text === "GitHub");
    // Should be undefined (filtered) or have a real URL — never the literal template.
    if (githubAction) {
      assert.doesNotMatch(githubAction.href, /\{github_url\}/);
    }
  });

  test("template-style action hrefs resolve when github_url is present", () => {
    const schema = schemaFromSoul({
      business_name: "TestCo",
      industry: "saas",
      github_url: "https://github.com/example/repo",
    });
    const githubAction = schema.actions.find((a) => a.text === "GitHub");
    assert.ok(githubAction, "should render a GitHub action when url present");
    assert.equal(githubAction!.href, "https://github.com/example/repo");
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
