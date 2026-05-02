// Unit tests for the Soul → Render pipeline contract assertions.
// Each test mirrors a known regression pattern that's bitten the
// rendered output in the past — the validator's job is to catch
// those patterns BEFORE they reach production.
//
// Test framework: node:test (matches welcome-email.spec.ts).
// Run via: node --test --import tsx packages/crm/tests/unit/pipeline-validator.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  validateSoulStorage,
  validatePageSchema,
  validateRenderedHTML,
  validateFullPipeline,
  validateHeadlineQuality,
  validateAboveTheFold,
  validateSectionHeadlines,
  validateLayoutCoherence,
} from "@/lib/page-schema/pipeline-validator";
import type { PageSchema } from "@/lib/page-schema/types";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeSchema(overrides: Partial<PageSchema> = {}): PageSchema {
  return {
    business: {
      name: "Apex Air Solutions",
      type: "local_service",
      tagline: "",
      description: "",
      phone: undefined,
      email: undefined,
      address: undefined,
      ...(overrides.business ?? {}),
    },
    sections: overrides.sections ?? [
      {
        id: "hero",
        intent: "hero",
        content: { headline: "Welcome", subheadline: "" },
        visible: true,
        order: 10,
      },
    ],
    actions: overrides.actions ?? [],
    proof: overrides.proof ?? {
      testimonials: [],
      partners: [],
      trust_badges: [],
    },
    media: overrides.media ?? { gallery: [] },
  };
}

// ─── validateSoulStorage ─────────────────────────────────────────────────────

describe("validateSoulStorage", () => {
  test("catches phone lost between input and soul", () => {
    const result = validateSoulStorage(
      { phone: "(972) 485-0813", businessName: "Apex Air Solutions" },
      { business_name: "Apex Air Solutions" }
    );
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("PHONE LOST")));
  });

  test("catches phone corrupted between input and soul", () => {
    const result = validateSoulStorage(
      { phone: "(972) 485-0813", businessName: "Apex Air Solutions" },
      { business_name: "Apex Air Solutions", phone: "(555) 555-0100" }
    );
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("PHONE CORRUPTED")));
  });

  test("catches services lost between input and soul", () => {
    const result = validateSoulStorage(
      {
        businessName: "Apex Air",
        services: [
          { name: "AC Repair" },
          { name: "Heating" },
        ],
      },
      { business_name: "Apex Air" }
    );
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("SERVICES LOST")));
  });

  test("passes when input matches soul", () => {
    const result = validateSoulStorage(
      {
        phone: "(972) 485-0813",
        businessName: "Apex Air",
        services: [{ name: "AC Repair" }],
      },
      {
        business_name: "Apex Air",
        phone: "(972) 485-0813",
        offerings: [{ name: "AC Repair" }],
      }
    );
    assert.equal(result.passed, true);
    assert.equal(result.errors.length, 0);
  });

  test("emits warning (not error) when description not stored", () => {
    const result = validateSoulStorage(
      {
        businessName: "Apex Air",
        businessDescription: "Family-owned HVAC in Phoenix",
      },
      { business_name: "Apex Air" }
    );
    assert.equal(result.passed, true);
    assert.ok(result.warnings.some((w) => w.includes("DESCRIPTION not stored")));
  });

  test("flags missing soul outright", () => {
    const result = validateSoulStorage(
      { businessName: "Apex" },
      null
    );
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("SOUL MISSING")));
  });
});

// ─── validatePageSchema ──────────────────────────────────────────────────────

