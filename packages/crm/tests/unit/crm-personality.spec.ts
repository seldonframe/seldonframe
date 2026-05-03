// Unit tests for the CRMPersonality primitive — selection, validator,
// and per-vertical terminology adaptation.
//
// Same node:test + tsx pattern as the rest of the unit suite.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PERSONALITY,
  PERSONALITIES,
  readPersonalityFromSettings,
  resolvePersonalityContent,
  selectCRMPersonality,
  substitutePersonalityTemplate,
  type CRMPersonality,
} from "@/lib/crm/personality";
import { validateCRMPersonality } from "@/lib/page-schema/pipeline-validator";

// ─── selectCRMPersonality ────────────────────────────────────────────────────

describe("selectCRMPersonality", () => {
  test("industry hint 'hvac' picks the HVAC personality", () => {
    const p = selectCRMPersonality("local_service", "hvac");
    assert.equal(p.vertical, "hvac");
    assert.equal(p.terminology.contact.singular, "Customer");
  });

  test("industry hint 'medspa' picks the MEDSPA personality (v1.1.7)", () => {
    const p = selectCRMPersonality(null, "med spa");
    assert.equal(p.vertical, "medspa");
    assert.equal(p.terminology.contact.singular, "Client");
    assert.equal(p.terminology.deal.singular, "Treatment");
  });

  test("description with 'botox' picks the MEDSPA personality (v1.1.7)", () => {
    const p = selectCRMPersonality(null, "Luxury botox and filler studio in Austin");
    assert.equal(p.vertical, "medspa");
  });

  test("description with 'aesthetics platform' classifies to MEDSPA (v1.1.7), not SaaS", () => {
    // v1.1.7 regression — pre-1.1.7, "platform" alone matched the SaaS
    // classifier, dragging "Elevated Med Spa, a luxury aesthetics
    // platform" onto the SeldonFrame marketing template. The fix:
    // tightened SaaS keywords to multi-word distinct markers.
    const p = selectCRMPersonality(
      "professional_service",
      "aesthetics platform medical spa botox filler"
    );
    assert.equal(p.vertical, "medspa");
  });

  test("industry hint 'legal' picks the LEGAL personality", () => {
    const p = selectCRMPersonality(null, "legal");
    assert.equal(p.vertical, "legal");
    assert.equal(p.terminology.deal.singular, "Case");
  });

  test("industry hint 'dental' picks the DENTAL personality", () => {
    const p = selectCRMPersonality("professional_service", "dental");
    assert.equal(p.vertical, "dental");
    assert.equal(p.terminology.contact.singular, "Patient");
  });

  test("industry hint 'agency' picks the AGENCY personality", () => {
    const p = selectCRMPersonality(null, "marketing agency");
    assert.equal(p.vertical, "agency");
    assert.equal(p.terminology.deal.singular, "Project");
  });

  test("industry hint overrides business_type fallback", () => {
    // local_service would normally fall back to HVAC, but explicit "legal"
    // industry should win.
    const p = selectCRMPersonality("local_service", "law firm");
    assert.equal(p.vertical, "legal");
  });

  test("business_type fallback: local_service → HVAC", () => {
    const p = selectCRMPersonality("local_service", null);
    assert.equal(p.vertical, "hvac");
  });

  test("business_type fallback: agency → AGENCY", () => {
    const p = selectCRMPersonality("agency", null);
    assert.equal(p.vertical, "agency");
  });

  test("business_type fallback: professional_service → COACHING", () => {
    const p = selectCRMPersonality("professional_service", null);
    assert.equal(p.vertical, "coaching");
  });

  test("unknown business_type + no industry → DEFAULT (coaching)", () => {
    const p = selectCRMPersonality("other", null);
    assert.equal(p.vertical, DEFAULT_PERSONALITY.vertical);
    assert.equal(p.vertical, "coaching");
  });

  test("null/undefined inputs → DEFAULT (coaching)", () => {
    const p = selectCRMPersonality(null, null);
    assert.equal(p.vertical, "coaching");
    const q = selectCRMPersonality(undefined, undefined);
    assert.equal(q.vertical, "coaching");
  });

  test("empty strings → DEFAULT (coaching)", () => {
    const p = selectCRMPersonality("", "");
    assert.equal(p.vertical, "coaching");
  });

  test("industry keyword matches inside a longer phrase", () => {
    const p = selectCRMPersonality(null, "Mountainside HVAC & Plumbing of Boulder");
    assert.equal(p.vertical, "hvac");
  });
});

