// May 2, 2026 — POST /api/v1/workspaces/create-full
//
// Atomic Workspace Creation. Thin HTTP wrapper around the
// createFullWorkspace orchestrator in lib/workspace/create-full.ts.
// One call → one deterministic response. No retries, no Claude-Code
// decision-making, no 404/500 stitching.
//
// Anonymous endpoint (no bearer required) — same threat model as
// the legacy /api/v1/workspace/create route. Rate-limited per IP.

import { NextResponse } from "next/server";
import {
  createFullWorkspace,
  type CreateFullWorkspaceInput,
} from "@/lib/workspace/create-full";
import { demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
import { logEvent } from "@/lib/observability/log";
import { checkRateLimit } from "@/lib/utils/rate-limit";
// v1.51 — auto-chatbot + client portal URL + tier upsell.
import { createAgent } from "@/lib/agents/store";
import { buildTierUpsell } from "@/lib/workspace/tier-upsell";
// Smoke FIX-4 — /clients/new parity: after the atomic create, run the SAME
// landing enrichment the dashboard + web-onboarding flows run (health-template
// autopick + the R1 multi-page generation step) so an MCP-created workspace
// gets the real multi-page site, not the legacy soul-seeded single page.
import { applyLandingTemplateForWorkspace } from "@/lib/landing/apply-landing-template";
import { runR1LandingStep } from "@/lib/landing/r1-landing-step";
// Onboarding fix — seed the auto-created chatbot from the SAME landing
// FAQ/services the R1 step just generated, instead of an empty scaffold.
import { mapLandingContentToChatbot } from "@/lib/landing/map-landing-to-chatbot";
import { publishAgent } from "@/lib/agents/store";
import type { R1LandingPayload } from "@/lib/landing/r1-payload-prompt";

// The atomic create already makes several sequential LLM calls; the R1 parity
// step adds two more (payload + ONE batched service-pages call). Same guard
// class as /api/v1/landing/r1/generate (60s for its single call).
export const maxDuration = 300;

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
  // v1.37.0 — Google Maps paste workflow.
  weekly_hours?: unknown;
  google_place_url?: unknown;
  // v1.38.3 — operator-supplied review excerpts as testimonials.
  testimonials?: unknown;
};

// v1.38.3 — read & shape-check operator-supplied testimonials. We pass
// quotes through verbatim (no LLM rewrite) so this is just a defensive
// reader — drop entries missing a quote, cap to 8 to avoid abuse.
type TestimonialEntry = {
  quote: string;
  name?: string | null;
  role?: string | null;
  company?: string | null;
  rating?: number | null;
};
function readTestimonials(value: unknown): TestimonialEntry[] | null {
  if (!Array.isArray(value)) return null;
  const out: TestimonialEntry[] = [];
  for (const raw of value.slice(0, 8)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const quote = typeof r.quote === "string" ? r.quote.trim() : "";
    if (!quote) continue;
    out.push({
      quote: quote.slice(0, 800),
      name: typeof r.name === "string" ? r.name.trim() : null,
      role: typeof r.role === "string" ? r.role.trim() : null,
      company: typeof r.company === "string" ? r.company.trim() : null,
      rating:
        typeof r.rating === "number" && Number.isFinite(r.rating)
          ? Math.max(1, Math.min(5, r.rating))
          : null,
    });
  }
  return out.length > 0 ? out : null;
}

// v1.37.0 — read & shape-check the canonical weekly_hours schedule.
// We don't reject malformed entries; we silently drop them. Workspace
// creation must NEVER fail on a paste-extraction format quirk.
const VALID_DAYS = new Set([
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]);
type WeeklyHoursValue = Partial<Record<
  "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday",
  { enabled: boolean; start: string; end: string }
