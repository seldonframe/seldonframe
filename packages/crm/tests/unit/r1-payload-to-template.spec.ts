// Tests for r1PayloadToTemplateData — maps the R1 landing payload onto the
// shared landing-template `Soul` contract.
//
// Repo convention: node:test + tsx (see scripts/run-unit-tests.js). There is
// no vitest in this monorepo; unit tests live at tests/unit/**/*.spec.ts and
// run via `pnpm test:unit`.
//
// Coverage:
//   1. Representative full payload → all major Soul fields populated, incl.
//      a hero photo with role "hero".
//   2. Minimal payload (optional sections empty/missing) → no throw, absent
//      fields omitted, business_name still produced.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { r1PayloadToTemplateData } from "../../src/lib/landing/r1-payload-to-template";
import type { R1LandingPayload } from "../../src/lib/landing/r1-payload-prompt";

// ── Representative fixture (mirrors a real generated r1 payload) ──────────────
const fullPayload: R1LandingPayload = {
  hero: {
    archetype: "clinical-trust",
    businessName: "Austin Family Chiropractic",
    tagline: "Gentle, expert chiropractic care for the whole family",
    subhead:
      "A family-focused clinic serving every age — from infants to seniors — with spinal adjustments, corrective care, and whole-body wellness.",
    primaryCTA: { label: "Book a consultation", href: "/book" },
    secondaryCTA: { label: "Book online", href: "/book" },
    trustBadges: [{ label: "Licensed Doctors of Chiropractic" }],
    reviewRating: 4.9,
    reviewCount: 287,
    emergencyService: false,
    heroImage: {
      src: "https://images.example.com/hero.jpg",
      alt: "Gentle hands-on chiropractic care",
    },
  },
  services: {
    archetype: "clinical-trust",
    eyebrow: "Our services",
    heading: "Care for every body",
    intro: "We treat the root cause, not just the symptoms.",
    services: [
      { id: "s1", name: "Spinal Adjustment", description: "Restore motion and relieve nerve pressure." },
      { id: "s2", name: "Corrective Care Program", description: "A structured plan to fix the root cause." },
      { id: "s3", name: "Prenatal Chiropractic", description: "Gentle, Webster-certified care through pregnancy." },
    ],
    cta: { label: "Call (512) 555-0182", href: "tel:+15125550182" },
  },
  testimonials: {
    archetype: "clinical-trust",
    eyebrow: "Patient reviews",
    heading: "287 reviews. 4.9 stars.",
    testimonials: [
      { id: "t1", quote: "Dr. Mitchell's prenatal adjustments changed everything.", name: "Jennifer K.", city: "Austin", rating: 5 },
      { id: "t2", quote: "After 8 weeks my chronic back pain is virtually gone.", name: "Marcus T.", rating: 5 },
    ],
    reviewSummary: { rating: 4.9, count: 287, sources: "Google · Yelp" },
  },
  faq: {
    archetype: "clinical-trust",
    eyebrow: "Quick answers",
    heading: "Frequently asked questions",
    items: [
      { id: "f1", question: "Do you accept insurance?", answer: "We accept most major plans." },
      { id: "f2", question: "Is chiropractic safe for children?", answer: "Yes — we use gentle, low-force techniques." },
      { id: "f3", question: "Do I need a referral?", answer: "No referral needed — book directly." },
    ],
  },
  footer: {
    archetype: "clinical-trust",
    businessName: "Austin Family Chiropractic",
    tagline: "Whole-family chiropractic care since 2009.",
    phone: "(512) 555-0182",
    email: "hello@austinfamilychiro.com",
    address: { line1: "3204 Bee Caves Rd, Suite 102", city: "Austin", state: "TX", zip: "78746" },
    serviceAreas: ["Austin", "West Lake Hills", "Bee Cave"],
    license: "Doctor of Chiropractic (DC)",
    trustBadges: [
      { label: "Licensed Doctors of Chiropractic" },
      { label: "Most insurance accepted" },
    ],
  },
};