// ─── Per-vertical adaptation ─────────────────────────────────────────────────

describe("CRMPersonality terminology adapts per vertical", () => {
  test("HVAC uses Customer / Job / Service Call", () => {
    const p = PERSONALITIES.hvac;
    assert.equal(p.terminology.contact.singular, "Customer");
    assert.equal(p.terminology.deal.singular, "Job");
    assert.equal(p.terminology.activity.singular, "Service Call");
  });

  test("LEGAL uses Client / Case / Consultation", () => {
    const p = PERSONALITIES.legal;
    assert.equal(p.terminology.contact.singular, "Client");
    assert.equal(p.terminology.deal.singular, "Case");
    assert.equal(p.terminology.activity.singular, "Consultation");
  });

  test("DENTAL uses Patient / Treatment Plan / Appointment", () => {
    const p = PERSONALITIES.dental;
    assert.equal(p.terminology.contact.singular, "Patient");
    assert.equal(p.terminology.deal.singular, "Treatment Plan");
    assert.equal(p.terminology.activity.singular, "Appointment");
  });

  test("HVAC pipeline starts at 'New Lead' and ends with 'Lost' bucket", () => {
    const stages = PERSONALITIES.hvac.pipeline.stages;
    assert.equal(stages[0].name, "New Lead");
    assert.ok(stages.some((s) => s.name === "Lost"));
    assert.ok(stages.some((s) => s.name === "Estimate Scheduled"));
  });

  test("LEGAL pipeline includes a Conflict Check stage", () => {
    const stages = PERSONALITIES.legal.pipeline.stages;
    assert.ok(stages.some((s) => s.name === "Conflict Check"));
    assert.ok(stages.some((s) => s.name === "Did Not Retain"));
  });

  test("DENTAL pipeline includes a Recall Due stage", () => {
    const stages = PERSONALITIES.dental.pipeline.stages;
    assert.ok(stages.some((s) => s.name === "Recall Due"));
  });

  test("HVAC contactFields include property_type and system_age", () => {
    const fields = PERSONALITIES.hvac.contactFields.industrySpecific;
    const keys = fields.map((f) => f.key);
    assert.ok(keys.includes("property_type"));
    assert.ok(keys.includes("system_age"));
  });

  test("LEGAL contactFields include practice_area and conflict_cleared", () => {
    const keys = PERSONALITIES.legal.contactFields.industrySpecific.map((f) => f.key);
    assert.ok(keys.includes("practice_area"));
    assert.ok(keys.includes("conflict_cleared"));
  });

  test("every personality declares dashboard primary metrics + urgency indicators", () => {
    for (const vertical of Object.keys(PERSONALITIES) as Array<keyof typeof PERSONALITIES>) {
      const p = PERSONALITIES[vertical];
      assert.ok(
        p.dashboard.primaryMetrics.length >= 3,
        `${vertical} should have ≥3 primary metrics`
      );
      assert.ok(
        p.dashboard.urgencyIndicators.length >= 1,
        `${vertical} should have ≥1 urgency indicator`
      );
    }
  });
});

// ─── validateCRMPersonality ──────────────────────────────────────────────────

describe("validateCRMPersonality", () => {
  test("every built-in personality passes validation", () => {
    for (const vertical of Object.keys(PERSONALITIES) as Array<keyof typeof PERSONALITIES>) {
      const result = validateCRMPersonality(PERSONALITIES[vertical], vertical);
      assert.equal(
        result.passed,
        true,
        `${vertical} should pass — got errors: ${result.errors.join("; ")}`
      );
    }
  });

  test("DEFAULT_PERSONALITY passes validation", () => {
    const result = validateCRMPersonality(DEFAULT_PERSONALITY, "other");
    assert.equal(result.passed, true);
  });

  test("missing personality fails", () => {
    const result = validateCRMPersonality(null, "hvac");
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("PERSONALITY MISSING")));
  });

  test("pipeline with fewer than 4 stages fails", () => {
    const broken: CRMPersonality = {
      ...PERSONALITIES.hvac,
      pipeline: {
        name: "Tiny",
        stages: [
          { name: "Start", color: "#000", probability: 0 },
          { name: "End", color: "#fff", probability: 100 },
        ],
      },
    };
    const result = validateCRMPersonality(broken, "hvac");
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("PIPELINE TOO SHORT")));
  });

  test("missing terminology fails", () => {
    const broken: CRMPersonality = {
      ...PERSONALITIES.coaching,
      terminology: {
        contact: { singular: "", plural: "" },
        deal: { singular: "", plural: "" },
        activity: { singular: "", plural: "" },
      },
    };
    const result = validateCRMPersonality(broken, "coaching");
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("TERMINOLOGY INCOMPLETE")));
  });

  test("intake form with no fields fails", () => {
    const broken: CRMPersonality = {
      ...PERSONALITIES.dental,
      intakeFields: [],
    };
    const result = validateCRMPersonality(broken, "dental");
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("INTAKE FIELDS EMPTY")));
  });

  test("intake form with no required email fails", () => {
    const broken: CRMPersonality = {
      ...PERSONALITIES.agency,
      intakeFields: [
        { key: "name", label: "Name", type: "text", required: true },
        { key: "email", label: "Email", type: "email", required: false },
      ],
    };
    const result = validateCRMPersonality(broken, "agency");
    assert.equal(result.passed, false);
    assert.ok(result.errors.some((e) => e.includes("INTAKE MISSING REQUIRED EMAIL")));
  });
});

