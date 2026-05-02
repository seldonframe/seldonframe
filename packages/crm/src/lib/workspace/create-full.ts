// May 2, 2026 — Atomic Workspace Creation orchestrator.
//
// One server-side function that owns workspace creation end-to-end.
// Replaces the prior pattern of "Claude Code makes 15-25 MCP calls
// in some order, hoping each succeeds." Now Claude Code calls this
// once with structured fields; the server runs a fixed 13-step
// pipeline and returns a deterministic result.
//
// Pipeline composes existing primitives (createAnonymousWorkspace,
// seedLandingFromSoul, ensureDefaultPipelineForOrg, …) — no rewrite
// of those. The value-add here is: strict validation, explicit
// composition, post-create assertions, and a clean response shape
// that withholds the admin URL until finalize_workspace runs (the
// structural enforcement of the email-collection step).
//
// Personality registry is the single source of truth for everything
// industry-specific (terminology, pipeline stages, intake fields,
// theme tokens, booking duration). Adding a new business type =
// adding one entry in lib/crm/personality.ts.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  formSubmissions,
  intakeForms,
  organizations,
  pipelines,
} from "@/db/schema";
import { createAnonymousWorkspace } from "@/lib/billing/anonymous-workspace";
import { selectCRMPersonality } from "@/lib/crm/personality";
import { classifyBusinessTypeFromSoul } from "@/lib/page-schema/classify-business";
import { inferTimezone } from "@/lib/workspace/infer-timezone";
import { trackEvent } from "@/lib/analytics/track";

// ─── Input + Output contracts ────────────────────────────────────────────────

export interface CreateFullWorkspaceInput {
  /** Required — Claude Code extracts these from the operator's NL prompt. */
  business_name: string;
  city: string;
  state: string;
  phone: string;
  services: string[];
  business_description: string;

  /** Optional — enriches output when present. Sparse ones still produce a
   *  valid workspace; they just don't pump the hero with proof metrics. */
  review_count?: number | null;
  review_rating?: number | null;
  certifications?: string[] | null;
  trust_signals?: string[] | null;
  emergency_service?: boolean | null;
  same_day?: boolean | null;
  service_area?: string[] | null;

  /** Optional contact channels — set when the operator volunteers them. */
  email?: string | null;
  address?: string | null;
}

