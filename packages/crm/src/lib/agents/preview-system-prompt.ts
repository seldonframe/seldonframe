// Phase 7 Task 7.2 — Live system-prompt preview helper.
//
// Build a fully-resolved conversation system prompt using sample values
// so operators can see what the LLM will read AFTER their edits to
// /automations/[id]/configure — BEFORE saving + waiting for a real form
// submission. Pairs with the /runs page snapshot (Phase 7.1) which
// shows what the LLM ACTUALLY read on a past run.
//
// Architecture: this is a server-only helper. It re-uses the same
// buildSystemPrompt + buildClock + synthesizeAgentSpec primitives the
// runtime uses, so the preview is byte-identical to what dispatch will
// produce for a real run. Synthesizes the saved agent config, finds the
// conversation step, fabricates a sample RunContext, and calls the
// dispatcher's exported prompt builder.
//
// 2026-05-19.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getArchetype } from "@/lib/agents/archetypes";
import type { AgentConfig } from "@/lib/agents/configure-actions";
import { synthesizeAgentSpec } from "@/lib/agents/synthesis";
import type { ConversationStep } from "@/lib/agents/validator";
import { buildClock } from "@/lib/workflow/build-run-context";
import type { CustomerRunContext } from "@/lib/workflow/run-context-customer";
import { buildSystemPrompt } from "@/lib/workflow/step-dispatchers/conversation";
import type { OrgSoul } from "@/lib/soul/types";

export type PreviewResult =
  | {
      ok: true;
      systemPrompt: string;
      sampleCustomer: { firstName: string; phone: string };
      conversationStep: { initial_message: string };
    }
  | { ok: false; error: string };

const SAMPLE_DEFAULT_CONFIG: AgentConfig = {
  placeholders: {},
  model: "claude-sonnet-4",
  temperature: 0.7,
  approvalRequired: false,
  maxRunsPerDay: 50,
  deployedAt: null,
  pausedAt: null,
  systemPromptOverride: null,
  updatedAt: new Date().toISOString(),
};

/**
 * Build a fully-resolved conversation system prompt for the configure
 * page's "Live preview" panel. Returns `{ ok: false, error }` when the
 * archetype doesn't have a conversation step, the workspace can't be
 * loaded, or synthesis fails because the operator hasn't filled the
 * required user_input placeholders yet.
 */
