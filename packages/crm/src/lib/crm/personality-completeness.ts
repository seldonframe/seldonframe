// ============================================================================
// v1.1.9 — Build-time personality completeness checker.
// ============================================================================
//
// Adding a new personality (e.g. "realtor", "tattoo", "wedding-planner")
// should be safe: define the schema fields, the workspace pipeline picks
// it up automatically. Without a completeness check, "safe" silently
// degrades to "you forgot intake.title and operators ship a generic
// form" or "you forgot content_templates.faqs and operators ship the
// coaching FAQ leak."
//
// This module returns an array of human-readable errors per personality.
// The unit test in tests/unit/personality-completeness.spec.ts asserts
// every personality in PERSONALITIES has zero errors. CI gates on that
// assertion — ship a half-defined personality, the build breaks. Adding
// new niches gets SAFER as the registry grows, not riskier.

import type { CRMPersonality, PersonalityVertical } from "./personality";
import { PERSONALITIES } from "./personality";

export interface PersonalityCompletenessError {
  vertical: string;
  field: string;
  message: string;
}

/**
 * Validate ONE personality. Returns an array of errors (empty array =
 * complete). Each error names the missing/invalid field so a CI
 * failure tells you exactly what to add.
 */
export function checkPersonalityCompleteness(
  personality: CRMPersonality,
): PersonalityCompletenessError[] {
  const errors: PersonalityCompletenessError[] = [];
  const v = personality.vertical;

  const push = (field: string, message: string) =>
    errors.push({ vertical: v, field, message });

  // ─── Identity ─────────────────────────────────────────────────────────
  if (!personality.vertical) push("vertical", "missing");

  // ─── Terminology (drives sidebar, stats, pipeline labels) ────────────
  if (!personality.terminology?.contact?.singular)
    push("terminology.contact.singular", "missing");
  if (!personality.terminology?.contact?.plural)
    push("terminology.contact.plural", "missing");
  if (!personality.terminology?.deal?.singular)
    push("terminology.deal.singular", "missing");
  if (!personality.terminology?.deal?.plural)
    push("terminology.deal.plural", "missing");
  if (!personality.terminology?.activity?.singular)
    push("terminology.activity.singular", "missing");
  if (!personality.terminology?.activity?.plural)
    push("terminology.activity.plural", "missing");

  // ─── Pipeline ─────────────────────────────────────────────────────────
  if (!personality.pipeline?.name) push("pipeline.name", "missing");
  if (!personality.pipeline?.stages?.length)
    push("pipeline.stages", "missing or empty");
  if (
    personality.pipeline?.stages &&
    personality.pipeline.stages.length < 4
  ) {
    push(
      "pipeline.stages",
      `minimum 4 stages (got ${personality.pipeline.stages.length})`,
    );
  }
  if (
    personality.pipeline?.stages &&
    personality.pipeline.stages.some((s) => !s.name || !s.color)
  ) {
    push("pipeline.stages[]", "every stage must have name + color");
  }

  // ─── Contact + intake fields ──────────────────────────────────────────
  if (!personality.contactFields?.industrySpecific?.length)
    push("contactFields.industrySpecific", "missing or empty");
  if (!personality.intakeFields?.length)
    push("intakeFields", "missing or empty");
  // Intake must include the universal contact fields so the form is
  // routable to a CRM contact. Email is required for lead capture.
  const hasEmail = personality.intakeFields?.some(
    (f) => f.key === "email" && f.required,
  );
  if (!hasEmail)
    push("intakeFields[].email", "must include a required email field");

  // ─── Intake form metadata ─────────────────────────────────────────────
  // v1.1.9 added — required for personality-specific public form
  // headings.
  if (!personality.intake?.title)
    push("intake.title", "missing (added v1.1.9)");

  // ─── Dashboard ────────────────────────────────────────────────────────
  if (!personality.dashboard?.primaryMetrics?.length)
    push("dashboard.primaryMetrics", "missing or empty");
  if (
    personality.dashboard?.primaryMetrics &&
    personality.dashboard.primaryMetrics.length < 3
  ) {
    push(
      "dashboard.primaryMetrics",
      `minimum 3 metrics (got ${personality.dashboard.primaryMetrics.length})`,
    );
  }
  if (!personality.dashboard?.urgencyIndicators?.length)
    push("dashboard.urgencyIndicators", "missing or empty");

  // ─── Content templates (hero, trust, CTA, FAQ, services heading) ─────
  // Optional in the type but PRACTICALLY required: personalities without
  // content_templates fall back to BusinessType packs which are voiced
  // for a different audience (the SAAS_PACK ships "Get started →" CTA;
  // a med spa workspace looks broken with that). Warn loudly.
  const ct = personality.content_templates;
  if (!ct) {
    push("content_templates", "missing — falls back to generic pack copy");
  } else {
    if (!ct.hero_headlines?.length)
      push("content_templates.hero_headlines", "missing or empty");
    if (!ct.hero_subheadline)
      push("content_templates.hero_subheadline", "missing");
    if (!ct.trust_badges || ct.trust_badges.length !== 4) {
      push(
        "content_templates.trust_badges",
        `must be exactly 4 (got ${ct.trust_badges?.length ?? 0})`,
      );
    }
    if (!ct.services_heading)
      push("content_templates.services_heading", "missing");
    if (!ct.faqs || ct.faqs.length < 3) {
      push(
        "content_templates.faqs",
        `minimum 3 FAQs (got ${ct.faqs?.length ?? 0})`,
      );
    }
    if (!ct.cta_button_primary)
      push("content_templates.cta_button_primary", "missing");
    if (!ct.cta_button_secondary)
      push("content_templates.cta_button_secondary", "missing");
    if (!ct.bottom_cta_heading)
      push("content_templates.bottom_cta_heading", "missing");
    if (!ct.bottom_cta_trust_points?.length)
      push("content_templates.bottom_cta_trust_points", "missing or empty");
  }

  return errors;
}

/**
 * Validate every personality in PERSONALITIES. Returns a flat array of
 * errors. The unit test asserts this returns []. CI gates on the
 * test passing.
 */
export function checkAllPersonalitiesCompleteness(): PersonalityCompletenessError[] {
  const errors: PersonalityCompletenessError[] = [];
  for (const [key, personality] of Object.entries(PERSONALITIES)) {
    void key; // key === personality.vertical, validated separately
    errors.push(...checkPersonalityCompleteness(personality as CRMPersonality));
  }
  return errors;
}

/**
 * Render the errors as a single human-readable block, grouped by
 * vertical, suitable for an `expect(...).fail(message)` assertion in
 * a unit test. Empty input → empty string.
 */
export function formatCompletenessErrors(
  errors: PersonalityCompletenessError[],
): string {
  if (errors.length === 0) return "";
  const byVertical = new Map<string, PersonalityCompletenessError[]>();
  for (const err of errors) {
    const list = byVertical.get(err.vertical) ?? [];
    list.push(err);
    byVertical.set(err.vertical, list);
  }
  const lines: string[] = [
    `${errors.length} personality completeness error(s):`,
  ];
  for (const [vertical, list] of byVertical) {
    lines.push(`  [${vertical}]`);
    for (const err of list) {
      lines.push(`    - ${err.field}: ${err.message}`);
    }
  }
  return lines.join("\n");
}

/** Re-export so a downstream caller doesn't need a second import. */
export type { CRMPersonality, PersonalityVertical };
