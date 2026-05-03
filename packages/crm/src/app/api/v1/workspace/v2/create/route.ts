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
import { listBlockNames } from "@/lib/page-blocks/registry";
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

  // Recommended blocks for the IDE agent. Order matters — hero first
  // (most operator-visible), services second (most likely to fail
  // generic-output validators), faq last (purely supplementary).
  const recommendedBlocks = listBlockNames().map((name) => ({
    name,
    skill_url: `/api/v1/public/blocks/${name}/skill`,
    persist_endpoint: "/api/v1/workspace/v2/blocks",
  }));

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
      // The v2-specific addition: catalogue of blocks the agent should now
      // generate, plus the workspace context to feed into each block's prompt.
      v2: {
        recommended_blocks: recommendedBlocks,
        context,
        next_steps: [
          "1. For each block in recommended_blocks: GET skill_url to load SKILL.md (markdown text).",
          "2. Use your LLM to generate props matching the prop schema in the SKILL.md frontmatter, using the context object as input.",
          "3. POST { workspace_id, block_name, generation_prompt, props } to persist_endpoint with Authorization: Bearer <_bearer_token>.",
          "4. After all blocks are persisted, POST { workspace_id } to /api/v1/workspace/v2/complete with the same bearer.",
        ],
      },
    },
    { status: 200 },
  );
}