describe("r1PayloadToTemplateData — representative payload", () => {
  const soul = r1PayloadToTemplateData(fullPayload);

  test("maps hero → business_name / tagline / soul_description", () => {
    assert.equal(soul.business_name, "Austin Family Chiropractic");
    assert.equal(soul.tagline, "Gentle, expert chiropractic care for the whole family");
    assert.ok(soul.soul_description && soul.soul_description.startsWith("A family-focused clinic"));
  });

  test("maps hero review rating + count", () => {
    assert.equal(soul.review_rating, 4.9);
    assert.equal(soul.review_count, 287);
  });

  test("produces a hero photo with role 'hero'", () => {
    assert.ok(Array.isArray(soul.photos));
    const hero = soul.photos!.find((p) => p.role === "hero");
    assert.ok(hero, "expected a photo with role 'hero'");
    assert.equal(hero!.url, "https://images.example.com/hero.jpg");
    assert.equal(hero!.alt, "Gentle hands-on chiropractic care");
  });

  test("maps services → offerings (≥1 with a name, order preserved)", () => {
    assert.ok(Array.isArray(soul.offerings));
    assert.equal(soul.offerings!.length, 3);
    assert.equal(soul.offerings![0].name, "Spinal Adjustment");
    assert.equal(soul.offerings![0].description, "Restore motion and relieve nerve pressure.");
    // r1 service shape carries no price/duration → omitted, not zeroed.
    assert.equal(soul.offerings![0].price, undefined);
    assert.equal(soul.offerings![0].duration_minutes, undefined);
  });

  test("maps testimonials → { name, text }", () => {
    assert.equal(soul.testimonials!.length, 2);
    assert.equal(soul.testimonials![0].name, "Jennifer K.");
    assert.equal(soul.testimonials![0].text, "Dr. Mitchell's prenatal adjustments changed everything.");
  });

  test("maps faq items → { q, a }", () => {
    assert.equal(soul.faqs!.length, 3);
    assert.equal(soul.faqs![0].q, "Do you accept insurance?");
    assert.equal(soul.faqs![0].a, "We accept most major plans.");
  });

  test("maps footer → phone / email / joined address / service_area", () => {
    assert.equal(soul.phone, "(512) 555-0182");
    assert.equal(soul.email, "hello@austinfamilychiro.com");
    assert.equal(soul.address, "3204 Bee Caves Rd, Suite 102, Austin, TX 78746");
    assert.deepEqual(soul.service_area, ["Austin", "West Lake Hills", "Bee Cave"]);
  });

  test("maps footer trustBadges → trust_signals and license → certifications", () => {
    assert.deepEqual(soul.trust_signals, [
      "Licensed Doctors of Chiropractic",
      "Most insurance accepted",
    ]);
    assert.deepEqual(soul.certifications, ["Doctor of Chiropractic (DC)"]);
  });
});

describe("r1PayloadToTemplateData — minimal payload", () => {
  // Only the five required top-level sections, each with the bare minimum.
  // Optional sub-fields (reviews, photos, faqs, testimonials, address, etc.)
  // are intentionally absent.
  const minimal: R1LandingPayload = {
    hero: {
      archetype: "soft-residential",
      businessName: "Cedar Park Wellness",
      tagline: "Feel better, naturally",
      subhead: "",
      primaryCTA: { label: "Book", href: "/book" },
      trustBadges: [],
    },
    services: {
      archetype: "soft-residential",
      heading: "What we do",
      services: [],
    },
    testimonials: {
      archetype: "soft-residential",
      heading: "What our patients say",
      testimonials: [],
    },
    faq: {
      archetype: "soft-residential",
      heading: "Frequently asked questions",
      items: [],
    },
    footer: {
      archetype: "soft-residential",
      businessName: "Cedar Park Wellness",
      phone: "",
    },
  };

  test("does not throw on missing optional sections", () => {
    assert.doesNotThrow(() => r1PayloadToTemplateData(minimal));
  });

  test("still produces business_name", () => {
    const soul = r1PayloadToTemplateData(minimal);
    assert.equal(soul.business_name, "Cedar Park Wellness");
  });

  test("omits absent fields rather than emitting empties", () => {
    const soul = r1PayloadToTemplateData(minimal);
    assert.equal(soul.soul_description, undefined); // hero.subhead was ""
    assert.equal(soul.phone, undefined); // footer.phone was ""
    assert.equal(soul.address, undefined);
    assert.equal(soul.review_rating, undefined);
    assert.equal(soul.review_count, undefined);
    assert.equal(soul.offerings, undefined);
    assert.equal(soul.testimonials, undefined);
    assert.equal(soul.faqs, undefined);
    assert.equal(soul.photos, undefined);
    assert.equal(soul.service_area, undefined);
    assert.equal(soul.trust_signals, undefined);
    assert.equal(soul.certifications, undefined);
  });

  test("tagline still maps when present", () => {
    const soul = r1PayloadToTemplateData(minimal);
    assert.equal(soul.tagline, "Feel better, naturally");
  });
});