describe("validatePageSchema", () => {
  test("catches phone lost at schema stage", () => {
    const schema = makeSchema({
      business: {
        name: "Apex Air",
        type: "local_service",
        tagline: "",
        description: "",
        phone: undefined,
      },
    });
    const result = validatePageSchema({ phone: "(972) 485-0813" }, schema);
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("PHONE LOST at schema")));
  });

  test("catches placeholder phone surviving into schema", () => {
    const schema = makeSchema({
      business: {
        name: "Apex Air",
        type: "local_service",
        tagline: "",
        description: "",
        phone: "(555) 555-0100",
      },
    });
    const result = validatePageSchema({ phone: "(972) 485-0813" }, schema);
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("PHONE PLACEHOLDER")));
  });

  test("catches services placeholder titles in schema items", () => {
    const schema = makeSchema({
      sections: [
        {
          id: "services",
          intent: "services",
          content: {
            headline: "Services",
            items: [
              { title: "Service one", description: "x" },
              { title: "Service two", description: "y" },
            ],
          },
          visible: true,
          order: 30,
        },
      ],
    });
    const result = validatePageSchema(
      { offerings: [{ name: "AC Repair" }] },
      schema
    );
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("SERVICES ARE PLACEHOLDERS")));
  });

  test("catches template instructions in about section", () => {
    const schema = makeSchema({
      sections: [
        {
          id: "about",
          intent: "about",
          content: {
            headline: "About us",
            body: "Tell your story in 2-3 sentences. What's your background, why did you start the business, and what makes your work different?",
          },
          visible: true,
          order: 40,
        },
      ],
    });
    const result = validatePageSchema({}, schema);
    assert.equal(result.passed, false);
    assert.ok(
      result.errors.some((e) => e.includes("ABOUT SECTION HAS INSTRUCTIONS"))
    );
  });

  test("catches placeholder descriptions in any section's items", () => {
    const schema = makeSchema({
      sections: [
        {
          id: "services",
          intent: "services",
          content: {
            headline: "What we do",
            items: [
              {
                title: "AC Repair",
                description: "Brief description of your first core service.",
              },
            ],
          },
          visible: true,
          order: 30,
        },
      ],
    });
    const result = validatePageSchema(
      { offerings: [{ name: "AC Repair" }] },
      schema
    );
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("PLACEHOLDER DESCRIPTION")));
  });

  test("catches FAQs lost between soul and schema", () => {
    const schema = makeSchema({
      sections: [
        {
          id: "faq",
          intent: "faq",
          content: { headline: "FAQ", faqs: [] },
          visible: true,
          order: 60,
        },
      ],
    });
    const result = validatePageSchema(
      { faqs: [{ question: "Q", answer: "A" }] },
      schema
    );
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("FAQS LOST")));
  });

  test("catches testimonials lost between soul and schema", () => {
    const schema = makeSchema({
      sections: [
        {
          id: "testimonials",
          intent: "testimonials",
          content: { headline: "What clients say", items: [] },
          visible: true,
          order: 50,
        },
      ],
      proof: { testimonials: [], partners: [], trust_badges: [] },
    });
    const result = validatePageSchema(
      { testimonials: [{ quote: "Great work" }] },
      schema
    );
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("TESTIMONIALS LOST")));
  });

  test("passes when all soul data flows into schema", () => {
    const schema = makeSchema({
      business: {
        name: "Apex Air",
        type: "local_service",
        tagline: "Cool homes, warm service",
        description: "",
        phone: "(972) 485-0813",
      },
      sections: [
        {
          id: "services",
          intent: "services",
          content: {
            headline: "Services",
            items: [{ title: "AC Repair", description: "Same-day HVAC repair" }],
          },
          visible: true,
          order: 30,
        },
      ],
    });
    const result = validatePageSchema(
      {
        business_name: "Apex Air",
        phone: "(972) 485-0813",
        offerings: [{ name: "AC Repair" }],
      },
      schema
    );
    assert.equal(result.passed, true);
    assert.equal(result.errors.length, 0);
  });
});

// ─── validateRenderedHTML ────────────────────────────────────────────────────

