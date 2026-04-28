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

  if (!name) {
    return NextResponse.json(
      { status: "error", code: "invalid_input", error: "Field 'name' is required." },
      { status: 400 }
    );
  }

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
    const result = await createAnonymousWorkspace({ name, source });
    const urls = buildWorkspaceUrls(result.slug, WORKSPACE_BASE_DOMAIN, result.orgId);
    const structuredUrls = buildStructuredWorkspaceUrls(
      result.slug,
      WORKSPACE_BASE_DOMAIN,
      result.orgId
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
        // Flat `urls` retained for backward compat with MCP v1.0.1 clients.
        // Structured fields below (public_urls / admin_urls / admin_setup_note)
        // are the canonical shape for v1.0.2+ clients — they let Claude Code
        // present the result with a clean public-vs-admin distinction.
        urls,
        public_urls: structuredUrls.public_urls,
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

  // --- Existing Soul-compile flow below; unchanged behavior. ---

  const session = apiKeyUserId ? null : await auth();
  const userId = apiKeyUserId ?? session?.user?.id ?? null;

  if (hasApiKeyHeader && !apiKeyUserId) {
    logEvent("workspace_compile_invalid_api_key", {}, { request, status: 401 });
    return NextResponse.json({ error: "Invalid x-seldon-api-key." }, { status: 401 });
  }

  if (!userId) {
    logEvent("workspace_compile_unauthorized", {}, { request, status: 401 });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateKey = `workspace-compile:${userId}`;
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

  const input = url || description;
  const compileResult = await compileSoulService({
    input,
    claudeApiKey,
    model,
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
    const workspace = await createWorkspaceFromSoulAction({
      soul: compileResult.soul,
      sourceText: compileResult.sourceText,
      pagesUsed: compileResult.pagesUsed,
    }, { userId });

    const subdomain = `${workspace.slug}.${WORKSPACE_BASE_DOMAIN}`;
    const subdomainUrl = `https://${subdomain}`;
    const dashboardUrl = `https://app.seldonframe.com/dashboard?workspace=${workspace.orgId}`;

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

    return NextResponse.json(
      {
        status: "ready",
        workspace: {
          id: workspace.orgId,
          name: workspace.name,
          slug: workspace.slug,
          subdomain,
          url: subdomainUrl,
        },
        subdomain_url: subdomainUrl,
        dashboard_url: dashboardUrl,
        routing: compileResult.routing,
        attempts: compileResult.attempts,
        pagesUsed: compileResult.pagesUsed,
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