// ─── readPersonalityFromSettings ─────────────────────────────────────────────

describe("readPersonalityFromSettings", () => {
  test("returns DEFAULT for null/undefined/non-objects", () => {
    assert.equal(readPersonalityFromSettings(null).vertical, DEFAULT_PERSONALITY.vertical);
    assert.equal(readPersonalityFromSettings(undefined).vertical, DEFAULT_PERSONALITY.vertical);
    assert.equal(readPersonalityFromSettings("hvac").vertical, DEFAULT_PERSONALITY.vertical);
  });

  test("returns DEFAULT when shape is incomplete", () => {
    const partial = { vertical: "hvac", terminology: { contact: { singular: "Customer" } } };
    assert.equal(readPersonalityFromSettings(partial).vertical, DEFAULT_PERSONALITY.vertical);
  });

  test("round-trips a stored built-in personality", () => {
    const stored = JSON.parse(JSON.stringify(PERSONALITIES.hvac));
    const read = readPersonalityFromSettings(stored);
    assert.equal(read.vertical, "hvac");
    assert.equal(read.terminology.contact.singular, "Customer");
    assert.equal(read.pipeline.stages.length, PERSONALITIES.hvac.pipeline.stages.length);
  });

  test("backfills content_templates for stored rows that predate the field", () => {
    const stored = JSON.parse(JSON.stringify(PERSONALITIES.dental));
    delete stored.content_templates;
    const read = readPersonalityFromSettings(stored);
    assert.equal(read.vertical, "dental");
    assert.ok(read.content_templates, "content_templates should be backfilled from registry");
    assert.ok(read.content_templates!.hero_headlines.length > 0);
  });
});

// ─── substitutePersonalityTemplate (v1.1.4) ───────────────────────────────────

describe("substitutePersonalityTemplate", () => {
  test("substitutes all known placeholders when present", () => {
    const out = substitutePersonalityTemplate(
      "{rating}★ from {review_count}+ patients in {city}",
      { rating: 4.8, review_count: 400, city: "Austin" }
    );
    assert.equal(out, "4.8★ from 400+ patients in Austin");
  });

  test("bracketed segment: keeps when all inner placeholders resolve", () => {
    const out = substitutePersonalityTemplate(
      "Same-Day Service[ in {city}].[ {rating}★ from {review_count}+ Local Customers.]",
      { city: "Austin", rating: 4.8, review_count: 400 }
    );
    assert.equal(
      out,
      "Same-Day Service in Austin. 4.8★ from 400+ Local Customers."
    );
  });

  test("bracketed segment: drops when ANY inner placeholder is missing", () => {
    const out = substitutePersonalityTemplate(
      "Same-Day Service[ in {city}].[ {rating}★ from {review_count}+ Local Customers.]",
      { city: "Austin" }
    );
    assert.equal(out, "Same-Day Service in Austin.");
  });

  test("bracketed segment: drops both when neither placeholder resolves", () => {
    const out = substitutePersonalityTemplate(
      "Same-Day Service[ in {city}].[ {rating}★ from {review_count}+ Local Customers.]",
      {}
    );
    assert.equal(out, "Same-Day Service.");
  });

  test("bracketed segment: drops adjacent separator runs when dropped", () => {
    const out = substitutePersonalityTemplate(
      "[{rating}★ on Google] · Licensed & insured · Same-day service",
      {}
    );
    assert.equal(out, "Licensed & insured · Same-day service");
  });

  test("does not fabricate values when both rating and review_count are missing", () => {
    const out = substitutePersonalityTemplate(
      "[{rating}★ from {review_count}+ Patients]",
      {}
    );
    assert.equal(out, "");
  });

  test("expands {certifications_sentence} to a friendly sentence", () => {
    const out = substitutePersonalityTemplate(
      "We're licensed. {certifications_sentence}",
      { certifications: ["EPA 608", "NATE certified", "BBB A+"] }
    );
    assert.match(out, /EPA 608, NATE certified, and BBB A\+/);
  });

  test("drops bracketed {certifications_sentence} when there are no certifications", () => {
    const out = substitutePersonalityTemplate(
      "We're licensed.[ {certifications_sentence}]",
      {}
    );
    assert.equal(out, "We're licensed.");
  });
});

