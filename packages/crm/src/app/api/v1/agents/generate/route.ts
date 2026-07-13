// POST /api/v1/agents/generate
//
// Expose the EXISTING generate-by-default orchestrator (runGenerateAgentDraft,
// lib/agents/generate/run-generate.ts) over HTTP so the MCP (which only speaks
// /api/v1/*, never a "use server" action) can turn one English sentence into a
// created agent_templates row — trigger + skill + guardrails, all assembled by
// the same deterministic pipeline the Studio dashboard uses.
//
// Auth: guardApiRequest — workspace bearer (MCP's path) or legacy x-api-key +
// x-org-id. orgId is ALWAYS resolved from the authed caller, never body.orgId
// (there is no orgId field in the request body at all).
//
// Deps wiring MIRRORS generateAgentDraftAction's defaultCreate + real deps
// (lib/agents/generate/actions.ts) byte-for-byte: same author/classify/judge/
// lessonsStore/resolveCapabilities/create seam, so this route behaves
// identically to the Studio "use server" action — just reachable over HTTP.
//
// Fail-soft: this NEVER 500s on a classify miss. The deterministic
// parseAgentIntent heuristic guarantees a complete, safe intent even with no
// LLM key — see run-generate.ts's contract. A thrown error (bad JSON body, an
// unexpected create-path failure) is caught and returned as a clean
// { ok:false, error } instead of surfacing a 500.

import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { getSoul } from "@/lib/soul/server";
import { llmClassify } from "@/lib/agents/generate/classify-llm";
import { makeLlmAgentAuthor } from "@/lib/agents/generate/author-llm";
import { loadAuthorSoulContext } from "@/lib/agents/generate/author-context";
import {
  listComposioToolkits,
  resolveCapabilitiesToToolkits,
  bindComposioToolkits,
} from "@/lib/agents/generate/composio-resolver";
import { makeLlmAgentGrader } from "@/lib/agents/generate/judge-llm";
import {
  runGenerateAgentDraft,
  type GenerateDeps,
} from "@/lib/agents/generate/run-generate";
import { makeBrainMemoryStoreForOrg } from "@/lib/agents/memory/brain-memory-store";
import { fillBlueprintConnectorsForPersist } from "@/lib/integrations/composio/discover-tools";
import {
  createAgentTemplate,
  updateAgentTemplate,
  type TemplateBlueprintPatch,
  type AgentTemplateType,
} from "@/lib/agent-templates/store";
import type { AgentBlueprint } from "@/db/schema/agents";
import type { ConnectorBinding } from "@/lib/agents/mcp/connectors";

export const runtime = "nodejs";

// Captured by defaultCreate on success so the route can report the assembled
// name/trigger/channel back to the caller (runGenerateAgentDraft's own return
// shape is just { templateId, warnings } — the richer summary lives on the
// template row it created).
type CreatedSummary = { name: string; trigger: AgentBlueprint["trigger"] };

/**
 * Pure request-body parse (exported for unit tests). ONLY reads `description`
 * and `review_url` — there is deliberately no `orgId` field (org is always the
 * authed caller's, resolved by the guard), so no caller can inject a target org.
 */
export function parseGenerateBody(
  body: unknown,
): { ok: true; description: string; reviewUrl?: string } | { ok: false } {
  const b = (body ?? {}) as { description?: unknown; review_url?: unknown };
  const description = typeof b.description === "string" ? b.description.trim() : "";
  if (!description) return { ok: false };
  const reviewUrl = typeof b.review_url === "string" ? b.review_url.trim() || undefined : undefined;
  return { ok: true, description, reviewUrl };
}

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;
  const orgId = guard.orgId;

  const rawBody = await request.json().catch(() => ({}));
  const parsed = parseGenerateBody(rawBody);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: "missing_required_field", required: ["description"] },
      { status: 400 },
    );
  }
  const { description, reviewUrl } = parsed;

  let created: CreatedSummary | undefined;

  try {
    // Soul-ground the author (P5.3), same as the Studio action: a compact
    // business summary so the generated agent speaks AS this workspace.
    // Fail-soft to "" inside loadAuthorSoulContext — never throws.
    const soulContext = await loadAuthorSoulContext(orgId, { getSoul });

    const deps: GenerateDeps = {
      getOrgId: async () => orgId,
      author:
        process.env.SF_GENERATOR_AUTHOR === "off"
          ? undefined
          : makeLlmAgentAuthor({ soulContext }),
      classify: llmClassify,
      judge:
        process.env.SF_GENERATOR_JUDGE === "off"
          ? undefined
          : makeLlmAgentGrader(),
      lessonsStore: makeBrainMemoryStoreForOrg(orgId),
      resolveCapabilities: defaultResolveCapabilities,
      create: (input) => defaultCreate(input, (summary) => (created = summary)),
    };

    const result = await runGenerateAgentDraft(deps, {
      sentence: description,
      reviewUrl,
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
    }

    return NextResponse.json({
      ok: true,
      template_id: result.templateId,
      name: created?.name,
      trigger: created?.trigger,
      channel:
        created?.trigger?.kind === "event" || created?.trigger?.kind === "schedule"
          ? created.trigger.channel
          : created?.trigger?.kind === "inbound"
            ? created.trigger.channel
            : undefined,
      warnings: result.warnings,
    });
  } catch (error) {
    // Fail-soft: never 500 the caller for an unexpected throw in the pipeline.
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "generate_failed",
      },
      { status: 422 },
    );
  }
}

// ─── deps (mirrors lib/agents/generate/actions.ts's real seam) ──────────────

async function defaultResolveCapabilities(capabilities: string[]): Promise<{
  bindings: ConnectorBinding[];
  resolved: { capability: string; slug: string; label: string }[];
  unresolved: string[];
}> {
  const toolkits = await listComposioToolkits();
  const resolved = resolveCapabilitiesToToolkits(capabilities, toolkits);
  const slugs = resolved.map((r) => r.slug);
  return {
    bindings: bindComposioToolkits(slugs),
    resolved,
    unresolved: capabilities.filter(
      (c) => !resolved.some((r) => r.capability === c),
    ),
  };
}

async function defaultCreate(
  input: {
    builderOrgId: string;
    name: string;
    description: string;
    type: AgentTemplateType;
    blueprint: AgentBlueprint;
  },
  onCreated?: (summary: CreatedSummary) => void,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const template = await createAgentTemplate({
      builderOrgId: input.builderOrgId,
      name: input.name,
      type: input.type,
    });

    // Widen any never-discovered composio binding's enabledTools with real
    // tools before the first persist — catalog defaults, then live discovery
    // for non-catalog toolkits (youtube, synthflow_ai, …). Never throws.
    const filledBlueprint = await fillBlueprintConnectorsForPersist(
      input.builderOrgId,
      input.blueprint,
    );

    const saved = await updateAgentTemplate({
      id: template.id,
      patch: filledBlueprint as unknown as TemplateBlueprintPatch,
    });
    if (!saved.ok) return { ok: false, error: saved.error };

    onCreated?.({
      name: saved.template.name,
      trigger: (saved.template.blueprint as AgentBlueprint | null)?.trigger,
    });

    return { ok: true, id: template.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "create_failed",
    };
  }
}