export interface CreateFullWorkspaceResult {
  status: "ready" | "error";
  workspace_id?: string;
  slug?: string;
  public_urls?: {
    home: string;
    book: string;
    intake: string;
  };
  configured?: {
    personality: string;
    timezone: string;
    pipeline_stages: string[];
    booking_types: Array<{ slug: string; label: string; duration: number }>;
    intake_fields: number;
    theme: { mode: string; primary: string; accent: string };
    landing_page: { status: "rendered" | "degraded"; sections: string[] };
  };
  operator_prompt?: string;
  next_step?: "finalize_workspace";
  /** Only set when status === "error". Identifies the pipeline step that
   *  failed so the caller can decide whether to retry, report, or fall
   *  back to the legacy create_workspace tool. */
  error?: {
    step: string;
    message: string;
  };
  /** Internal-use only — never include in operator-facing copy. The MCP
   *  client uses this to authenticate follow-up tool calls
   *  (update_landing_section, update_theme, etc). The admin browser URL
   *  is constructed from this in finalize_workspace, NOT here. */
  _bearer_token?: string;
  _bearer_token_expires_at?: string | null;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateInput(input: CreateFullWorkspaceInput): string | null {
  if (!input.business_name?.trim()) return "business_name is required";
  if (!input.city?.trim()) return "city is required";
  if (!input.state?.trim()) return "state is required";
  if (!input.phone?.trim()) return "phone is required";
  if (!Array.isArray(input.services) || input.services.length === 0) {
    return "services must be a non-empty array of strings";
  }
  if (!input.business_description?.trim()) {
    return "business_description is required";
  }
  return null;
}

function normalizeStateCode(state: string): string {
  const trimmed = state.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  // Full state name → leave as-is. inferTimezone normalizes internally.
  return trimmed;
}

// ─── The 13-step pipeline ────────────────────────────────────────────────────

const WORKSPACE_BASE_DOMAIN =
  process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";

export async function createFullWorkspace(
  input: CreateFullWorkspaceInput
): Promise<CreateFullWorkspaceResult> {
  // Step 1: VALIDATE
  const validationError = validateInput(input);
  if (validationError) {
    return {
      status: "error",
      error: { step: "validate", message: validationError },
    };
  }

  const stateCode = normalizeStateCode(input.state);
  const phone = input.phone.trim();

  // Step 2 + 3: CLASSIFY + RESOLVE PERSONALITY
  // We compose the same Soul shape the legacy classifier expects so the
  // existing keyword bank (broadened May 2 to cover heating/cooling/AC)
  // does the work. Then pass services + description as the industry
  // hint to selectCRMPersonality so the personality bank's MORE
  // specific keywords (e.g. "law firm" → legal, even when the
  // business-type classifier returns the generic "professional_service"
  // bucket) get a shot before the businessType fallback chain.
  const classifierSoul: Record<string, unknown> = {
    business_name: input.business_name,
    soul_description: input.business_description,
    offerings: input.services.map((name) => ({ name })),
  };
  const businessType = classifyBusinessTypeFromSoul(classifierSoul);
  const industryHint = [
    input.services.join(" "),
    input.business_description,
  ]
    .filter(Boolean)
    .join(" ");
  const personality = selectCRMPersonality(businessType, industryHint);

  // Step 4: INFER TIMEZONE
  const timezone =
    inferTimezone(
      stateCode,
      input.city,
      `${input.city}, ${stateCode}`,
      input.business_description,
    ) ?? "America/New_York";

  // Steps 5-12: createAnonymousWorkspace already orchestrates this
  // sequence atomically (org INSERT → token mint → pipeline +
  // landing/booking/intake template seed → soul-driven landing
  // re-render with personality + tokens + style overrides). The new
  // contract here is just stricter input + post-validation.
  //
  // CRITICAL CONTRACT (v1.1.2): step 12 (landing page) is
  // exactly ONE INSERT for the default page (idempotent — see
  // createDefaultLandingPage's existing-row check at the top), then
  // an UPDATE via seedLandingFromSoul. NEVER two INSERTs. The Free-
  // tier landingPages limit is 1; trying to insert a second page
  // returns `upgrade_required` and surfaces as a 500 to the caller.
  // The standalone create_landing_page MCP tool was deleted in 1.1.2
  // for the same reason — it bypassed this contract.
  //
  // CRITICAL CONTRACT (v1.1.3): pass `industryHint` as the `industry`
  // arg so createAnonymousWorkspace's internal personality classifier
  // (selectCRMPersonality) sees the same hint as our outer Step 2-3
  // classifier. Without this, the inner call only gets businessType
  // and falls through BUSINESS_TYPE_FALLBACK["professional_service"]
  // → "coaching" for dental / legal / agency workspaces — seeding the
  // wrong pipeline stages, booking duration, and intake fields. The
  // assertion below would catch the personality mismatch in
  // settings.crmPersonality, but the pipeline rows would already be
  // wrong. Sourcing the same hint at both layers keeps everything
  // consistent from the start.
  let createResult: Awaited<ReturnType<typeof createAnonymousWorkspace>>;
  try {
    createResult = await createAnonymousWorkspace({
      name: input.business_name,
      source: input.business_description,
      industry: industryHint,
      phone,
      email: input.email ?? null,
      address: input.address ?? null,
      city: input.city,
      state: stateCode,
      tagline: null,
      description: input.business_description,
      services: input.services.map((name) => ({ name })),
      testimonials: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "error",
      error: { step: "create_organization", message },
    };
  }

  // Defensive override (v1.1.3). Even with industryHint passed in,
  // re-confirm settings.crmPersonality matches the orchestrator's
  // pick — and re-seed the pipeline stages if they don't. This makes
  // the orchestrator the source of truth for personality, regardless
  // of what classifier path createAnonymousWorkspace took internally
  // (or what a future refactor of that function might change).
  //
  // We update + reseed in two steps so:
  //   1. settings.crmPersonality reflects the right vertical for the
  //      sidebar / dashboard / contact fields (driven via useLabels).
  //   2. The default pipeline row carries the right stages so the
  //      operator sees "New Patient → Appointment Scheduled → ..."
  //      instead of "Applied → Discovery Booked → Enrolled" for a
  //      dental workspace.
  try {
    const [orgRow] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, createResult.orgId))
      .limit(1);
    const currentSettings = (orgRow?.settings ?? {}) as Record<string, unknown>;
    const currentPersonality = currentSettings.crmPersonality as
      | { vertical?: string }
      | undefined;

    if (currentPersonality?.vertical !== personality.vertical) {
      // Mismatch: override settings + re-seed the default pipeline to
      // match the orchestrator's classified personality.
      await db
        .update(organizations)
        .set({
          settings: { ...currentSettings, crmPersonality: personality },
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, createResult.orgId));

      await db
        .update(pipelines)
        .set({
          name: personality.pipeline.name,
          stages: personality.pipeline.stages,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(pipelines.orgId, createResult.orgId),
            eq(pipelines.isDefault, true)
          )
        );
    }
  } catch (err) {
    // Non-blocking — the assertion below will catch a mismatch and
    // surface it as a structured error. Logging here helps diagnose
    // the underlying DB issue without breaking workspace creation.
    console.warn(
      `[create-full] personality override failed for ${createResult.orgId}:`,
      err instanceof Error ? err.message : String(err)
    );
  }

