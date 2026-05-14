import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  buildStructuredWorkspaceUrls,
  buildWorkspaceUrls,
  createAnonymousWorkspace,
} from "@/lib/billing/anonymous-workspace";
import { createWorkspaceFromSoulAction } from "@/lib/billing/orgs";
import { demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
import { logEvent } from "@/lib/observability/log";
import { createAgent, publishAgent } from "@/lib/agents/store";
import { setPublicChatbotEmbed } from "@/lib/agents/public-embed";
import { synthesizeFaqsFromSoul } from "@/lib/soul-compiler/faq-synthesizer";
import { getByokClaudeKeyFromHeaders } from "@/lib/soul-compiler/anthropic";
import { compileSoulService } from "@/lib/soul-compiler/service";
import { checkRateLimit } from "@/lib/utils/rate-limit";

type WorkspaceCreateBody = {
  url?: unknown;
  description?: unknown;
  model?: unknown;
  // MCP anonymous-create shape:
  name?: unknown;
  source?: unknown;
  industry?: unknown;
  // May 1, 2026 — structured Soul-seed fields. When provided these go
  // straight into organizations.soul on insert so the landing page
  // renders with real data on its very first GET.
  phone?: unknown;
  email?: unknown;
  address?: unknown;
  tagline?: unknown;
  // `business_description` rather than `description` to avoid colliding
  // with the legacy Soul-compile path's `description` field above.
  business_description?: unknown;
  // May 2, 2026 — explicit city/state for timezone inference.
  city?: unknown;
  state?: unknown;
  services?: unknown;
  testimonials?: unknown;
  // v1.45 — FAQ-from-URL chatbot flags
  include_chatbot?: unknown;
  auto_extract_faq?: unknown;
  // v1.47 — lean URL flow: skip landing-page generation when false
  include_landing_page?: unknown;
};

const WORKSPACE_BASE_DOMAIN =
  process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";

function resolveUserIdFromSeldonApiKey(headers: Headers): string | null {
  const providedKey = headers.get("x-seldon-api-key")?.trim();
  if (!providedKey) {
    return null;
  }

  const configuredPairs = (process.env.SELDON_BUILDER_API_KEYS ?? "")
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const separator = pair.indexOf(":");
      if (separator < 1) {
        return null;
      }

      const key = pair.slice(0, separator).trim();
      const userId = pair.slice(separator + 1).trim();
      if (!key || !userId) {
        return null;
      }

      return { key, userId };
    })
    .filter((entry): entry is { key: string; userId: string } => Boolean(entry));

  const match = configuredPairs.find((entry) => entry.key === providedKey);
  return match?.userId ?? null;
}

function resolveRequestIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

