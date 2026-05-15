// v2-aware output-contract-validator unit tests.
//
// Exercises the v2 mode branches added in Task 8 (2026-05-15 commit):
//   - landing_page_exists uses sections instead of contentHtml
//   - cta_primary_href / cta_secondary_href are omitted entirely in v2 mode
//   - v1 mode (legacy contentHtml) is still wired correctly
//
// All non-target checks are SATISFIED by careful makeInputs() defaults so
// they don't pollute the assertion being made. Adjustments from the plan
// template are noted inline.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runChecks,
  type ValidatorInputs,
} from "../../src/lib/workspace/output-contract-validator";
import type { CRMPersonality } from "../../src/lib/crm/personality";

// ─── Personality stub ────────────────────────────────────────────────────────
//
// Fields actually read by runChecks:
//   personality.vertical              → personality_vertical check
//   personality.pipeline.stages       → pipeline_stages check
//   personality.content_templates.*   → services_heading check (cosmetic)
//   personality.intake.title          → intake_title_* checks
//   personality.booking.title         → booking_title_personalized check
//
// Cast with `as unknown as CRMPersonality` because we only need the fields
// the validator reads — we don't need the full shape.

const HVAC_STAGES = [
  { name: "New Inquiry" },
  { name: "Diagnosed" },
  { name: "Quote" },
  { name: "Approved" },
  { name: "Scheduled" },
  { name: "In Progress" },
  { name: "Completed" },
  { name: "Lost" },
];

const HVAC_PERSONALITY = {
  vertical: "hvac",
  pipeline: {
    stages: HVAC_STAGES,
  },
  content_templates: { services_heading: "Our HVAC Services" },
  intake: { title: "Tell us about your HVAC issue" },
  booking: { title: "Schedule a service visit" },
} as unknown as CRMPersonality;

// ─── Shared defaults ─────────────────────────────────────────────────────────
//
// Non-target blocking checks and what satisfies them:
//   pipeline_stages            → stages exactly equal HVAC_STAGES
//   personality_vertical       → org.settings.crmPersonality.vertical === "hvac"
//   workspace_timezone         → org.timezone === expectedTimezone
//   booking_template_exists    → bookingTemplate !== null
//   booking_availability_*     → metadata.availability.monday.enabled === true
//   booking_title_personalized → title/appointmentName includes personality.booking.title
//                                AND not "Free consultation"
//   booking_to_deal_pipeline_ready → first stage name non-empty (satisfied by HVAC_STAGES)
//   intake_form_exists         → intake !== null
//   intake_title_rendered_html → intake.contentHtml includes personality.intake.title
//   intake_service_options     → ≥2 options in service field (input.services.length === 2)

const GOOD_INTAKE: ValidatorInputs["intake"] = {
  name: "Tell us about your HVAC issue",
  fields: [
    {
      key: "service",
      // 3 options ≥ input.services.length (2) → intake_service_options passes
      options: ["AC repair", "Heating install", "Other / not sure"],
      type: "select",
    },
  ],
  // Must contain personality.intake.title for intake_title_rendered_html
  contentHtml: "<form>Tell us about your HVAC issue ...</form>",
};

const GOOD_BOOKING: ValidatorInputs["bookingTemplate"] = {
  // Must include personality.booking.title AND not look generic
  title: "Schedule a service visit",
  metadata: {
    appointmentName: "HVAC consultation",
    // Canonical per-day shape — booking_availability_enabled_days
    availability: {
      monday: { enabled: true, start: "08:00", end: "17:00" },
      tuesday: { enabled: true, start: "08:00", end: "17:00" },
      wednesday: { enabled: true, start: "08:00", end: "17:00" },
      thursday: { enabled: true, start: "08:00", end: "17:00" },
      friday: { enabled: true, start: "08:00", end: "17:00" },
    },
  },
  startsAt: new Date(),
  endsAt: new Date(Date.now() + 60 * 60 * 1000),
  // booking_renderer_data_island is cosmetic so a minimal stub is fine
  contentHtml: "<div data-sf-booking='{\"weekly\":{\"mon\":[]}}'></div>",
};

const GOOD_ORG: NonNullable<ValidatorInputs["org"]> = {
  id: "test-workspace-id",
  name: "Test HVAC Co",
  timezone: "America/Chicago",
  theme: {},
  // personality_vertical: org.settings.crmPersonality.vertical must equal personality.vertical
  settings: { crmPersonality: { vertical: "hvac" } },
};