// ─── resolvePersonalityContent (v1.1.4) ───────────────────────────────────────

describe("resolvePersonalityContent", () => {
  test("returns null for personalities without content_templates", () => {
    const stripped = JSON.parse(JSON.stringify(PERSONALITIES.coaching));
    delete stripped.content_templates;
    assert.equal(resolvePersonalityContent(stripped, {}), null);
  });

  test("dental: returns substituted hero, FAQs, CTAs from real input", () => {
    const resolved = resolvePersonalityContent(PERSONALITIES.dental, {
      city: "Austin",
      phone: "(512) 555-3200",
      rating: 4.8,
      review_count: 400,
    });
    assert.ok(resolved);
    assert.match(resolved!.hero_headline, /4\.8/);
    assert.match(resolved!.hero_headline, /400/);
    assert.equal(resolved!.services_heading, "Our Services");
    assert.ok(resolved!.faqs.length > 0);
    assert.match(resolved!.faqs[0].answer, /Austin/);
    assert.match(resolved!.faqs[0].answer, /\(512\) 555-3200/);
    assert.equal(resolved!.cta_button_primary, "Book your first visit →");
  });

  test("hvac: substitutes service_area into hero subheadline", () => {
    const resolved = resolvePersonalityContent(PERSONALITIES.hvac, {
      city: "San Diego",
      service_area: "San Diego, Chula Vista, Oceanside",
      rating: 4.7,
      review_count: 950,
    });
    assert.ok(resolved);
    assert.match(resolved!.hero_subheadline, /Serving San Diego/);
    assert.match(resolved!.trust_badges[0], /4\.7/);
  });

  test("hvac: drops the trust_badge with rating when rating absent (no fabrication)", () => {
    const resolved = resolvePersonalityContent(PERSONALITIES.hvac, {
      city: "San Diego",
    });
    assert.ok(resolved);
    // The first trust_badge "[{rating}★ on Google]" should be dropped
    // entirely, leaving the static badges only.
    assert.equal(resolved!.trust_badges.length, 3);
    assert.deepEqual(resolved!.trust_badges, [
      "Licensed & insured",
      "Same-day service",
      "Free estimates",
    ]);
  });

  test("medspa: substitutes hero copy with luxury aesthetics tone", () => {
    const resolved = resolvePersonalityContent(PERSONALITIES.medspa, {
      city: "Austin",
      phone: "(512) 555-9000",
      rating: 4.9,
      review_count: 220,
    });
    assert.ok(resolved);
    assert.equal(resolved!.services_heading, "Our Treatments");
    assert.match(resolved!.hero_headline, /Look and Feel Your Best/);
    assert.match(resolved!.hero_headline, /4\.9/);
    assert.match(resolved!.hero_headline, /220/);
    assert.equal(resolved!.cta_button_primary, "Book your consultation →");
    // FAQ #5 mentions city + phone via bracketed segments
    assert.ok(resolved!.faqs.length >= 4);
    const allFaqText = resolved!.faqs.map((f) => f.answer).join("\n");
    assert.match(allFaqText, /Austin/);
    assert.match(allFaqText, /\(512\) 555-9000/);
  });

  test("legal: keeps generic copy when proof metrics are absent", () => {
    const resolved = resolvePersonalityContent(PERSONALITIES.legal, {
      city: "Austin",
      phone: "(512) 555-1000",
    });
    assert.ok(resolved);
    // Hero headline drops the {rating} / {review_count} fragment cleanly
    assert.doesNotMatch(resolved!.hero_headline, /\{/);
    assert.match(resolved!.hero_headline, /Trusted Counsel in Austin/);
    assert.equal(resolved!.services_heading, "Practice Areas");
  });
});