export async function previewConversationSystemPrompt(
  orgId: string,
  archetypeId: string,
  agentConfig: AgentConfig | null,
): Promise<PreviewResult> {
  const archetype = getArchetype(archetypeId);
  if (!archetype) {
    return { ok: false, error: `unknown_archetype:${archetypeId}` };
  }

  const synthesis = synthesizeAgentSpec(
    archetype,
    agentConfig ?? SAMPLE_DEFAULT_CONFIG,
  );
  if (!synthesis.ok) {
    return {
      ok: false,
      error: `synthesis_failed:${synthesis.reason}:${synthesis.placeholderKey ?? ""}`,
    };
  }

  // Find the conversation step in the synthesized spec.
  const spec = synthesis.spec as Record<string, unknown>;
  const steps = Array.isArray(spec.steps)
    ? (spec.steps as Array<Record<string, unknown>>)
    : [];
  const convStep = steps.find((s) => s.type === "conversation") as
    | (ConversationStep & Record<string, unknown>)
    | undefined;
  if (!convStep) {
    return { ok: false, error: "archetype_has_no_conversation_step" };
  }

  // Pull the workspace identity so the sample RunContext mirrors what
  // a real run will look like (real timezone, real business name, real
  // soul/theme — the prose composition references all of these).
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      timezone: organizations.timezone,
      soul: organizations.soul,
      theme: organizations.theme,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) {
    return { ok: false, error: "workspace_not_found" };
  }

  const tz = org.timezone || "UTC";
  const clock = buildClock(new Date(), tz);

  // Fake-but-recognizable customer values — operators recognize
  // "Sample" / "+15555555555" as placeholder data and won't confuse
  // these for a real lead.
  const sampleRunContext: CustomerRunContext = {
    runId: "sample-run-id",
    orgId,
    archetypeId,
    startedAt: clock.nowIso,
    customer: {
      contactId: "sample-contact-id",
      firstName: "Sample",
      lastName: "Customer",
      email: "sample@example.com",
      phone: "+15555555555",
    },
    workspace: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      timezone: tz,
      soul: (org.soul ?? {}) as OrgSoul,
      // OrgTheme is a structured type — RunContextWorkspace.theme is
      // intentionally loose (Record<string, unknown>) to break a schema
      // import cycle. Cast through unknown to satisfy TS.
      theme: (org.theme ?? {}) as unknown as Record<string, unknown>,
    },
    clock,
    source: {
      type: "form.submitted",
      formId: "sample-form-id",
      triggerEventId: null,
    },
  };

  // Mirror buildRunTimeVarsFromContext (kept private to the dispatcher)
  // — same keys, same precedence. If that helper evolves, this should
  // too. There's no public export today and inlining keeps the diff
  // small.
  const soulRecord = (sampleRunContext.workspace.soul ?? {}) as unknown as Record<
    string,
    unknown
  >;
  const business = (soulRecord.business && typeof soulRecord.business === "object"
    ? soulRecord.business
    : null) as Record<string, unknown> | null;
  const contact = (soulRecord.contact && typeof soulRecord.contact === "object"
    ? soulRecord.contact
    : null) as Record<string, unknown> | null;
  const businessPhoneCandidates = [
    soulRecord.phone,
    business?.phone,
    business?.phoneNumber,
    contact?.phone,
    contact?.phoneNumber,
  ];
  let businessPhone = "";
  for (const c of businessPhoneCandidates) {
    if (typeof c === "string" && c.trim().length > 0) {
      businessPhone = c.trim();
      break;
    }
  }

  const runtimeVars: Record<string, string> = {
    "contact.firstName": sampleRunContext.customer.firstName,
    "contact.lastName": sampleRunContext.customer.lastName ?? "",
    "contact.email": sampleRunContext.customer.email ?? "",
    "contact.phone": sampleRunContext.customer.phone,
    businessName: sampleRunContext.workspace.name,
    businessPhone,
    timezone: sampleRunContext.workspace.timezone,
  };

  // Pull appointment_type_id from a create_booking step's args so the
  // resolved prompt accurately reflects the check_availability tool
  // hint the LLM will actually see at run time.
  let appointmentTypeId: string | null = null;
  for (const s of steps) {
    if (
      s.type === "mcp_tool_call" &&
      s.tool === "create_booking" &&
      s.args &&
      typeof s.args === "object"
    ) {
      const argsTyped = s.args as Record<string, unknown>;
      if (typeof argsTyped.appointment_type_id === "string") {
        appointmentTypeId = argsTyped.appointment_type_id;
        break;
      }
    }
  }

  // Forbidden phrases + maxTurns come from the synthesized spec's
  // placeholders sidecar (Phase 2 Task 2.4). Mirror the dispatcher's
  // resolveForbiddenPhrases / resolveMaxTurns defaults so the preview
  // matches what a real run would render.
  const placeholders = (spec.placeholders as Record<string, string> | undefined) ?? {};
  const forbiddenRaw =
    placeholders.forbiddenPhrases ?? placeholders["$forbiddenPhrases"] ?? "";
  const forbiddenPhrases =
    typeof forbiddenRaw === "string" && forbiddenRaw.trim().length > 0
      ? forbiddenRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [
          "we couldn't find your appointment",
          "please call us",
          "this is broken",
          "an error occurred",
        ];

  const maxTurnsRaw = placeholders.maxTurns ?? placeholders["$maxTurns"];
  let maxTurns = 6;
  if (typeof maxTurnsRaw === "string") {
    const parsed = parseInt(maxTurnsRaw, 10);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 20) maxTurns = parsed;
  }

  const systemPrompt = buildSystemPrompt(
    convStep as ConversationStep,
    runtimeVars,
    appointmentTypeId,
    sampleRunContext,
    forbiddenPhrases,
    maxTurns,
  );

  // Resolve {{...}} tokens in initial_message too — operators want to
  // see the literal opening SMS the customer will receive, not the
  // raw template with curlies.
  const initial =
    typeof convStep.initial_message === "string" ? convStep.initial_message : "";
  const resolvedInitial = initial.replace(/\{\{([\w.]+)\}\}/g, (_match, key) => {
    return runtimeVars[key] ?? "";
  });

  return {
    ok: true,
    systemPrompt,
    sampleCustomer: { firstName: "Sample", phone: "+15555555555" },
    conversationStep: { initial_message: resolvedInitial },
  };
}