function makeInputs(overrides: {
  landing: ValidatorInputs["landing"];
  pipeline?: ValidatorInputs["pipeline"];
  intake?: ValidatorInputs["intake"];
  bookingTemplate?: ValidatorInputs["bookingTemplate"];
}): ValidatorInputs {
  return {
    workspaceId: "test-workspace-id",
    input: {
      business_name: "Test HVAC Co",
      city: "Dallas",
      state: "TX",
      services: ["AC repair", "Heating install"],
    },
    personality: HVAC_PERSONALITY,
    expectedTimezone: "America/Chicago",
    org: GOOD_ORG,
    landing: overrides.landing,
    pipeline: overrides.pipeline ?? {
      stages: HVAC_STAGES,
    },
    intake: overrides.intake ?? GOOD_INTAKE,
    bookingTemplate: overrides.bookingTemplate ?? GOOD_BOOKING,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test("v2 mode: landing_page_exists passes when sections have headline content", () => {
  const result = runChecks(
    makeInputs({
      landing: {
        contentHtml: null,
        contentCss: null,
        sections: [
          { content: { headline: "Welcome", body: "Hello world" } },
          { content: { items: [{ title: "Service A", icon: "wrench" }] } },
        ],
      },
    })
  );
  const check = result.checks.find((c) => c.surface === "landing_page_exists");
  assert.equal(
    check?.status,
    "pass",
    `landing_page_exists should pass: ${JSON.stringify(check)}`
  );
});

test("v2 mode: landing_page_exists fails when sections are all empty content", () => {
  const result = runChecks(
    makeInputs({
      landing: {
        contentHtml: null,
        contentCss: null,
        sections: [{ content: {} }, { content: { items: [] } }],
      },
    })
  );
  const check = result.checks.find((c) => c.surface === "landing_page_exists");
  assert.equal(check?.status, "fail");
  // The actual field says "all empty" when hasV2Content is false
  assert.match(check?.actual ?? "", /all empty/);
});

test("v2 mode: landing_page_exists fails when sections array is empty", () => {
  const result = runChecks(
    makeInputs({
      landing: { contentHtml: null, contentCss: null, sections: [] },
    })
  );
  const check = result.checks.find((c) => c.surface === "landing_page_exists");
  // 0 sections → isV2 is false (requires sections.length > 0); falls through
  // to the v1 contentHtml path, which also fails on empty/null html.
  assert.equal(check?.status, "fail");
});

test("v2 mode: cta_primary_href check is omitted entirely", () => {
  const result = runChecks(
    makeInputs({
      landing: {
        contentHtml: null,
        contentCss: null,
        sections: [{ content: { headline: "Welcome" } }],
      },
    })
  );
  const ctaCheck = result.checks.find((c) => c.surface === "cta_primary_href");
  assert.equal(
    ctaCheck,
    undefined,
    "cta_primary_href should not appear in v2 mode"
  );
});

test("v2 mode: cta_secondary_href check is omitted entirely", () => {
  const result = runChecks(
    makeInputs({
      landing: {
        contentHtml: null,
        contentCss: null,
        sections: [{ content: { headline: "Welcome" } }],
      },
    })
  );
  const ctaCheck = result.checks.find(
    (c) => c.surface === "cta_secondary_href"
  );
  assert.equal(
    ctaCheck,
    undefined,
    "cta_secondary_href should not appear in v2 mode"
  );
});

test("v1 mode (legacy contentHtml): landing_page_exists uses contentHtml check", () => {
  // sections is empty → isV2 = false → v1 path uses html.length > 100
  const longHtml = "<html>" + "x".repeat(200) + "</html>";
  const result = runChecks(
    makeInputs({
      landing: { contentHtml: longHtml, contentCss: null, sections: [] },
    })
  );
  const check = result.checks.find((c) => c.surface === "landing_page_exists");
  assert.equal(check?.status, "pass");
  // actual field in v1 path is "${html.length} chars"
  assert.match(check?.actual ?? "", /chars/);
});

test("v1 mode: cta_primary_href check still runs", () => {
  const html = `<html><body><a class="sf-btn sf-btn--primary" href="/book">Book</a></body></html>`;
  const result = runChecks(
    makeInputs({
      landing: { contentHtml: html, contentCss: null, sections: [] },
    })
  );
  const ctaCheck = result.checks.find((c) => c.surface === "cta_primary_href");
  assert.ok(ctaCheck, "cta_primary_href should appear in v1 mode");
  assert.equal(ctaCheck?.status, "pass");
});

test("v2 mode: overall status is pass when no other blocking checks fail", () => {
  const result = runChecks(
    makeInputs({
      landing: {
        contentHtml: null,
        contentCss: null,
        sections: [{ content: { headline: "Welcome", body: "Hello world" } }],
      },
    })
  );
  const blockingFails = result.checks.filter(
    (c) => c.status === "fail" && c.severity === "blocking"
  );
  assert.equal(
    result.summary.blocking_failures,
    0,
    `unexpected blocking failures: ${JSON.stringify(blockingFails, null, 2)}`
  );
  assert.equal(result.status, "pass");
});
