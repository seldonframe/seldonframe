// Tests for renderLandingTemplate — the shared pure-function template
// dispatcher extracted from /w/[slug]'s inline template branch, so both
// /w/[slug] and the /s/[orgSlug]/[...slug] subdomain route render the exact
// same premium-template output (parity fix, 2026-07-14).
//
// Repo convention: node:test + tsx (see scripts/run-unit-tests.js). No
// vitest in this monorepo; unit tests live at tests/unit/**/*.spec.ts.
//
// The function returns a plain React element (`React.createElement(Tpl, ...)`,
// never JSX-rendered), so we assert directly on `.type` (referential
// equality against LANDING_TEMPLATES[id]) and `.props` — no DOM/renderToString
// needed.
//
// Coverage (spec test cases 1-6):
//   1. Unregistered / undefined landingTemplate → null.
//   2. Registered id + r1 payload → element.type is the registered
//      component; props.data.business_name from the payload;
//      props.ctas.bookUrl/intakeUrl are workspace-scoped;
//      props.ctas.callHref is tel-normalized.
//   3. r1: null + soul → data mapped via submittedSoulToTemplateData.
//   4. Explicit archetype (r1.archetype or themeArchetype) in ARCHETYPES →
//      props.theme is the mapped SfTheme; r1.archetype wins over
//      themeArchetype.
//   5. No archetype anywhere / unknown archetype string → props.theme is
//      undefined (template renders its own signature palette).
//   6. withTemplateDefaults applied — empty photo slots filled from the
//      template's curated fixtures.

import { describe, test, before } from "node:test";
import assert from "node:assert/strict";

before(() => {
  // buildTemplateCtas / buildWorkspaceUrls read this; unset in CI by
  // default. Fix it so href assertions are deterministic regardless of env.
  process.env.WORKSPACE_BASE_DOMAIN = "app.seldonframe.com";
});

import { renderLandingTemplate } from "../../../src/lib/landing/render-landing-template";
import { LANDING_TEMPLATES } from "../../../src/components/landing-templates/registry";
import type { R1LandingPayload } from "../../../src/lib/landing/r1-payload-prompt";

// ── Representative r1 fixture (mirrors r1-payload-to-template.spec.ts) ────────
const fullPayload: R1LandingPayload = {
  hero: {
    archetype: "clinical-trust",
    businessName: "Austin Family Chiropractic",
    tagline: "Gentle, expert chiropractic care for the whole family",
    subhead:
      "A family-focused clinic serving every age — from infants to seniors.",
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
    ],
    reviewSummary: { rating: 4.9, count: 287, sources: "Google · Yelp" },
  },
  faq: {
    archetype: "clinical-trust",
    eyebrow: "Quick answers",
    heading: "Frequently asked questions",
    items: [
      { id: "f1", question: "Do you accept insurance?", answer: "We accept most major plans." },
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
    trustBadges: [{ label: "Licensed Doctors of Chiropractic" }],
  },
};

const rawSoul = {
  business_name: "Riverside Physiotherapy",
  tagline: "Move better, live stronger",
  phone: "(604) 555-0144",
};

const REGISTERED_ID = "earthy-modern-clinical"; // maps r1's clinical-trust vertical closely enough; id is what matters here

describe("renderLandingTemplate — case 1: unregistered/undefined template", () => {
  test("undefined landingTemplate → null", () => {
    const result = renderLandingTemplate({
      slug: "acme",
      orgId: "org_1",
      landingTemplate: undefined,
      r1: { payload: fullPayload, archetype: "clinical-trust" },
      soul: null,
      themeArchetype: undefined,
    });
    assert.equal(result, null);
  });

  test("unregistered string id → null", () => {
    const result = renderLandingTemplate({
      slug: "acme",
      orgId: "org_1",
      landingTemplate: "not-a-real-template",
      r1: { payload: fullPayload, archetype: "clinical-trust" },
      soul: null,
      themeArchetype: undefined,
    });
    assert.equal(result, null);
  });
});

describe("renderLandingTemplate — case 2: registered id + r1 payload", () => {
  const result = renderLandingTemplate({
    slug: "austin-family-chiro",
    orgId: "org_abc",
    landingTemplate: REGISTERED_ID,
    r1: { payload: fullPayload, archetype: "clinical-trust" },
    soul: null,
    themeArchetype: undefined,
  });

  test("returns an element", () => {
    assert.ok(result, "expected a non-null element");
  });

  test("element.type is the registered template component", () => {
    assert.equal(result!.type, LANDING_TEMPLATES[REGISTERED_ID]);
  });

  test("props.data.business_name comes from the r1 payload", () => {
    assert.equal(result!.props.data.business_name, "Austin Family Chiropractic");
  });

  test("props.ctas.bookUrl/intakeUrl are workspace-scoped", () => {
    assert.match(result!.props.ctas.bookUrl, /austin-family-chiro/);
    assert.ok(result!.props.ctas.intakeUrl, "expected an intakeUrl");
    assert.match(result!.props.ctas.intakeUrl, /austin-family-chiro/);
  });

  test("props.ctas.callHref is tel-normalized from the payload phone", () => {
    assert.equal(result!.props.ctas.callHref, "tel:5125550182");
  });
});

