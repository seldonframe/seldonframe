import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  buildWorkspaceUrls,
  createAnonymousWorkspace,
} from "@/lib/billing/anonymous-workspace";
import { createWorkspaceFromSoulAction } from "@/lib/billing/orgs";
import { demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
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

function logWorkspaceCompile(event: string, data: Record<string, unknown>) {
  console.info(
    JSON.stringify({
      event,
      at: new Date().toISOString(),
      ...data,
    })
  );
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
    logWorkspaceCompile("anonymous_workspace_rate_limited", {
      ip,
      status: 429,
    });
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

    logWorkspaceCompile("anonymous_workspace_created", {
      orgId: result.orgId,
      slug: result.slug,
      ip,
      status: 200,
      durationMs: Date.now() - startedAt,
    });

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
        urls,
        installed: result.installedBlocks,
        next: [
          "install_vertical_pack({ pack: 'real-estate' })",
          "fetch_source_for_soul({ url: 'https://yoursite.com' }) → submit_soul({ soul })",
          "get_workspace_snapshot({}) — read workspace state to reason about next steps",
        ],
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create workspace.";
    logWorkspaceCompile("anonymous_workspace_create_failed", {
      ip,
      status: 500,
      durationMs: Date.now() - startedAt,
      error: message,
    });
    return NextResponse.json(
      { status: "error", code: "workspace_create_failed", error: message },
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
    logWorkspaceCompile("workspace_compile_invalid_api_key", {
      status: 401,
    });
    return NextResponse.json({ error: "Invalid x-seldon-api-key." }, { status: 401 });
  }

  if (!userId) {
    logWorkspaceCompile("workspace_compile_unauthorized", {
      status: 401,
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateKey = `workspace-compile:${userId}`;
  const rateLimitPerHour = process.env.NODE_ENV === "development" ? 30 : 10;

  const allowed = await checkRateLimit(rateKey, rateLimitPerHour, 60 * 60 * 1000);

  if (!allowed) {
    logWorkspaceCompile("workspace_compile_rate_limited", {
      userId,
      status: 429,
    });

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

    logWorkspaceCompile("workspace_compile_error", {
      userId,
      compileCode: compileResult.code,
      status,
      durationMs: Date.now() - startedAt,
    });

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
    logWorkspaceCompile("workspace_compile_split_required", {
      userId,
      audienceType: compileResult.routing.audience_type,
      baseFramework: compileResult.routing.base_framework,
      status: 200,
      durationMs: Date.now() - startedAt,
    });

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

    console.info(`Subdomain assigned: ${subdomain}`);

    logWorkspaceCompile("workspace_compile_ready", {
      userId,
      orgId: workspace.orgId,
      slug: workspace.slug,
      subdomain,
      audienceType: compileResult.routing.audience_type,
      baseFramework: compileResult.routing.base_framework,
      attempts: compileResult.attempts,
      inputType: compileResult.pagesUsed.length > 0 ? "url" : "description",
      status: 200,
      durationMs: Date.now() - startedAt,
    });

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
      loweredMessage.includes("additional workspace is $9/month");
    const isWorkspaceLimit = loweredMessage.includes("organization limit reached") || loweredMessage.includes("workspace limit");
    const status = isPlanRequired || isWorkspaceLimit ? 403 : 500;
    const code = isPlanRequired
      ? "plan_required"
      : isWorkspaceLimit
        ? "workspace_limit_reached"
        : "workspace_create_failed";

    logWorkspaceCompile("workspace_compile_workspace_create_failed", {
      userId,
      status,
      durationMs: Date.now() - startedAt,
      error: message,
    });

    if (loweredMessage.includes("dns") || loweredMessage.includes("domain") || loweredMessage.includes("vercel") || loweredMessage.includes("nxdomain")) {
      logWorkspaceCompile("workspace_compile_domain_routing_error", {
        userId,
        status,
        error: message,
      });
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
