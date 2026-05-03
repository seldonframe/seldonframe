// ============================================================================
// v1.1.9 — Output Contract Validator
// ============================================================================
//
// May 3, 2026. The pattern across 10+ test runs: each new niche surfaces a
// different broken surface (CTA href swap, missing booking availability,
// generic intake title, fabricated stats, coaching-flavored FAQ leak,
// ...). Every one is a missing contract assertion. The pipeline produces
// artifacts but nothing checks they're correct, complete, and internally
// consistent.
//
// This module defines a comprehensive POST-CREATION contract: after the
// workspace pipeline finishes, validate the actual DB state against the
// personality + operator input. Each check declares what was expected,
// what was actually produced, and a severity (blocking | cosmetic).
//
// IMPORTANT: the validator does NOT block workspace creation. It logs
// every check to stdout so failures show up paired with the
// orgId/personality in Vercel function logs. The operator still gets
// their workspace; the failure surfaces with enough detail to trace
// the bug to a specific seed step.
//
// Adding a new check is O(1): append to the validators array. Adding
// a new personality automatically inherits every check — no per-niche
// regression risk.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  intakeForms,
  landingPages,
  organizations,
  pipelines,
} from "@/db/schema";
import type { CRMPersonality } from "@/lib/crm/personality";

/**
 * Narrow input shape the validator actually reads. Avoids a circular
 * import on CreateFullWorkspaceInput (create-full.ts imports the
 * validator below). Callers in create-full.ts pass their own
 * CreateFullWorkspaceInput which structurally satisfies this.
 */
export interface OutputContractInput {
  business_name: string;
  city: string;
  state: string;
  services: string[];
  review_count?: number | null;
  review_rating?: number | null;
}

export type CheckSeverity = "blocking" | "cosmetic";
export type CheckStatus = "pass" | "fail" | "warn";

export interface ValidationCheck {
  /** Stable identifier for the surface being asserted. Use this in
   *  Vercel logs when investigating a specific failure. */
  surface: string;
  status: CheckStatus;
  expected: string;
  actual: string;
  severity: CheckSeverity;
}

export interface OutputContractResult {
  status: "pass" | "degraded";
  checks: ValidationCheck[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warned: number;
    blocking_failures: number;
  };
}

// ─── SeldonFrame strings that must NEVER appear on operator workspaces ─────
//
// Sentinel list. The SAAS_PACK was rewritten in v1.1.7 to be neutral, but
// some old/legacy paths might re-introduce these. The validator is the
// canonical guard — if any operator workspace ships these, this surface
// fails immediately.

const FORBIDDEN_MARKETING_STRINGS = [
  "Replace 5 Tools",
  "Start Free Forever",
  "Start for $0",
  "75 MCP Tools",
  "Brain Layer",
  "Spin up your Business OS",
  "Free forever to self-host",
  "MIT licensed",
  "Deploy in 2 Minutes",
  "Anthropic, Vercel, Neon, Stripe, Resend",
] as const;

// ─── Coaching FAQ phrasings that leak into non-coaching workspaces ─────────
//
// These come from PROFESSIONAL_SERVICE_PACK's default_faqs. When a
// personality (medspa, dental, hvac) doesn't override, the operator
// workspace shipped with coaching-voice FAQ on the page. v1.1.4 added
// per-personality FAQs but a personality without `content_templates.faqs`
// would still fall through. This guards against that.

const COACHING_FAQ_PHRASES = [
  "How long is a typical engagement",
  "What's your approach",
  "What are your qualifications",
] as const;

// ─── HTML extraction helpers ────────────────────────────────────────────────
//
// Cheap regex-based extraction. The rendered HTML is deterministic
// (same renderer for every personality), so simple selectors work
// without bringing in a DOM parser. If the renderer markup changes,
// these extractors might miss — that's a feature: the validator
// surfaces it as a missing extraction rather than silently passing.

function extractHrefFor(html: string, btnClass: string): string | null {
  // Matches <a class="sf-btn sf-btn--primary ..." href="...">
  // Renderer always emits class="sf-btn sf-btn--<kind>" with kind = primary | secondary | tel | ghost
  const re = new RegExp(
    `<a\\b[^>]*\\bclass="sf-btn\\s+sf-btn--${btnClass}\\b[^"]*"[^>]*\\bhref="([^"]+)"`,
    "i",
  );
  const m = html.match(re);
  if (m) return m[1];
  // Try the inverse attribute order (href before class) for safety.
  const reInv = new RegExp(
    `<a\\b[^>]*\\bhref="([^"]+)"[^>]*\\bclass="sf-btn\\s+sf-btn--${btnClass}\\b`,
    "i",
  );
  const m2 = html.match(reInv);
  return m2 ? m2[1] : null;
}