describe("renderLandingTemplate — case 3: r1 null + soul fallback", () => {
  const result = renderLandingTemplate({
    slug: "riverside-physio",
    orgId: "org_def",
    landingTemplate: REGISTERED_ID,
    r1: null,
    soul: rawSoul,
    themeArchetype: undefined,
  });

  test("returns an element mapped via submittedSoulToTemplateData", () => {
    assert.ok(result);
    assert.equal(result!.props.data.business_name, "Riverside Physiotherapy");
    assert.equal(result!.props.data.tagline, "Move better, live stronger");
  });

  test("ctas.callHref derives from the soul's phone", () => {
    assert.equal(result!.props.ctas.callHref, "tel:6045550144");
  });
});

describe("renderLandingTemplate — case 4: explicit archetype re-skin", () => {
  test("r1.archetype (in ARCHETYPES) → mapped SfTheme", () => {
    const result = renderLandingTemplate({
      slug: "acme",
      orgId: "org_1",
      landingTemplate: REGISTERED_ID,
      r1: { payload: fullPayload, archetype: "bold-urgency" },
      soul: null,
      themeArchetype: undefined,
    });
    assert.ok(result!.props.theme, "expected a theme object");
    assert.ok(result!.props.theme.primary, "expected a primary color token");
  });

  test("themeArchetype used when r1.archetype absent (r1: null case)", () => {
    const result = renderLandingTemplate({
      slug: "acme",
      orgId: "org_1",
      landingTemplate: REGISTERED_ID,
      r1: null,
      soul: rawSoul,
      themeArchetype: "cinematic-aspirational",
    });
    assert.ok(result!.props.theme, "expected a theme object");
  });

  test("r1.archetype wins over themeArchetype when both present", () => {
    const winsWithBoldUrgency = renderLandingTemplate({
      slug: "acme",
      orgId: "org_1",
      landingTemplate: REGISTERED_ID,
      r1: { payload: fullPayload, archetype: "bold-urgency" },
      soul: null,
      themeArchetype: "clinical-trust",
    });
    const clinicalTrustOnly = renderLandingTemplate({
      slug: "acme",
      orgId: "org_1",
      landingTemplate: REGISTERED_ID,
      r1: { payload: fullPayload, archetype: "clinical-trust" },
      soul: null,
      themeArchetype: "clinical-trust",
    });
    // Different archetype ids should map to different theme tokens (unless
    // the palettes happen to collide, which bold-urgency/clinical-trust do
    // not in this registry) — proves r1.archetype (not themeArchetype) drove
    // the first result even though themeArchetype was also present.
    assert.notDeepEqual(winsWithBoldUrgency!.props.theme, clinicalTrustOnly!.props.theme);
  });
});

describe("renderLandingTemplate — case 5: no archetype / unknown archetype", () => {
  test("no archetype anywhere → props.theme is undefined", () => {
    const result = renderLandingTemplate({
      slug: "acme",
      orgId: "org_1",
      landingTemplate: REGISTERED_ID,
      r1: null,
      soul: rawSoul,
      themeArchetype: undefined,
    });
    assert.equal(result!.props.theme, undefined);
  });

  test("unknown archetype string → props.theme is undefined", () => {
    const result = renderLandingTemplate({
      slug: "acme",
      orgId: "org_1",
      landingTemplate: REGISTERED_ID,
      r1: null,
      soul: rawSoul,
      themeArchetype: "not-a-real-archetype",
    });
    assert.equal(result!.props.theme, undefined);
  });
});

describe("renderLandingTemplate — case 6: withTemplateDefaults fills empty photo slots", () => {
  test("a payload with only a hero photo still yields service/about/gallery photos from the template fixture", () => {
    const result = renderLandingTemplate({
      slug: "acme",
      orgId: "org_1",
      landingTemplate: REGISTERED_ID,
      r1: { payload: fullPayload, archetype: "clinical-trust" },
      soul: null,
      themeArchetype: undefined,
    });
    const photos = result!.props.data.photos as Array<{ role?: string; url: string }> | undefined;
    assert.ok(Array.isArray(photos) && photos.length > 1, "expected multiple photos after default fill");
    const roles = new Set(photos!.map((p) => p.role));
    assert.ok(roles.has("hero"), "expected a hero photo");
    assert.ok(roles.has("service"), "expected service photos filled from defaults");
  });
});