>>;
function readWeeklyHours(value: unknown): WeeklyHoursValue | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const out: Record<string, { enabled: boolean; start: string; end: string }> = {};
  for (const [rawKey, rawDay] of Object.entries(source)) {
    const key = rawKey.toLowerCase();
    if (!VALID_DAYS.has(key)) continue;
    if (!rawDay || typeof rawDay !== "object") continue;
    const day = rawDay as Record<string, unknown>;
    const enabled = typeof day.enabled === "boolean" ? day.enabled : false;
    const start = typeof day.start === "string" ? day.start : "09:00";
    const end = typeof day.end === "string" ? day.end : "17:00";
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(start)) continue;
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(end)) continue;
    out[key] = { enabled, start, end };
  }
  return Object.keys(out).length > 0 ? (out as WeeklyHoursValue) : null;
}

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
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (entry && typeof entry === "object" && "name" in entry) {
        const n = (entry as { name?: unknown }).name;
        return typeof n === "string" ? n.trim() : "";
      }
      return "";
    })
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

  // Same rate limits as the legacy /workspace/create endpoint —
  // per-IP, 3 / hour and 10 / day. Operators with
  // SELDONFRAME_API_KEY can use the v1 user-key endpoints to bypass.
  const ip = resolveRequestIp(request.headers);
  const hourOk = await checkRateLimit(`atomic-workspace-create:hour:${ip}`, 3, 60 * 60 * 1000);
  const dayOk = await checkRateLimit(`atomic-workspace-create:day:${ip}`, 10, 24 * 60 * 60 * 1000);
  if (!hourOk || !dayOk) {
    logEvent("atomic_workspace_create_rate_limited", { ip }, { request, status: 429 });
    return NextResponse.json(
      {
        status: "error",
        error: { step: "rate_limit", message: "Too many workspace creations from this IP. Try again in an hour." },
      },
      { status: 429 }
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
    // v1.37.0 — Google Maps paste workflow. Silent-drop on malformed
    // shapes (per readWeeklyHours) so a paste quirk never blocks
    // workspace creation; defaults take over instead.
    weekly_hours: readWeeklyHours(body.weekly_hours),
    google_place_url: readString(body.google_place_url) || null,
    // v1.38.3 — operator-supplied testimonials extracted from paste.
    testimonials: readTestimonials(body.testimonials),
  };

  const result = await createFullWorkspace(input);

  if (result.status === "error") {
    logEvent(
      "atomic_workspace_create_failed",
      { ip, step: result.error?.step, message: result.error?.message },
      { request, status: 422, durationMs: Date.now() - startedAt, severity: "error" }
    );
    return NextResponse.json(result, { status: 422 });
  }

  // CreateFullWorkspaceResult has workspace_id/slug as optional fields on
  // the interface, so even after the error early-return TS won't narrow
  // them to string. Hoist + guard so the rest of the handler can use
  // non-undefined locals; the guarded branch should never fire on the
  // ready path but keeps the type system honest.
  const workspaceId = result.workspace_id;
  const slug = result.slug;
  if (!workspaceId || !slug) {
    logEvent(
      "atomic_workspace_create_inconsistent",
      { ip, has_workspace_id: !!workspaceId, has_slug: !!slug },
      { request, status: 500, durationMs: Date.now() - startedAt, severity: "error" }
    );
    return NextResponse.json(
      {
        status: "error",
        error: {
          step: "post_create",
          message: "Internal: workspace_id or slug missing from ready result",
        },
      },
      { status: 500 }
    );
  }

  logEvent(
    "atomic_workspace_create_succeeded",
    { ip, slug, personality: result.configured?.personality, timezone: result.configured?.timezone },
    { request, orgId: workspaceId, status: 200, durationMs: Date.now() - startedAt }
  );

  // Smoke FIX-4 — landing parity with /clients/new (paste/URL onboarding).
  // Order copied from run-create-from-paste.ts steps 7d2→7e: health-template
  // autopick first, then the R1 multi-page payload (landing + per-service
  // detail pages). Both fail-soft: any failure leaves the soul-seeded landing
  // in place and NEVER blocks workspace creation.
  let landingEngine: "r1" | "soul_seed" = "soul_seed";
  let landingArchetype: string | null = null;
  // Captured only on a successful R1 run — feeds the chatbot auto-seed
  // below. Left null on any skip/failure so the seed step falls back to
  // today's empty-draft scaffold exactly.
  let landingPayloadForChatbot: R1LandingPayload | null = null;
  try {
    await applyLandingTemplateForWorkspace(workspaceId, {
      businessName: input.business_name,
      businessDescription: input.business_description,
      services: input.services,
    });
  } catch (err) {
    logEvent(
      "landing_template_autopick_failed",
      { workspace_id: workspaceId, error: err instanceof Error ? err.message : String(err) },
      { request, status: 200, severity: "warn" }
    );
  }
  const platformKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (platformKey) {
    const r1 = await runR1LandingStep({
      workspaceId,
      facts: input,
      byokKey: platformKey,
      // Full multi-page parity: service detail pages ON (unlike the keyless
      // ChatGPT tool, which trades them away for chat-client latency).
    });
    if (r1.ok) {
      landingEngine = "r1";
      landingArchetype = r1.archetype;
      landingPayloadForChatbot = r1.payload;
    } else {
      logEvent(
        "r1_landing_step_failed",
        { workspace_id: workspaceId, reason: r1.reason },
        { request, status: 200, severity: "warn" }
      );
    }
  } else {
    logEvent(
      "r1_landing_step_skipped_no_key",
      { workspace_id: workspaceId },
      { request, status: 200, severity: "warn" }
    );
  }

  // Onboarding fix — auto-create the chatbot SEEDED from the same landing
  // FAQ/services the R1 step just generated (was previously an empty
  // faq:[] scaffold with a generic greeting — an "AI receptionist" that
  // knew nothing and never answered). When the landing step was
  // skipped/failed, landingPayloadForChatbot is null and
  // mapLandingContentToChatbot falls back to today's empty scaffold
  // exactly, so nothing regresses on that path.
  //
  // Then attempt to publish straight to 'live' (eval-gated inside
  // publishAgent). All of this is best-effort: any failure anywhere in
  // this block leaves the (now-populated) chatbot in draft/test and
  // NEVER blocks workspace creation — the workspace is already persisted.
  let chatbotEmbedSnippet: string | null = null;
  let chatbotAgentId: string | null = null;
  let chatbotStatus: "draft" | "test" | "live" = "draft";
  try {
    const mapped = mapLandingContentToChatbot(
      landingPayloadForChatbot,
      input.business_name,
    );
    const agentResult = await createAgent({
      orgId: workspaceId,
      archetype: "website-chatbot",
      channel: "web_chat",
      name: `${input.business_name} Chatbot`,
      faq: mapped.faq,
      pricingFacts: mapped.pricingFacts,
      greeting: mapped.greeting,
    });
    if (agentResult.ok) {
      chatbotAgentId = agentResult.agent.id;
      chatbotEmbedSnippet = `<script src="${agentResult.embedUrl}" async></script>`;

      // Only worth attempting a live publish when we actually seeded real
      // content — an empty-FAQ chatbot would just fail the eval gate (or
      // worse, pass and go live with nothing to say). Fail-soft: any
      // throw or a failed eval gate leaves the chatbot in draft.
      if (mapped.faq.length > 0) {
        try {
          const publishResult = await publishAgent({
            agentId: agentResult.agent.id,
            orgId: workspaceId,
            status: "live",
          });
          if (publishResult.ok) {
            chatbotStatus = "live";
          } else {
            logEvent(
              "auto_chatbot_publish_gated",
              { workspace_id: workspaceId, agent_id: agentResult.agent.id, error: publishResult.error },
              { request, status: 200, severity: "warn" }
            );
          }
        } catch (err) {
          logEvent(
            "auto_chatbot_publish_failed",
            { workspace_id: workspaceId, agent_id: agentResult.agent.id, error: err instanceof Error ? err.message : String(err) },
            { request, status: 200, severity: "warn" }
          );
        }
      }
    }
  } catch (err) {
    logEvent(
      "auto_chatbot_draft_failed",
      { workspace_id: workspaceId, error: err instanceof Error ? err.message : String(err) },
      { request, status: 200, severity: "warn" }
    );
  }

  // v1.51 — surface client portal URL + tier upsell so Claude Code's
  // delivery output tells the operator about the end-client CRM
  // feature (gated to Growth/Scale tiers).
  const upsell = buildTierUpsell({ slug, currentTier: "free" });

  return NextResponse.json(
    {
      ...result,
      chatbot_embed_snippet: chatbotEmbedSnippet,
      chatbot_status: chatbotEmbedSnippet ? chatbotStatus : null,
      chatbot_instructions: chatbotEmbedSnippet
        ? chatbotStatus === "live"
          ? "Your AI receptionist is live and answering on your site. Paste this <script> onto the client's existing website (anywhere before </body>) to embed it elsewhere too. Refine its FAQ anytime via update_website_chatbot."
          : "Paste this <script> onto the client's existing website (anywhere before </body>). The chatbot is in DRAFT/TEST mode — review/edit its FAQ via update_website_chatbot, then call publish_agent({ agent_id, status: 'live' }) to go live."
        : null,
      chatbot_agent_id: chatbotAgentId,
      // FIX-4 observability: which landing engine actually rendered. "r1"
      // means the /clients/new-grade multi-page site; "soul_seed" means the
      // R1 step failed (or no platform key) and the legacy seed remains.
      landing_engine: landingEngine,
      landing_archetype: landingArchetype,
      ...upsell,
    },
    { status: 200 }
  );
}