function extractHeroText(html: string): string {
  const m = html.match(
    /<section[^>]*\bclass="sf-hero[^"]*"[^>]*>([\s\S]*?)<\/section>/i,
  );
  if (!m) return "";
  // Strip tags + collapse whitespace.
  return m[1]
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countUniqueIcons(html: string): number {
  // Lucide icon SVGs have unique path-d signatures. Use the first 60
  // chars of every distinct path d="..." to deduplicate without parsing.
  const matches = html.matchAll(/<path\s+d="([^"]{20,80})/gi);
  const seen = new Set<string>();
  for (const m of matches) {
    seen.add(m[1].slice(0, 60));
  }
  return seen.size;
}

// ─── Main validator ─────────────────────────────────────────────────────────

export async function validateWorkspaceOutputContract(
  workspaceId: string,
  input: OutputContractInput,
  personality: CRMPersonality,
  expectedTimezone: string,
): Promise<OutputContractResult> {
  const checks: ValidationCheck[] = [];

  // Load all DB state once.
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      timezone: organizations.timezone,
      theme: organizations.theme,
      settings: organizations.settings,
    })
    .from(organizations)
    .where(eq(organizations.id, workspaceId))
    .limit(1);

  if (!org) {
    return {
      status: "degraded",
      checks: [
        {
          surface: "workspace_exists",
          status: "fail",
          expected: "organizations row",
          actual: "not found",
          severity: "blocking",
        },
      ],
      summary: {
        total: 1,
        passed: 0,
        failed: 1,
        warned: 0,
        blocking_failures: 1,
      },
    };
  }

  const [landing] = await db
    .select({
      contentHtml: landingPages.contentHtml,
      contentCss: landingPages.contentCss,
    })
    .from(landingPages)
    .where(
      and(
        eq(landingPages.orgId, workspaceId),
        eq(landingPages.slug, "home"),
      ),
    )
    .limit(1);
  const html = landing?.contentHtml ?? "";

  const [pipeline] = await db
    .select({ stages: pipelines.stages })
    .from(pipelines)
    .where(
      and(eq(pipelines.orgId, workspaceId), eq(pipelines.isDefault, true)),
    )
    .limit(1);

  const [intake] = await db
    .select({
      name: intakeForms.name,
      fields: intakeForms.fields,
    })
    .from(intakeForms)
    .where(eq(intakeForms.orgId, workspaceId))
    .limit(1);

  const [bookingTemplate] = await db
    .select({
      title: bookings.title,
      metadata: bookings.metadata,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
    })
    .from(bookings)
    .where(
      and(eq(bookings.orgId, workspaceId), eq(bookings.status, "template")),
    )
    .limit(1);

  // ─── LANDING PAGE checks ─────────────────────────────────────────────────

  // 1. Landing page exists at all.
  checks.push({
    surface: "landing_page_exists",
    status: html.length > 100 ? "pass" : "fail",
    expected: "rendered HTML > 100 chars",
    actual: `${html.length} chars`,
    severity: "blocking",
  });

  // 2. NO SeldonFrame marketing strings leaked into operator HTML.
  for (const s of FORBIDDEN_MARKETING_STRINGS) {
    const found = html.includes(s);
    checks.push({
      surface: `no_marketing_string:${s}`,
      status: found ? "fail" : "pass",
      expected: "absent",
      actual: found ? "PRESENT" : "absent",
      severity: "blocking",
    });
  }

  // 3. NO coaching FAQ phrasings unless personality.vertical === 'coaching'.
  if (personality.vertical !== "coaching") {
    for (const phrase of COACHING_FAQ_PHRASES) {
      const found = html.includes(phrase);
      checks.push({
        surface: `no_coaching_faq:${phrase}`,
        status: found ? "fail" : "pass",
        expected: `absent (vertical=${personality.vertical})`,
        actual: found ? "PRESENT" : "absent",
        severity: "blocking",
      });
    }
  }

  // 4. CTA href contract — primary MUST be /book, secondary MUST be /intake.
  // This is the structurally-enforced contract from the v1.1.9 spec.
  // The renderer's btn class names are sf-btn--primary / sf-btn--secondary.
  const primaryHref = extractHrefFor(html, "primary");
  checks.push({
    surface: "cta_primary_href",
    status: primaryHref === "/book" ? "pass" : "fail",
    expected: "/book",
    actual: primaryHref ?? "(not extracted)",
    severity: "blocking",
  });
  const secondaryHref = extractHrefFor(html, "secondary");
  checks.push({
    surface: "cta_secondary_href",
    // Secondary may be missing on some packs (legitimate); only fail if
    // it's present AND wrong. Absent secondary CTA is a warn at most.
    status:
      secondaryHref === null
        ? "warn"
        : secondaryHref === "/intake"
          ? "pass"
          : "fail",
    expected: "/intake (or absent)",
    actual: secondaryHref ?? "(not present)",
    severity: secondaryHref === null ? "cosmetic" : "blocking",
  });

  // 5. Hero copy — when input.review_count is set, it should appear.
  if (typeof input.review_count === "number" && input.review_count > 0) {
    const heroText = extractHeroText(html);
    const found = heroText.includes(String(input.review_count));
    checks.push({
      surface: "hero_review_count",
      status: found ? "pass" : "warn",
      expected: `hero contains ${input.review_count}`,
      actual: heroText.slice(0, 120),
      severity: "cosmetic",
    });
  }
  if (
    typeof input.review_rating === "number" &&
    input.review_rating > 0
  ) {
    const heroText = extractHeroText(html);
    const found = heroText.includes(String(input.review_rating));
    checks.push({
      surface: "hero_review_rating",
      status: found ? "pass" : "warn",
      expected: `hero contains ${input.review_rating}`,
      actual: heroText.slice(0, 120),
      severity: "cosmetic",
    });
  }

  // 6. Services heading uses the personality's vocabulary.
  const expectedHeading =
    personality.content_templates?.services_heading;
  if (expectedHeading) {
    const found = html.includes(expectedHeading);
    checks.push({
      surface: "services_heading",
      status: found ? "pass" : "warn",
      expected: expectedHeading,
      actual: found ? "present" : "missing",
      severity: "cosmetic",
    });
  }

  // 7. Service icon diversity — when ≥3 services, expect ≥3 unique icons.
  if (input.services.length >= 3) {
    const uniqueIcons = countUniqueIcons(html);
    const expected = Math.min(input.services.length, 3);
    checks.push({
      surface: "service_icon_diversity",
      status:
        uniqueIcons >= expected
          ? "pass"
          : "warn",
      expected: `≥${expected} unique icon SVGs`,
      actual: `${uniqueIcons} unique`,
      severity: "cosmetic",
    });
  }

  // ─── CRM checks ──────────────────────────────────────────────────────────

  // 8. Pipeline stages match personality.
  const stageNames = (pipeline?.stages ?? []).map((s) => s.name);
  const expectedStages = personality.pipeline.stages.map((s) => s.name);
  const stagesMatch =
    stageNames.length === expectedStages.length &&
    stageNames.every((n, i) => n === expectedStages[i]);
  checks.push({
    surface: "pipeline_stages",
    status: stagesMatch ? "pass" : "fail",
    expected: expectedStages.join(" → "),
    actual: stageNames.length > 0 ? stageNames.join(" → ") : "(no stages)",
    severity: "blocking",
  });

  // 9. settings.crmPersonality.vertical matches the resolved personality.
  const settings = (org.settings ?? {}) as Record<string, unknown>;
  const settingsPersonality = settings.crmPersonality as
    | { vertical?: string }
    | undefined;
  checks.push({
    surface: "personality_vertical",
    status:
      settingsPersonality?.vertical === personality.vertical
        ? "pass"
        : "fail",
    expected: personality.vertical,
    actual: settingsPersonality?.vertical ?? "(not set)",
    severity: "blocking",
  });

  // ─── BOOKING checks ──────────────────────────────────────────────────────

  // 10. Workspace timezone matches inferred.
  checks.push({
    surface: "workspace_timezone",
    status: org.timezone === expectedTimezone ? "pass" : "fail",
    expected: expectedTimezone,
    actual: org.timezone ?? "(unset)",
    severity: "blocking",
  });

  // 11. Booking template exists.
  checks.push({
    surface: "booking_template_exists",
    status: bookingTemplate ? "pass" : "fail",
    expected: "1 booking row with status='template'",
    actual: bookingTemplate ? "found" : "not found",
    severity: "blocking",
  });

  // 12. Booking has actual availability hours (not just a row stub).
  // Detected by inspecting metadata.availability or startsAt/endsAt.
  if (bookingTemplate) {
    const meta = (bookingTemplate.metadata ?? {}) as {
      availability?: { weekly?: Record<string, unknown> } | null;
    };
    const weekly = meta.availability?.weekly ?? {};
    const dayCount = Object.values(weekly).filter(
      (v) => v !== null && v !== undefined,
    ).length;
    checks.push({
      surface: "booking_availability",
      status: dayCount > 0 ? "pass" : "fail",
      expected: "≥1 day with hours configured",
      actual: `${dayCount} days configured`,
      severity: "blocking",
    });
  }

  // ─── INTAKE FORM checks ─────────────────────────────────────────────────

  // 13. Intake form exists.
  checks.push({
    surface: "intake_form_exists",
    status: intake ? "pass" : "fail",
    expected: "1 intake_forms row",
    actual: intake ? "found" : "not found",
    severity: "blocking",
  });

  if (intake) {
    // 14. Intake title matches personality (when personality declares one).
    const expectedTitle = personality.intake?.title;
    if (expectedTitle) {
      checks.push({
        surface: "intake_title",
        status: intake.name === expectedTitle ? "pass" : "warn",
        expected: expectedTitle,
        actual: intake.name ?? "(empty)",
        severity: "cosmetic",
      });
    }

    // 15. Intake has a service-selection field populated from input.services
    //     (if input.services.length >= 2 — single-service workspaces don't
    //     need a dropdown).
    if (input.services.length >= 2) {
      const fields = Array.isArray(intake.fields)
        ? (intake.fields as Array<{
            key?: string;
            options?: string[];
            type?: string;
          }>)
        : [];
      const serviceField = fields.find(
        (f) =>
          f?.key === "service" ||
          f?.key === "service_type" ||
          f?.key === "service_interest",
      );
      const optionCount = serviceField?.options?.length ?? 0;
      // Need at least input.services.length options (operator's services).
      // The "Other / not sure" tail option means total = services + 1.
      checks.push({
        surface: "intake_service_options",
        status:
          optionCount >= input.services.length
            ? "pass"
            : "fail",
        expected: `≥${input.services.length} options (one per service)`,
        actual: `${optionCount} options`,
        severity: "blocking",
      });
    }
  }

  // ─── THEME checks ───────────────────────────────────────────────────────

  // 16. Theme tokens applied to the rendered page (CSS).
  const css = landing?.contentCss ?? "";
  // Simply check that the CSS is non-trivially populated.
  checks.push({
    surface: "theme_css_populated",
    status: css.length > 200 ? "pass" : "warn",
    expected: "CSS > 200 chars",
    actual: `${css.length} chars`,
    severity: "cosmetic",
  });

  // ─── Summarize ──────────────────────────────────────────────────────────

  const passed = checks.filter((c) => c.status === "pass").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  const warned = checks.filter((c) => c.status === "warn").length;
  const blockingFailures = checks.filter(
    (c) => c.status === "fail" && c.severity === "blocking",
  ).length;

  return {
    status: blockingFailures === 0 ? "pass" : "degraded",
    checks,
    summary: {
      total: checks.length,
      passed,
      failed,
      warned,
      blocking_failures: blockingFailures,
    },
  };
}

/**
 * Helper: emit a single structured log line for the validation result so
 * Vercel function logs can be queried for failures across personalities.
 * Intentionally one line of JSON per workspace creation — keeps the log
 * stream queryable without a separate observability layer.
 */
export function logOutputContractResult(
  workspaceId: string,
  personality: CRMPersonality,
  result: OutputContractResult,
): void {
  // Always log the summary line (one JSON line per workspace).
  // We log to stdout (console.log) for the summary and stderr
  // (console.error) when there are blocking failures so Vercel
  // log-level filters can split them apart.
  const summary = {
    event: "workspace_output_contract",
    workspace_id: workspaceId,
    personality: personality.vertical,
    status: result.status,
    ...result.summary,
  };
  if (result.summary.blocking_failures > 0) {
    console.error(JSON.stringify(summary));
    // Also log the specific failing checks so Vercel logs carry the
    // diagnostic detail without requiring a follow-up DB query.
    for (const check of result.checks) {
      if (check.status === "fail") {
        console.error(
          JSON.stringify({
            event: "workspace_output_contract_failure",
            workspace_id: workspaceId,
            personality: personality.vertical,
            ...check,
          }),
        );
      }
    }
  } else {
    console.log(JSON.stringify(summary));
  }
}