describe("validateRenderedHTML", () => {
  test("catches placeholder phone in HTML", () => {
    const result = validateRenderedHTML(
      { business_name: "Apex", phone: "(972) 485-0813" },
      '<div>(555) 555-0100</div>'
    );
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("PLACEHOLDER PHONE")));
  });

  test("catches placeholder service titles in HTML", () => {
    const result = validateRenderedHTML(
      { business_name: "Apex", offerings: [{ name: "AC Repair" }] },
      '<div>Apex</div><div>Service one</div>'
    );
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("PLACEHOLDER SERVICES")));
  });

  test("catches template instructions in HTML", () => {
    const result = validateRenderedHTML(
      { business_name: "Apex" },
      '<div>Apex</div><div>Tell your story in 2-3 sentences</div>'
    );
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("TEMPLATE INSTRUCTIONS")));
  });

  test("catches missing business name in HTML", () => {
    const result = validateRenderedHTML(
      { business_name: "Apex Air Solutions" },
      "<div>Some other content</div>"
    );
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("BUSINESS NAME NOT IN HTML")));
  });

  test("catches phone not appearing in HTML at all", () => {
    const result = validateRenderedHTML(
      { business_name: "Apex Air", phone: "(972) 485-0813" },
      "<div>Apex Air</div>"
    );
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("PHONE NOT IN HTML")));
  });

  test("accepts phone in dashed format", () => {
    const result = validateRenderedHTML(
      { business_name: "Apex Air", phone: "(972) 485-0813" },
      '<div>Apex Air</div><a href="tel:9724850813">972-485-0813</a>'
    );
    assert.equal(result.passed, true);
  });

  test("accepts phone in raw-digits format (tel: href)", () => {
    const result = validateRenderedHTML(
      { business_name: "Apex Air", phone: "(972) 485-0813" },
      '<div>Apex Air</div><a href="tel:9724850813">Call us</a>'
    );
    assert.equal(result.passed, true);
  });

  test("passes when all data flows correctly", () => {
    const result = validateRenderedHTML(
      {
        business_name: "Apex Air Solutions",
        phone: "(972) 485-0813",
        offerings: [{ name: "AC Repair" }],
      },
      '<div>Apex Air Solutions</div><a href="tel:9724850813">(972) 485-0813</a><div>AC Repair</div>'
    );
    assert.equal(result.passed, true);
    assert.equal(result.errors.length, 0);
  });

  test("warns (not errors) when offering name not in HTML", () => {
    const result = validateRenderedHTML(
      {
        business_name: "Apex Air",
        offerings: [{ name: "AC Repair" }],
      },
      '<div>Apex Air</div><div>Air conditioning fix</div>'
    );
    assert.equal(result.passed, true);
    assert.ok(result.warnings.some((w) => w.includes("not found in HTML")));
  });
});

// ─── validateFullPipeline ────────────────────────────────────────────────────

describe("validateFullPipeline", () => {
  test("returns allPassed=false when any stage fails", () => {
    const schema = makeSchema();
    const result = validateFullPipeline(
      { businessName: "Apex", phone: "(972) 485-0813" },
      { business_name: "Apex" }, // soul missing phone
      schema,
      "<div>Apex</div>"
    );
    assert.equal(result.allPassed, false);
    // 7 checks now: soul_storage, page_schema, headline_quality,
    // above_the_fold, section_headlines, layout_coherence, rendered_html.
    assert.equal(result.results.length, 7);
    assert.ok(result.results.some((r) => !r.passed));
  });

  test("returns allPassed=true when every stage passes", () => {
    const schema = makeSchema({
      business: {
        name: "Apex Air",
        type: "local_service",
        tagline: "",
        description: "",
        phone: "(972) 485-0813",
      },
      sections: [
        {
          id: "hero",
          intent: "hero",
          content: {
            headline: "Same-Day AC Repair. 4.8★ from 500+ Customers.",
            subheadline: "Licensed · Insured · Free estimates",
          },
          visible: true,
          order: 10,
        },
        {
          id: "trust_bar",
          intent: "trust_bar",
          content: { bullets: ["Licensed", "Insured", "4.8★ Google"] },
          visible: true,
          order: 20,
        },
      ],
      actions: [
        {
          id: "hero_primary",
          text: "Get a free quote",
          href: "/intake",
          style: "primary",
          placement: ["hero", "cta"],
        },
        {
          id: "hero_secondary",
          text: "Schedule service",
          href: "/book",
          style: "secondary",
          placement: ["hero"],
        },
      ],
    });
    const result = validateFullPipeline(
      { businessName: "Apex Air", phone: "(972) 485-0813" },
      { business_name: "Apex Air", phone: "(972) 485-0813" },
      schema,
      '<div>Apex Air</div><a href="tel:9724850813">(972) 485-0813</a>'
    );
    assert.equal(result.allPassed, true);
  });
});

// ─── validateHeadlineQuality (Hormozi check #3) ──────────────────────────────