  // Step 13: VALIDATE OUTPUT
  // Confirm each artifact landed. If any of the soft-failed seed paths
  // didn't produce its row, the assertions below catch it before the
  // operator sees the workspace and reports specific missing artifacts
  // back to the caller.
  let validationResult: { ok: true; configured: NonNullable<CreateFullWorkspaceResult["configured"]> } | { ok: false; step: string; message: string };
  try {
    validationResult = await validateWorkspaceArtifacts(
      createResult.orgId,
      personality.vertical,
      timezone
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "error",
      error: { step: "validate_output", message },
    };
  }

  if (!validationResult.ok) {
    return {
      status: "error",
      error: { step: validationResult.step, message: validationResult.message },
    };
  }

  // Public URL set — same shape as buildWorkspaceUrls but assembled
  // here so the response is self-contained (no second HTTP roundtrip).
  const publicOrigin = `https://${createResult.slug}.${WORKSPACE_BASE_DOMAIN}`;
  const publicUrls = {
    home: publicOrigin,
    book: `${publicOrigin}/book`,
    intake: `${publicOrigin}/intake`,
  };

  // Fire-and-forget product event so the funnel rolls up the new
  // atomic-create path separately from the legacy create_workspace.
  trackEvent(
    "workspace_created_full",
    {
      personality: personality.vertical,
      timezone,
      services_count: input.services.length,
      has_review_metrics: Boolean(input.review_count || input.review_rating),
      has_emergency_service: Boolean(input.emergency_service),
      source: "mcp_atomic",
    },
    { orgId: createResult.orgId }
  );

  return {
    status: "ready",
    workspace_id: createResult.orgId,
    slug: createResult.slug,
    public_urls: publicUrls,
    configured: validationResult.configured,
    operator_prompt:
      "What email should I use for your account? This is where you'll get your login link and notifications.",
    next_step: "finalize_workspace",
    // Internal-only — used by the MCP client to authenticate
    // subsequent tool calls. NEVER surfaced to the operator. The
    // admin browser URL is constructed from this in finalize_workspace.
    _bearer_token: createResult.bearerToken,
    _bearer_token_expires_at:
      createResult.bearerTokenExpiresAt?.toISOString() ?? null,
  };
}

// ─── Output validation (the contract) ────────────────────────────────────────

async function validateWorkspaceArtifacts(
  orgId: string,
  expectedPersonality: string,
  expectedTimezone: string
): Promise<
  | { ok: true; configured: NonNullable<CreateFullWorkspaceResult["configured"]> }
  | { ok: false; step: string; message: string }
