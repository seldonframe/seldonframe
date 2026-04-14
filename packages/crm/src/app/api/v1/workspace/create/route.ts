import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createWorkspaceFromSoulAction } from "@/lib/billing/orgs";
import { demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
import { getByokClaudeKeyFromHeaders } from "@/lib/soul-compiler/anthropic";
import { compileSoulService } from "@/lib/soul-compiler/service";
import { checkRateLimit } from "@/lib/utils/rate-limit";

type WorkspaceCreateBody = {
  url?: unknown;
  description?: unknown;
  model?: unknown;
};

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

export async function POST(request: Request) {
  const startedAt = Date.now();

  if (isDemoReadonly()) {
    return demoApiBlockedResponse();
  }

  const apiKeyUserId = resolveUserIdFromSeldonApiKey(request.headers);
  const hasApiKeyHeader = Boolean(request.headers.get("x-seldon-api-key")?.trim());

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

  const allowed = checkRateLimit(rateKey, rateLimitPerHour, 60 * 60 * 1000);

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

  const body = (await request.json().catch(() => ({}))) as WorkspaceCreateBody;
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

    const workspaceBaseDomain = process.env.WORKSPACE_BASE_DOMAIN?.trim() || "seldonframe.app";
    const subdomain = `${workspace.slug}.${workspaceBaseDomain}`;

    logWorkspaceCompile("workspace_compile_ready", {
      userId,
      orgId: workspace.orgId,
      slug: workspace.slug,
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
          url: `https://${subdomain}`,
        },
        routing: compileResult.routing,
        attempts: compileResult.attempts,
        pagesUsed: compileResult.pagesUsed,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create workspace from compiled soul.";

    logWorkspaceCompile("workspace_compile_workspace_create_failed", {
      userId,
      status: 500,
      durationMs: Date.now() - startedAt,
      error: message,
    });

    return NextResponse.json(
      {
        status: "error",
        code: "workspace_create_failed",
        error: message,
      },
      { status: 500 }
    );
  }
}