describe("validateHeadlineQuality", () => {
  test("ERROR when headline equals company name", () => {
    const schema = makeSchema({
      business: {
        name: "Apex Air Solutions",
        type: "local_service",
        tagline: "",
        description: "",
      },
      sections: [
        {
          id: "hero",
          intent: "hero",
          content: { headline: "Apex Air Solutions", subheadline: "" },
          visible: true,
          order: 10,
        },
      ],
    });
    const result = validateHeadlineQuality(schema, {
      business_name: "Apex Air Solutions",
    });
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("HEADLINE IS COMPANY NAME")));
  });

  test("WARN on generic descriptive headlines", () => {
    const schema = makeSchema({
      sections: [
        {
          id: "hero",
          intent: "hero",
          content: {
            headline: "Professional coaching services",
            subheadline: "",
          },
          visible: true,
          order: 10,
        },
      ],
    });
    const result = validateHeadlineQuality(schema, {});
    assert.equal(result.passed, true); // warn-only, doesn't fail
    assert.ok(result.warnings.some((w) => w.includes("HEADLINE IS GENERIC")));
  });

  test("WARN when headline has no quantification", () => {
    const schema = makeSchema({
      sections: [
        {
          id: "hero",
          intent: "hero",
          content: { headline: "Quality Service You Can Trust", subheadline: "" },
          visible: true,
          order: 10,
        },
      ],
    });
    const result = validateHeadlineQuality(schema, {});
    assert.ok(result.warnings.some((w) => w.includes("HEADLINE NOT QUANTIFIED")));
  });

  test("PASS on Hormozi-style headline (numbers + risk reversal)", () => {
    const schema = makeSchema({
      sections: [
        {
          id: "hero",
          intent: "hero",
          content: {
            headline: "Same-Day AC Repair. 4.8★ from 2,300+ Dallas Homeowners.",
            subheadline: "NATE certified · Licensed · We show up or you don't pay",
          },
          visible: true,
          order: 10,
        },
      ],
    });
    const result = validateHeadlineQuality(schema, {});
    assert.equal(result.passed, true);
    // Should not fire NOT_QUANTIFIED warning
    assert.equal(
      result.warnings.filter((w) => w.includes("NOT QUANTIFIED")).length,
      0
    );
  });

  test("WARN when subhead repeats headline", () => {
    const schema = makeSchema({
      sections: [
        {
          id: "hero",
          intent: "hero",
          content: {
            headline: "Free 30-day trial",
            subheadline: "Free 30-day trial",
          },
          visible: true,
          order: 10,
        },
      ],
    });
    const result = validateHeadlineQuality(schema, {});
    assert.ok(result.warnings.some((w) => w.includes("SUBHEAD REPEATS HEADLINE")));
  });
});

// ─── validateAboveTheFold (Hormozi check #4) ─────────────────────────────────

describe("validateAboveTheFold", () => {
  test("ERROR when no hero", () => {
    const schema = makeSchema({ sections: [] });
    const result = validateAboveTheFold(schema);
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("MISSING HERO")));
  });

  test("ERROR when no hero CTA", () => {
    const schema = makeSchema({
      sections: [
        {
          id: "hero",
          intent: "hero",
          content: { headline: "Quality service in 24h", subheadline: "" },
          visible: true,
          order: 10,
        },
      ],
      actions: [],
    });
    const result = validateAboveTheFold(schema);
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("MISSING CTA")));
  });

  test("WARN when only 1 hero CTA", () => {
    const schema = makeSchema({
      sections: [
        {
          id: "hero",
          intent: "hero",
          content: { headline: "Same-day AC repair", subheadline: "" },
          visible: true,
          order: 10,
        },
        {
          id: "trust_bar",
          intent: "trust_bar",
          content: { bullets: ["Licensed"] },
          visible: true,
          order: 20,
        },
      ],
      actions: [
        {
          id: "hero_primary",
          text: "Get a quote",
          href: "/intake",
          style: "primary",
          placement: ["hero"],
        },
      ],
    });
    const result = validateAboveTheFold(schema);
    assert.equal(result.passed, true);
    assert.ok(result.warnings.some((w) => w.includes("ONLY 1 CTA")));
  });

  test("ERROR when local_service has no trust bar", () => {
    const schema = makeSchema({
      business: { name: "Apex", type: "local_service", tagline: "", description: "" },
      sections: [
        {
          id: "hero",
          intent: "hero",
          content: { headline: "Same-day repairs", subheadline: "" },
          visible: true,
          order: 10,
        },
      ],
      actions: [
        {
          id: "p",
          text: "Quote",
          href: "/intake",
          style: "primary",
          placement: ["hero"],
        },
        {
          id: "s",
          text: "Book",
          href: "/book",
          style: "secondary",
          placement: ["hero"],
        },
      ],
    });
    const result = validateAboveTheFold(schema);
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("MISSING TRUST BAR")));
  });
});

// ─── validateSectionHeadlines (Hormozi check #5) ─────────────────────────────