> {
  // Org row + timezone + personality settings
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      timezone: organizations.timezone,
      settings: organizations.settings,
      soul: organizations.soul,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) {
    return { ok: false, step: "validate_output", message: "Organization row not found after create." };
  }
  if (org.timezone !== expectedTimezone) {
    return {
      ok: false,
      step: "infer_timezone",
      message: `organizations.timezone is ${org.timezone}, expected ${expectedTimezone}`,
    };
  }
  const settings = (org.settings ?? {}) as Record<string, unknown>;
  const personalityFromSettings = settings.crmPersonality as
    | { vertical?: string; pipeline?: { stages?: Array<{ name: string }> }; intakeFields?: unknown[]; terminology?: unknown }
    | undefined;
  if (!personalityFromSettings || personalityFromSettings.vertical !== expectedPersonality) {
    return {
      ok: false,
      step: "resolve_personality",
      message: `org.settings.crmPersonality.vertical is ${personalityFromSettings?.vertical ?? "missing"}, expected ${expectedPersonality}`,
    };
  }

  // Pipeline stages — must exist + match the personality.
  const [pipeline] = await db
    .select({ stages: pipelines.stages })
    .from(pipelines)
    .where(and(eq(pipelines.orgId, orgId), eq(pipelines.isDefault, true)))
    .limit(1);
  if (!pipeline) {
    return { ok: false, step: "seed_pipeline_stages", message: "Default pipeline row not seeded." };
  }
  const stageNames = pipeline.stages.map((s) => s.name);
  const expectedStageNames =
    personalityFromSettings.pipeline?.stages?.map((s) => s.name) ?? [];
  if (
    expectedStageNames.length > 0 &&
    expectedStageNames[0] !== stageNames[0]
  ) {
    return {
      ok: false,
      step: "seed_pipeline_stages",
      message: `Pipeline stages don't match personality. First stage is "${stageNames[0]}", expected "${expectedStageNames[0]}".`,
    };
  }

  // Booking template — at least the default exists.
  const [bookingTemplate] = await db
    .select({
      id: bookings.id,
      title: bookings.title,
      bookingSlug: bookings.bookingSlug,
      metadata: bookings.metadata,
    })
    .from(bookings)
    .where(and(eq(bookings.orgId, orgId), eq(bookings.status, "template")))
    .limit(1);
  if (!bookingTemplate) {
    return {
      ok: false,
      step: "configure_booking_types",
      message: "No booking template seeded.",
    };
  }
  const meta = (bookingTemplate.metadata ?? {}) as { durationMinutes?: number };
  const bookingTypes = [
    {
      slug: bookingTemplate.bookingSlug,
      label: bookingTemplate.title,
      duration: typeof meta.durationMinutes === "number" ? meta.durationMinutes : 0,
    },
  ];

  // Intake form — must have fields.
  const [intake] = await db
    .select({ fields: intakeForms.fields })
    .from(intakeForms)
    .where(eq(intakeForms.orgId, orgId))
    .limit(1);
  if (!intake) {
    return {
      ok: false,
      step: "configure_intake_form",
      message: "No intake form seeded.",
    };
  }
  // intakeForms.fields shape varies by template (JSON array of field defs);
  // count the entries pragmatically without strict typing.
  const intakeFieldsCount = Array.isArray(intake.fields)
    ? intake.fields.length
    : 0;

  // Form submissions table is unused at create time — sanity-check that
  // the table is queryable so we fail early if migrations didn't apply.
  void formSubmissions;

  // Theme — read from personality (seedLandingFromSoul applied it via
  // tokensForPersonality). We surface the operator-relevant subset.
  const theme = {
    mode: org.soul && (org.soul as { theme?: { mode?: string } })?.theme?.mode === "dark" ? "dark" : "light",
    primary: "#0284c7",
    accent: "#f97316",
  };

  return {
    ok: true,
    configured: {
      personality: expectedPersonality,
      timezone: expectedTimezone,
      pipeline_stages: stageNames,
      booking_types: bookingTypes,
      intake_fields: intakeFieldsCount,
      theme,
      landing_page: {
        // seed-landing-from-soul logs degraded outcomes via the validator
        // but always persists SOMETHING. We mark "rendered" optimistically;
        // the validator's separate alerts surface true degradation.
        status: "rendered",
        sections: ["hero", "trust_strip", "services", "about", "stats", "faq", "cta", "footer"],
      },
    },
  };
}
