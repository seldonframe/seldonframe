// v1.4.0 — POST /api/v1/workspace/v2/create
//
// v2 (MCP-native) workspace creation. Bootstraps the workspace via the
// existing createFullWorkspace orchestrator (so v1 still owns booking,
// intake, about, theme, pipeline, etc.) and returns:
//   - the workspace identity (id, slug, public URLs)
//   - a bearer_token the IDE agent uses for follow-up persist_block calls
//   - the list of v2 blocks the agent should now generate
//   - the workspace context the agent passes into each block's prompt
//
// The IDE agent's expected next moves (described in the response payload
// so a generic agent can follow it):
//   1. for each block in `recommended_blocks`:
//        a. fetch get_block_skill(block.name) to load SKILL.md
//        b. generate props with its own LLM, satisfying SKILL.md's prompt
//        c. call persist_block(workspace_id, block.name, prompt, props)
//   2. call complete_workspace_v2(workspace_id) to finalize + validate
//
// Anonymous + IP-rate-limited, same threat model as create-full.

import { NextResponse } from "next/server";
import { createFullWorkspace, type CreateFullWorkspaceInput } from "@/lib/workspace/create-full";
import { demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
import { logEvent } from "@/lib/observability/log";
import { checkRateLimit } from "@/lib/utils/rate-limit";

type Body = {
  business_name?: unknown;
  city?: unknown;
  state?: unknown;
  phone?: unknown;
  services?: unknown;
  business_description?: unknown;
  review_count?: unknown;
  review_rating?: unknown;
  certifications?: unknown;
  trust_signals?: unknown;
  emergency_service?: unknown;
  same_day?: unknown;
  service_area?: unknown;
  email?: unknown;
  address?: unknown;
};

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((s) => s.length > 0);
}

function resolveRequestIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(request: Request) {
  if (isDemoReadonly()) return demoApiBlockedResponse();

  const startedAt = Date.now();

  // Same per-IP rate limits as v1: 3/hour, 10/day.
  const ip = resolveRequestIp(request.headers);
  const hourOk = await checkRateLimit(`v2-workspace-create:hour:${ip}`, 3, 60 * 60 * 1000);
  const dayOk = await checkRateLimit(`v2-workspace-create:day:${ip}`, 10, 24 * 60 * 60 * 1000);
  if (!hourOk || !dayOk) {
    logEvent("v2_workspace_create_rate_limited", { ip }, { request, status: 429 });
    return NextResponse.json(
      { status: "error", error: { step: "rate_limit", message: "Too many workspace creations from this IP." } },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Body;

  const input: CreateFullWorkspaceInput = {
    business_name: readString(body.business_name),
    city: readString(body.city),
    state: readString(body.state),
    phone: readString(body.phone),
    services: readStringArray(body.services),
    business_description: readString(body.business_description),
    review_count: readNumber(body.review_count),
    review_rating: readNumber(body.review_rating),
    certifications: Array.isArray(body.certifications) ? readStringArray(body.certifications) : null,
    trust_signals: Array.isArray(body.trust_signals) ? readStringArray(body.trust_signals) : null,
    emergency_service: readBoolean(body.emergency_service),
    same_day: readBoolean(body.same_day),
    service_area: Array.isArray(body.service_area) ? readStringArray(body.service_area) : null,
    email: readString(body.email) || null,
    address: readString(body.address) || null,
  };

  // Bootstrap via the v1 orchestrator. v2 only owns the high-stakes
  // copy surfaces (hero, services, faq); everything else (CRM,
  // booking template, intake form, theme, default landing skeleton)
  // is unchanged from v1.
  const result = await createFullWorkspace(input);

  if (result.status === "error" || !result.workspace_id) {
    logEvent(
      "v2_workspace_create_failed",
      { ip, step: result.error?.step, message: result.error?.message },
      { request, status: 422, durationMs: Date.now() - startedAt, severity: "error" },
    );
    return NextResponse.json(result, { status: 422 });
  }

  // v1.6.0 — brain layer: pre-fetch any cross-workspace patterns the
  // IDE agent should know about for THIS vertical. Layer-2 patterns
  // are anonymized aggregations (the cron promotes them once 3+
  // workspaces independently observe the same thing). Returning them
  // inline saves the IDE agent a second MCP round-trip; for finer
  // control they can still call list_brain_patterns directly.
  let brainPatterns: Array<{
    path: string;
    body_preview: string;
    confidence: number;
  }> = [];
  try {
    const { listBrainDir } = await import("@/lib/brain/store");
    const vertical = result.configured?.personality;
    const prefix = vertical
      ? `patterns/by-vertical/${vertical}`
      : "patterns/";
    const notes = await listBrainDir({
      orgId: null,
      scope: "global",
      prefix,
      limit: 10,
    });
    brainPatterns = notes.map((n) => ({
      path: n.path,
      body_preview: n.body_preview,
      confidence: n.confidence,
    }));
  } catch {
    // Brain not yet populated for this vertical — empty patterns is
    // expected at v1.6.0 launch (brain compounds over time).
  }

  // Workspace context the agent feeds into each block's prompt.
  const context = {
    business_name: input.business_name,
    city: input.city,
    state: input.state,
    phone: input.phone,
    services: input.services,
    business_description: input.business_description,
    review_count: input.review_count,
    review_rating: input.review_rating,
    trust_signals: input.trust_signals,
    emergency_service: input.emergency_service,
    same_day: input.same_day,
    service_area: input.service_area,
    address: input.address,
    public_urls: result.public_urls,
    personality_vertical: result.configured?.personality ?? null,
    timezone: result.configured?.timezone ?? null,
    theme: result.configured?.theme ?? null,
    // v1.54.0 — aesthetic archetype id (one of 7) so the CC agent's
    // hero block prompt can pick the right template + voice without
    // guessing from vertical alone. Server enforces this anyway in
    // persist_block, but giving it to the LLM is how the generated
    // copy ends up matching the visual treatment (urgent vs editorial).
    aesthetic_archetype: result.configured?.theme?.aestheticArchetype ?? null,
  };

  logEvent(
    "v2_workspace_create_succeeded",
    { ip, slug: result.slug, personality: result.configured?.personality },
    { request, orgId: result.workspace_id, status: 200, durationMs: Date.now() - startedAt },
  );

  return NextResponse.json(
    {
      status: "ready",
      flow: "v2",
      workspace_id: result.workspace_id,
      slug: result.slug,
      public_urls: result.public_urls,
      configured: result.configured,
      operator_prompt: result.operator_prompt,
      // The IDE agent uses this token for persist_block / complete_workspace_v2
      // calls. Same admin-token semantics as v1 — magic-link auth lands later.
      _bearer_token: result._bearer_token,
      _bearer_token_expires_at: result._bearer_token_expires_at,
      // v1.55.0 — ops-stack-only: the default public surface is a
      // chatbot-preview page seeded by complete_workspace_v2. CC does not
      // persist any blocks during workspace creation. If the operator later
      // wants a marketing landing page, they invoke the landing-page-creation
      // SKILL.md which calls persist_block per block (evicting the
      // chatbotPreview placeholder via the eviction logic in persist.ts).
      v2: {
        recommended_blocks: [],
        context,
        // v1.6.0 — brain patterns for this vertical. Layer-2 cross-
        // workspace patterns the IDE agent should fold into its block
        // generation prompts. May be empty at first; compounds over
        // time as more workspaces in this vertical are created and
        // their successful patterns get promoted by the weekly cron.
        brain_patterns: brainPatterns,
        next_steps: [
          "1. Workspace is ready. CRM + booking + intake + chatbot agent are auto-created.",
          "2. POST { workspace_id } to /api/v1/workspace/v2/complete — this auto-creates the website-chatbot agent in TEST status, seeds the chatbot-preview public page, and returns the embed snippet for the operator to paste on their client's existing site.",
          "3. After complete returns, ask the operator for their email and call finalize_workspace({ workspace_id, email }) to produce the operator summary + send the welcome email.",
          "4. If the operator later asks to 'build a landing page for X in <archetype> style', invoke the landing-page-creation skill which uses persist_block per block (hero, services, faq, etc.). The skill-driven flow REPLACES the chatbot-preview with a real marketing landing.",
        ],
      },
    },
    { status: 200 },
  );
}