async function handleAnonymousCreate(request: Request, body: WorkspaceCreateBody) {
  const startedAt = Date.now();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const source =
    typeof body.source === "string" && body.source.trim().length > 0
      ? body.source.trim()
      : null;
  // Phase 3 C3: industry drives starter blueprint selection
  // (skills/templates/<industry>.json). Optional; falls back to "general".
  const industry =
    typeof body.industry === "string" && body.industry.trim().length > 0
      ? body.industry.trim().toLowerCase()
      : null;

  if (!name) {
    return NextResponse.json(
      { status: "error", code: "invalid_input", error: "Field 'name' is required." },
      { status: 400 }
    );
  }

  // May 1, 2026 — structured Soul-seed extraction. All optional, all
  // defensive: malformed shapes fall through as null rather than 400ing
  // the request (so a buggy MCP client doesn't lock operators out of
  // workspace creation).
  const phoneInput = typeof body.phone === "string" ? body.phone.trim() : "";
  const emailInput = typeof body.email === "string" ? body.email.trim() : "";
  const addressInput = typeof body.address === "string" ? body.address.trim() : "";
  const taglineInput = typeof body.tagline === "string" ? body.tagline.trim() : "";
  const descriptionInput =
    typeof body.business_description === "string"
      ? body.business_description.trim()
      : "";
  const cityInput = typeof body.city === "string" ? body.city.trim() : "";
  const stateInput = typeof body.state === "string" ? body.state.trim() : "";
  const servicesInput = Array.isArray(body.services)
    ? body.services
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const obj = entry as Record<string, unknown>;
          const svcName = typeof obj.name === "string" ? obj.name.trim() : "";
          if (!svcName) return null;
          const svcDescription =
            typeof obj.description === "string" ? obj.description.trim() : null;
          return { name: svcName, description: svcDescription };
        })
        .filter((s): s is { name: string; description: string | null } => s !== null)
    : null;
  const testimonialsInput = Array.isArray(body.testimonials)
    ? body.testimonials
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const obj = entry as Record<string, unknown>;
          const quote = typeof obj.quote === "string" ? obj.quote.trim() : "";
          if (!quote) return null;
          return {
            quote,
            name: typeof obj.name === "string" ? obj.name.trim() : null,
            role: typeof obj.role === "string" ? obj.role.trim() : null,
            company:
              typeof obj.company === "string" ? obj.company.trim() : null,
          };
        })
        .filter(
          (t): t is { quote: string; name: string | null; role: string | null; company: string | null } =>
            t !== null
        )
    : null;

  const ip = resolveRequestIp(request.headers);
  const hourOk = await checkRateLimit(`anon-workspace-create:hour:${ip}`, 3, 60 * 60 * 1000);
  const dayOk = await checkRateLimit(`anon-workspace-create:day:${ip}`, 10, 24 * 60 * 60 * 1000);

  if (!hourOk || !dayOk) {
    logEvent(
      "anonymous_workspace_rate_limited",
      { ip },
      { request, status: 429 }
    );
    return NextResponse.json(
      {
        status: "error",
        code: "rate_limited",
        error:
          "Anonymous workspace creation is limited to 3 per hour and 10 per day per IP. Set SELDONFRAME_API_KEY to create more.",
      },
      { status: 429 }
    );
  }

  try {
    const result = await createAnonymousWorkspace({
      name,
      source,
      industry,
      phone: phoneInput || null,
      email: emailInput || null,
      address: addressInput || null,
      tagline: taglineInput || null,
      description: descriptionInput || null,
      city: cityInput || null,
      state: stateInput || null,
      services: servicesInput,
      testimonials: testimonialsInput,
    });
    const urls = buildWorkspaceUrls(result.slug, WORKSPACE_BASE_DOMAIN, result.orgId);
    // C6: thread the bearer token into structured URL builder so it
    // produces the single-click `admin_url` for the operator. Without
    // this they can't reach the dashboard at all (the legacy
    // /switch-workspace path requires a NextAuth session).
    const structuredUrls = buildStructuredWorkspaceUrls(
      result.slug,
      WORKSPACE_BASE_DOMAIN,
      result.orgId,
      { bearerToken: result.bearerToken }
    );

    logEvent(
      "anonymous_workspace_created",
      { slug: result.slug, ip },
      {
        request,
        orgId: result.orgId,
        status: 200,
        durationMs: Date.now() - startedAt,
      }
    );

    return NextResponse.json(
      {
        ok: true,
        workspace: {
          id: result.orgId,
          name: result.name,
          slug: result.slug,
          tier: "free",
          created_at: new Date().toISOString(),
        },
        bearer_token: result.bearerToken,
        bearer_token_expires_at:
          result.bearerTokenExpiresAt?.toISOString() ?? null,
        // Flat `urls` retained for backward compat with MCP v1.0.1 clients.
        // Structured fields below (public_urls / admin_urls / admin_setup_note)
        // are the canonical shape for v1.0.2+ clients — they let Claude Code
        // present the result with a clean public-vs-admin distinction.
        urls,
        public_urls: structuredUrls.public_urls,
        // C6: single-click bearer-token admin URL. Most-prominent field
        // in the response — Claude Code surfaces it as "⚡ Admin Dashboard
        // (bookmark this!)" so operators land in the dashboard with one
        // click, no signup.
        admin_url: structuredUrls.admin_url,
        admin_urls: structuredUrls.admin_urls,
        admin_setup_note: structuredUrls.admin_setup_note,
        installed: result.installedBlocks,
        next: [
          "install_vertical_pack({ pack: '<industry-slug>' }) — auto-detects builtin packs (real-estate-agency); falls back to AI synthesis for other industries",
          "fetch_source_for_soul({ url: 'https://yoursite.com' }) → submit_soul({ soul })",
          "configure_booking({ title, duration_minutes, description }) — tune the booking page if you collected business hours",
          "get_workspace_snapshot({}) — read workspace state to reason about next steps",
        ],
      },
      { status: 200 }
    );
  } catch (error) {
    // Surface the underlying driver error when available. Drizzle wraps PG
    // errors and the `.cause` chain carries the real "relation does not exist"
    // / "column does not exist" / connection messages that actually tell us
    // what's wrong.
    const message = error instanceof Error ? error.message : "Failed to create workspace.";
    const cause = error instanceof Error && error.cause;
    const causeMessage = cause instanceof Error ? cause.message : undefined;
    const causeCode =
      cause && typeof cause === "object" && "code" in cause ? String(cause.code) : undefined;

    logEvent(
      "anonymous_workspace_create_failed",
      {
        ip,
        error: message,
        cause: causeMessage,
        cause_code: causeCode,
      },
      {
        request,
        status: 500,
        durationMs: Date.now() - startedAt,
        severity: "error",
      }
    );
    return NextResponse.json(
      {
        status: "error",
        code: "workspace_create_failed",
        error: message,
        cause: causeMessage ?? null,
        cause_code: causeCode ?? null,
        hint:
          causeCode === "42P01"
            ? "Postgres: relation does not exist. Run `pnpm db:migrate` on the staging DB."
            : causeCode === "42703"
              ? "Postgres: column does not exist. The schema is out of sync — run `pnpm db:migrate`."
              : causeCode === "ECONNREFUSED" || causeCode === "ENOTFOUND"
                ? "Database unreachable from the serverless function. Check DATABASE_URL and network."
                : null,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  if (isDemoReadonly()) {
    return demoApiBlockedResponse();
  }

  const body = (await request.json().catch(() => ({}))) as WorkspaceCreateBody;

  const hasAnonymousShape =
    typeof body.name === "string" && typeof body.url !== "string" && typeof body.description !== "string";

  const apiKeyUserId = resolveUserIdFromSeldonApiKey(request.headers);
  const hasApiKeyHeader = Boolean(request.headers.get("x-seldon-api-key")?.trim());

  // Anonymous path: body has { name } and caller provided no x-seldon-api-key and no session.
  if (hasAnonymousShape && !hasApiKeyHeader) {
    const session = await auth();
    if (!session?.user?.id) {
      return handleAnonymousCreate(request, body);
    }
    // Logged-in user posting the anonymous shape: also allowed, and bearer token is still minted
    // so the MCP can act on this workspace without needing session cookies.
    return handleAnonymousCreate(request, body);
  }

  // --- Existing Soul-compile flow below. ---

  // v1.49 — URL-input anonymous path. The lean URL flow (
  // create_workspace_from_url MCP tool) sends `{ url, include_chatbot,
  // auto_extract_faq, include_landing_page: false }` without
  // x-seldon-api-key. Before v1.49 this fell through to the auth-
  // required branch and 401'd, breaking the marketing promise of
  // "first workspace free, no key needed, paste a URL". Now we detect
  // this shape and let it through to compileSoulService + the
  // anonymous-mode createWorkspaceFromSoulAction (which mints a 7-day
  // bearer token, same as the existing Google-paste anonymous path).
  const hasAnonymousUrlShape =
    typeof body.url === "string" &&
    body.url.trim().length > 0 &&
    typeof body.name !== "string" &&
    !hasApiKeyHeader;

  const session = apiKeyUserId ? null : await auth();
  const userId = apiKeyUserId ?? session?.user?.id ?? null;
  const isAnonymousUrlFlow = hasAnonymousUrlShape && !userId;

  if (hasApiKeyHeader && !apiKeyUserId) {
    logEvent("workspace_compile_invalid_api_key", {}, { request, status: 401 });
    return NextResponse.json({ error: "Invalid x-seldon-api-key." }, { status: 401 });
  }

  if (!userId && !isAnonymousUrlFlow) {
    logEvent("workspace_compile_unauthorized", {}, { request, status: 401 });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // v1.49 — anonymous URL flow uses IP-based rate limiting (matching
  // the existing anonymous Google-paste path's pattern). Auth'd flow
  // uses user-id-based rate limiting.
  const rateKey = isAnonymousUrlFlow
    ? `workspace-compile-anon-url:${resolveRequestIp(request.headers)}`
    : `workspace-compile:${userId}`;
  const rateLimitPerHour = process.env.NODE_ENV === "development" ? 30 : 10;

  const allowed = await checkRateLimit(rateKey, rateLimitPerHour, 60 * 60 * 1000);

  if (!allowed) {
    logEvent(
      "workspace_compile_rate_limited",
      { user_id: userId },
      { request, status: 429 }
    );

    return NextResponse.json(
      {
        status: "error",
        code: "rate_limited",
        error: `Rate limit exceeded. You can run up to ${rateLimitPerHour} compiles per hour.`,
      },
      { status: 429 }
    );
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const model = typeof body.model === "string" ? body.model.trim() : undefined;

  if (!url && !description) {
    return NextResponse.json({ error: "Provide either url or description." }, { status: 400 });
  }

  if (url && description) {
    return NextResponse.json({ error: "Provide either url or description, not both." }, { status: 400 });
  }

  const claudeApiKey = getByokClaudeKeyFromHeaders(request.headers);
  if (!claudeApiKey) {
    return NextResponse.json({ error: "Missing BYO Claude API key in headers." }, { status: 400 });
  }

  const includeChatbot = body.include_chatbot === true;
  const autoExtractFaq = body.auto_extract_faq === true;
  // v1.47 — defaults to true for backward compatibility with
  // create_full_workspace + create_workspace_v2. The new
  // create_workspace_from_url tool explicitly passes false to skip
  // landing-page generation (the client has their own site).
  const includeLandingPage = body.include_landing_page === false ? false : true;

  const input = url || description;
  const compileResult = await compileSoulService({
    input,
    claudeApiKey,
    model,
    autoExtractFaq,
    lightMode: !includeLandingPage,  // v1.47 — lean mode when no landing page
  });

  if (compileResult.status === "error") {
    const status =
      compileResult.code === "invalid_input"
        ? 400
        : compileResult.code === "scrape_failed"
          ? 422
          : 500;

    logEvent(
      "workspace_compile_error",
      { user_id: userId, compile_code: compileResult.code },
      { request, status, durationMs: Date.now() - startedAt, severity: "error" }
    );

    return NextResponse.json(
      {
        status: compileResult.status,
        code: compileResult.code,
        error: compileResult.message,
      },
      { status }
    );
  }

  if (compileResult.status === "split_required") {
    logEvent(
      "workspace_compile_split_required",
      {
        user_id: userId,
        audience_type: compileResult.routing.audience_type,
        base_framework: compileResult.routing.base_framework,
      },
      { request, status: 200, durationMs: Date.now() - startedAt }
    );

    return NextResponse.json(
      {
        status: "split_required",
        routing: compileResult.routing,
        message: compileResult.message,
        suggestedFirstWorkspace: compileResult.suggestedFirstWorkspace,
      },
      { status: 200 }
    );
  }

  try {
    const workspace = await createWorkspaceFromSoulAction(
      {
        soul: compileResult.soul,
        sourceText: compileResult.sourceText,
        pagesUsed: compileResult.pagesUsed,
        includeLandingPage,  // v1.47
      },
      // v1.49 — anonymous mode skips user/billing requirements and
      // mints a 7-day bearer token. Auth'd mode behaves unchanged.
      isAnonymousUrlFlow ? { anonymous: true } : { userId: userId ?? undefined }
    );

    const subdomain = `${workspace.slug}.${WORKSPACE_BASE_DOMAIN}`;
    const subdomainUrl = `https://${subdomain}`;
    // v1.49 — admin dashboard URL. For anonymous flow, embed the
    // bearer token in the URL (mirrors the existing anonymous
    // Google-paste path's pattern). For auth'd flow, use the session-
    // cookied dashboard URL.
    const dashboardUrl = workspace.bearerToken
      ? `https://app.seldonframe.com/admin/${workspace.orgId}?token=${workspace.bearerToken}`
      : `https://app.seldonframe.com/dashboard?workspace=${workspace.orgId}`;

    logEvent(
      "workspace_compile_ready",
      {
        user_id: userId,
        slug: workspace.slug,
        subdomain,
        audience_type: compileResult.routing.audience_type,
        base_framework: compileResult.routing.base_framework,
        attempts: compileResult.attempts,
        input_type: compileResult.pagesUsed.length > 0 ? "url" : "description",
      },
      {
        request,
        orgId: workspace.orgId,
        status: 200,
        durationMs: Date.now() - startedAt,
      }
    );

    // ── Optional chatbot build (v1.45 — create_workspace_from_url) ──────
    let agentInfo: {
      id: string | null;
      status: "live" | "test" | null;
      embedUrl: string | null;
      faqSummary?: {
        extractedCount: number;
        synthesizedCount: number;
        total: number;
        extractedSourceUrls: string[];
      };
      evalDiagnostic?: { failedScenarios: Array<{ id: string }> };
    } = { id: null, status: null, embedUrl: null };

    if (includeChatbot && compileResult.status === "ready") {
      const FAQ_TARGET_COUNT = parseInt(process.env.FAQ_TARGET_COUNT ?? "8", 10);
      try {
        const extracted = compileResult.extractedFaqs ?? [];
        const needSynthesis = Math.max(0, FAQ_TARGET_COUNT - extracted.length);
        const synthesized = needSynthesis > 0
          ? await synthesizeFaqsFromSoul({
              soul: compileResult.soul,
              apiKey: claudeApiKey,
              targetCount: needSynthesis,
              existingFaqs: extracted.map((e) => ({ q: e.q, a: e.a })),
            })
          : [];

        const blueprintFaq = [
          ...extracted.map((e) => ({
            q: e.q,
            a: e.a,
            source: "extracted" as const,
            sourceUrl: e.sourceUrl,
          })),
          ...synthesized.map((s) => ({
            q: s.q,
            a: s.a,
            source: "synthesized" as const,
            synthesizedAt: new Date().toISOString(),
            synthesizedFromSoulVersion: 4,
          })),
        ];

        const createResult = await createAgent({
          orgId: workspace.orgId,
          archetype: "website-chatbot",
          channel: "web_chat",
          name: `${compileResult.soul.business_name} Chatbot`,
          faq: blueprintFaq,
        });

        if (createResult.ok) {
          const publishResult = await publishAgent({
            agentId: createResult.agent.id,
            orgId: workspace.orgId,
            status: "live",
          });

          const faqSummary = {
            extractedCount: extracted.length,
            synthesizedCount: synthesized.length,
            total: blueprintFaq.length,
            extractedSourceUrls: [...new Set(extracted.map((e) => e.sourceUrl))],
          };

          if (publishResult.ok) {
            await setPublicChatbotEmbed(workspace.orgId, {
              agentId: createResult.agent.id,
              embedUrl: createResult.embedUrl,
            });
            agentInfo = {
              id: createResult.agent.id,
              status: "live",
              embedUrl: createResult.embedUrl,
              faqSummary,
            };
          } else {
            // Eval gate didn't pass; agent stays at test.
            // Surface diagnostic info without failing the whole request.
            const failedScenarios =
              publishResult.evalSummary?.ok
                ? (publishResult.evalSummary.summary.results ?? [])
                    .filter((r) => !r.passed)
                    .map((r) => ({ id: r.scenarioId }))
                : [];
            agentInfo = {
              id: createResult.agent.id,
              status: "test",
              embedUrl: null,
              faqSummary,
              evalDiagnostic: { failedScenarios },
            };
          }
        }
      } catch (err) {
        // Workspace was created; chatbot build failed. Log + surface in
        // response but don't fail the whole request.
        logEvent(
          "workspace_compile_chatbot_build_failed",
          { user_id: userId, error: err instanceof Error ? err.message : "unknown" },
          { request, status: 200, severity: "warn" }
        );
      }
    }

    // v1.48 — response reshape. When `include_landing_page: false`
    // (the lean URL flow), the response leads with the chatbot embed
    // snippet as the agency's HEADLINE DELIVERABLE. Claude Code's
    // natural summarization picks up `primary_deliverable` as the
    // top-level semantically-meaningful field, so the operator sees
    // "paste this onto your client's site" first — not the phantom
    // SeldonFrame-hosted subdomain URL.
    //
    // When `include_landing_page: true` (full flow), the response
    // shape preserves the legacy `workspace.url` + `subdomain_url`
    // fields for backward compat. The phantom-URL problem doesn't
    // exist in that flow because the operator EXPLICITLY asked for
    // a landing page.
    const primaryDeliverable = agentInfo.embedUrl
      ? {
          kind: "chatbot_embed" as const,
          embed_snippet: `<script src="${agentInfo.embedUrl}" async></script>`,
          paste_instruction:
            "Paste this <script> tag onto the client's existing website anywhere before </body>. The chatbot appears bottom-right and starts answering FAQs + booking appointments against this workspace's calendar.",
          what_it_does:
            "Answers FAQs auto-extracted from the client's site + books appointments. Eval-gated (≥10/11 safety + behavior scenarios passed). White-label-ready under partner-agency attachment.",
        }
      : null;

    const operatorDashboards = {
      admin: dashboardUrl,
      booking: `${subdomainUrl}/book`,
      intake: `${subdomainUrl}/intake`,
    };

    return NextResponse.json(
      {
        status: "ready",
        // v1.48 — HEADLINE deliverable (the agency pastes this snippet
        // onto their CLIENT'S existing website). Placed first so Claude
        // Code's response summarization leads with it.
        primary_deliverable: primaryDeliverable,
        // Operator-facing surfaces (CRM + booking + intake). NOT customer-
        // facing — these are for the agency to manage the client workspace.
        operator_dashboards: operatorDashboards,
        // Workspace identity (for follow-up MCP calls).
        workspace: {
          id: workspace.orgId,
          name: workspace.name,
          slug: workspace.slug,
          subdomain,
        },
        agent: agentInfo.id
          ? {
              id: agentInfo.id,
              status: agentInfo.status,
              embed_url: agentInfo.embedUrl,
              eval_diagnostic: agentInfo.evalDiagnostic ?? null,
            }
          : null,
        faq_summary: agentInfo.faqSummary ?? null,
        // v1.47 fields kept for backward compat with operators who
        // bookmarked these field names. New code should read from
        // primary_deliverable above.
        chatbot_embed_snippet: agentInfo.embedUrl
          ? `<script src="${agentInfo.embedUrl}" async></script>`
          : null,
        chatbot_instructions: agentInfo.embedUrl
          ? "Paste the chatbot_embed_snippet above into the client's existing website (anywhere before </body>). The chatbot appears bottom-right and starts booking appointments + answering FAQs immediately."
          : null,
        // Landing page: ONLY surfaced as a deliverable when the operator
        // explicitly asked (include_landing_page: true). Otherwise null
        // so Claude Code doesn't promote a phantom URL.
        landing_page: includeLandingPage
          ? { url: subdomainUrl, kind: "seldonframe_hosted" }
          : null,
        // Transparent explanation when we skipped landing page generation.
        what_we_skipped: !includeLandingPage
          ? {
              landing_page:
                "Not generated. The agency's client likely already has their own website (the URL the operator passed). The chatbot embed snippet above is the canonical deliverable; paste it onto the client's existing site. If you DO want a SeldonFrame-hosted landing page, call `generate_landing_page({ workspace_id })`.",
            }
          : null,
        routing: compileResult.routing,
        attempts: compileResult.attempts,
        pagesUsed: compileResult.pagesUsed,
        // Legacy field names kept for backward compat with v1.45-1.47
        // callers; new code should use operator_dashboards.admin and
        // primary_deliverable.embed_snippet.
        subdomain_url: subdomainUrl,
        dashboard_url: dashboardUrl,
        // v1.49 — surface the bearer token + expiry for the anonymous
        // URL flow. The MCP client stores this in ~/.seldonframe/device.json
        // and threads it as Authorization: Bearer for subsequent calls.
        // Null in the auth'd flow (session cookies handle auth there).
        bearer_token: workspace.bearerToken ?? null,
        bearer_token_expires_at: workspace.bearerTokenExpiresAt
          ? workspace.bearerTokenExpiresAt.toISOString()
          : null,
        next_steps: [
          agentInfo.embedUrl
            ? "Send the operator the `primary_deliverable.embed_snippet` so they can paste it onto the client's existing website."
            : null,
          !includeLandingPage
            ? `Optional follow-up: if the client doesn't already have a website, call generate_landing_page({ workspace_id: '${workspace.orgId}' }) for a SeldonFrame-hosted landing page (~30-60s).`
            : null,
          "Attach to a partner agency via register_partner_agency + attach_workspace_to_partner_agency for white-label chrome.",
          "Ask the operator for their email + call finalize_workspace({ workspace_id, email }) to mint the admin dashboard URL.",
        ].filter((s): s is string => Boolean(s)),
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create workspace from compiled soul.";
    const loweredMessage = message.toLowerCase();
    const isPlanRequired =
      loweredMessage.includes("pro plan required") ||
      loweredMessage.includes("used your free workspace") ||
      // claude/pre-launch-polish: matches the new pricing message in
      // lib/billing/orgs.ts. Kept the older $9 substring as a fallback
      // for any in-flight messages from older deploys, plus a durable
      // dollar-independent substring for future stability.
      loweredMessage.includes("additional workspace requires a paid tier") ||
      loweredMessage.includes("additional workspace is $9/month");
    const isWorkspaceLimit = loweredMessage.includes("organization limit reached") || loweredMessage.includes("workspace limit");
    const status = isPlanRequired || isWorkspaceLimit ? 403 : 500;
    const code = isPlanRequired
      ? "plan_required"
      : isWorkspaceLimit
        ? "workspace_limit_reached"
        : "workspace_create_failed";

    logEvent(
      "workspace_compile_workspace_create_failed",
      { user_id: userId, error: message },
      { request, status, durationMs: Date.now() - startedAt, severity: "error" }
    );

    if (loweredMessage.includes("dns") || loweredMessage.includes("domain") || loweredMessage.includes("vercel") || loweredMessage.includes("nxdomain")) {
      logEvent(
        "workspace_compile_domain_routing_error",
        { user_id: userId, error: message },
        { request, status, severity: "error" }
      );
    }

    return NextResponse.json(
      {
        status: "error",
        code,
        error: message,
      },
      { status }
    );
  }
}