describe("validateSectionHeadlines", () => {
  test("WARN on generic 'Services' label", () => {
    const schema = makeSchema({
      sections: [
        {
          id: "services",
          intent: "services",
          content: { headline: "Services", items: [] },
          visible: true,
          order: 30,
        },
      ],
    });
    const result = validateSectionHeadlines(schema);
    assert.equal(result.passed, true);
    assert.ok(result.warnings.some((w) => w.includes("GENERIC SECTION HEADLINE")));
  });

  test("PASS on benefit-driven section headline", () => {
    const schema = makeSchema({
      sections: [
        {
          id: "services",
          intent: "services",
          content: {
            headline: "8 Ways We Keep Dallas Cool — All Year Round",
            items: [],
          },
          visible: true,
          order: 30,
        },
      ],
    });
    const result = validateSectionHeadlines(schema);
    assert.equal(result.passed, true);
    assert.equal(result.warnings.length, 0);
  });

  test("ERROR on template instructions in section body", () => {
    const schema = makeSchema({
      sections: [
        {
          id: "about",
          intent: "about",
          content: {
            headline: "Why customers pick us",
            body: "Tell your story in 2-3 sentences.",
          },
          visible: true,
          order: 40,
        },
      ],
    });
    const result = validateSectionHeadlines(schema);
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("TEMPLATE INSTRUCTIONS")));
  });

  test("hidden sections are skipped", () => {
    const schema = makeSchema({
      sections: [
        {
          id: "services",
          intent: "services",
          content: { headline: "Services", items: [] },
          visible: false,
          order: 30,
        },
      ],
    });
    const result = validateSectionHeadlines(schema);
    assert.equal(result.warnings.length, 0);
  });
});

// ─── validateLayoutCoherence (Hormozi check #6) ──────────────────────────────

describe("validateLayoutCoherence", () => {
  test("WARN on orphan service card (4 items)", () => {
    const schema = makeSchema({
      sections: [
        {
          id: "services",
          intent: "services",
          content: {
            headline: "Services",
            items: [
              { title: "A", description: "" },
              { title: "B", description: "" },
              { title: "C", description: "" },
              { title: "D", description: "" },
            ],
          },
          visible: true,
          order: 30,
        },
      ],
    });
    const result = validateLayoutCoherence(schema, {}, "");
    assert.ok(result.warnings.some((w) => w.includes("ORPHAN SERVICE CARD")));
  });

  test("PASS when service grid is multiple of 3", () => {
    const schema = makeSchema({
      sections: [
        {
          id: "services",
          intent: "services",
          content: {
            headline: "Services",
            items: [
              { title: "A", description: "" },
              { title: "B", description: "" },
              { title: "C", description: "" },
            ],
          },
          visible: true,
          order: 30,
        },
      ],
    });
    const result = validateLayoutCoherence(schema, {}, "");
    assert.equal(
      result.warnings.filter((w) => w.includes("ORPHAN")).length,
      0
    );
  });

  test("ERROR when local_service has no phone but soul does", () => {
    const schema = makeSchema({
      business: {
        name: "Apex",
        type: "local_service",
        tagline: "",
        description: "",
        phone: undefined,
      },
    });
    const result = validateLayoutCoherence(
      schema,
      { phone: "(972) 485-0813" },
      ""
    );
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("LOCAL_SERVICE MISSING PHONE")));
  });

  test("ERROR on empty action href", () => {
    const schema = makeSchema({
      actions: [
        {
          id: "broken",
          text: "Click",
          href: "",
          style: "primary",
          placement: ["hero"],
        },
      ],
    });
    const result = validateLayoutCoherence(schema, {}, "");
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("EMPTY HREF")));
  });

  test("ERROR on duplicate nav link text", () => {
    const schema = makeSchema({
      actions: [
        {
          id: "a",
          text: "Book",
          href: "/book",
          style: "ghost",
          placement: ["nav"],
        },
        {
          id: "b",
          text: "Book",
          href: "/schedule",
          style: "ghost",
          placement: ["nav"],
        },
      ],
    });
    const result = validateLayoutCoherence(schema, {}, "");
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("DUPLICATE LINK TEXT")));
  });

  test("WARN when SaaS HTML mentions business hours", () => {
    const schema = makeSchema({
      business: { name: "Acme", type: "saas", tagline: "", description: "" },
    });
    const result = validateLayoutCoherence(
      schema,
      {},
      "<div>Mon-Fri 9-5</div>"
    );
    assert.ok(result.warnings.some((w) => w.includes("HAS BUSINESS HOURS")));
  });
});
