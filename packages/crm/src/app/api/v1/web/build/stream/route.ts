// packages/crm/src/app/api/v1/web/build/stream/route.ts
//
// PUBLIC, UNAUTHENTICATED SSE build route — the "type a URL, get a real
// hosted workspace, no signup" first-run wedge. Mirrors
// api/v1/web/workspaces/create-from-url/route.ts (the authed route) almost
// exactly, with three differences:
//
//   1. No auth() call, no session. sessionUser: null is passed to the SAME
//      runCreateFromUrl orchestrator (run-create-from-url.ts) that already
//      supports an anonymous path — see its RunInput.sessionUser doc
//      comment. The orchestrator's steps that assume a real operator user
//      (workspace-limit enforcement, link-to-operator, mark-operator-
//      onboarded) all skip themselves automatically when sessionUser is
//      null; this route enforces its OWN guardrail instead (the per-IP
//      flag + rate-limit gate below).
//
//   2. Gated + rate-limited BEFORE any build work happens:
//      isWebUngatedBuildOn(env) → 404 when off (the surface doesn't exist
//      unless Max flips SF_WEB_UNGATED_BUILD=1 in Vercel); then a per-IP
//      rate limit (3 builds / 24h) → an inline SSE `error` event so the
//      /try page can show "sign up to keep building" instead of a raw
//      network failure.
//
//   3. The `done` event carries an ADDITIONAL one-time claim grant
//      ({ ws_id, slug, public_home_url, chatbot_embed_url, claim_token })
//      so the anonymous builder — who has no session — can later claim
//      ownership of the workspace they just built. This is opt-in via
//      RunInput.includeClaimGrant, which ONLY this route sets; the authed
//      route's done event shape is byte-identical to before.
//
// Marker: once the workspace exists we stamp
// organizations.settings.origin = "web_ungated" (merged into the existing
// settings jsonb, same idiom as mark-operator-onboarded.ts) so downstream
// analytics/ops can tell an anonymous web-build workspace apart from an
// authed-operator one. This happens inside the createWebsiteChatbot dep
// wrapper below — the same seam the authed route uses to auto-provision
// the chatbot — right after the workspace_id is known.
//
// SECURITY: no bearer token is ever logged, printed, or included anywhere
// except the single `claim_token` field of the final `done` SSE event. No
// Stripe call sites here. This route never reads a secret value out of env
// and echoes it back — ANTHROPIC_API_KEY is used server-side only, to call
// the extraction pipeline, never returned to the client.

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { runCreateFromUrl } from "@/lib/web-onboarding/run-create-from-url";
import { createFullWorkspace } from "@/lib/workspace/create-full";
import { extractBusinessFactsFromUrl } from "@/lib/web-onboarding/markdown-extractor";
import { createAgent } from "@/lib/agents/store";
import { setPublicChatbotEmbed } from "@/lib/agents/public-embed";
import { autoCreateWebsiteChatbot } from "@/lib/agents/auto-create-website-chatbot";
import { withUrlExtractionCache } from "@/lib/web-build/cached-extraction";
import {
  isWebUngatedBuildOn,
  WEB_BUILD_RATE_LIMIT,
  WEB_BUILD_RATE_WINDOW_MS,
  WEB_UNGATED_ORIGIN,
} from "@/lib/web-build/policy";
import { checkRateLimit } from "@/lib/utils/rate-limit";
import { assertPublicHttpUrl } from "@/lib/security/ssrf-guard";
import { createSseStream, SSE_RESPONSE_HEADERS } from "@/lib/web-onboarding/sse";

export const dynamic = "force-dynamic";
// Pin Node.js runtime (drizzle + node:crypto + SDKs) — matches the authed
// sibling route; guards against an accidental Edge default (final review 2026-07-04).
export const runtime = "nodejs";

export type WebBuildGateResult =
  | { kind: "not_found" }
  | { kind: "rate_limited" }
  | { kind: "ok" };

/**
 * Pure gate helper — flag check first (unconditional 404 when the surface
 * is off, regardless of rate), THEN the rate check. Exported so the unit
 * test can pin all three outcomes without touching the DB/Redis-backed
 * checkRateLimit or a real request.
 */
export async function resolveWebBuildGate(
  env: { SF_WEB_UNGATED_BUILD?: string | undefined },
  ip: string,
  rateCheck: () => Promise<boolean>,
): Promise<WebBuildGateResult> {
  if (!isWebUngatedBuildOn(env)) {
    return { kind: "not_found" };
  }
  const allowed = await rateCheck();
  if (!allowed) {
    return { kind: "rate_limited" };
  }
  return { kind: "ok" };
}

/** Same first-hop-of-x-forwarded-for idiom used by the authed route's
 *  siblings (analyze-url, workspace/v2/create, etc.) — see those files. */
function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return "local";
  return forwarded.split(",")[0]?.trim() || "local";
}

/** Best-effort marker so an anonymous web-build workspace is
 *  distinguishable from an authed-operator one downstream. Merges into
 *  the existing settings jsonb (same COALESCE-then-merge idiom as
 *  mark-operator-onboarded.ts) rather than clobbering other keys. Never
 *  throws — a failure here must not block the build. */
async function stampWebUngatedOrigin(workspaceId: string): Promise<void> {
  try {
    await db
      .update(organizations)
      .set({
        settings: sql`COALESCE(${organizations.settings}, '{}'::jsonb) || ${JSON.stringify({ origin: WEB_UNGATED_ORIGIN })}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, workspaceId));
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "stamp_web_ungated_origin_failed",
        workspace_id: workspaceId,
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

async function runAnonymousBuild(url: string | null): Promise<Response> {
  const { stream, headers } = await runCreateFromUrl({
    deps: {
      // No enforceWorkspaceLimit/getOwnedWorkspaceCount call ever happens
      // for anonymous builds (the orchestrator skips that whole step when
      // sessionUser is null) — these are still required by the RunDeps
      // type, so we supply harmless stand-ins that are never invoked.
      enforceWorkspaceLimit: async () => ({ allowed: true }) as never,
      getOwnedWorkspaceCount: async () => 0,
      // Public/anonymous builds only ever use the PLATFORM-managed
      // Anthropic key — there is no operator org to resolve a BYOK key
      // against. Returns null (→ extraction_unavailable) if the platform
      // key isn't configured on this deployment.
      resolveExtractionKey: async () => {
        const platformKey = process.env.ANTHROPIC_API_KEY?.trim();
        return platformKey ? { key: platformKey } : null;
      },
      // Wrapped with the shared url_extraction_cache so repeated public
      // builds against the same URL (e.g. a visitor retrying) don't
      // re-pay the LLM extraction cost.
      extractBusinessFactsFromUrl: (args) =>
        withUrlExtractionCache("business_facts", args.url, () => extractBusinessFactsFromUrl(args)).then(
          (r) => r.value,
        ),
      createFullWorkspace,
      // No-ops for the operator-linked steps — there is no operator user
      // on the anonymous path (the orchestrator never calls these when
      // sessionUser is null, but RunDeps requires them structurally).
      markOperatorOnboarded: async () => {},
      linkWorkspaceToOperator: async () => undefined,
      createWebsiteChatbot: async ({ workspaceId, workspaceSlug }) => {
        // Stamp the web_ungated origin marker as soon as the workspace_id
        // is known — this is the same point in the pipeline the authed
        // route uses to auto-provision the chatbot, so it's the earliest
        // reliable hook the route has into "the org now exists."
        await stampWebUngatedOrigin(workspaceId);

        const result = await autoCreateWebsiteChatbot({
          workspaceId,
          workspaceSlug,
          deps: { createAgent, setPublicChatbotEmbed },
        });
        if (result.ok && result.embedPublishFailed) {
          console.warn(
            JSON.stringify({
              event: "auto_chatbot_embed_publish_failed",
              workspace_id: workspaceId,
            }),
          );
        }
        return result;
      },
      seedClientContactInAgencyCrm: async () => undefined,
      seedSoulWikiSourceUrl: async () => undefined,
      seedDefaultOutboundTriggers: async () => undefined,
      workspaceBaseDomain: process.env.WORKSPACE_BASE_DOMAIN ?? "app.seldonframe.com",
    },
    body: { url },
    sessionUser: null,
    includeClaimGrant: true,
  });

  return new Response(stream, { headers });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url).searchParams.get("url");
  const ip = getClientIp(request);

  const gate = await resolveWebBuildGate({ SF_WEB_UNGATED_BUILD: process.env.SF_WEB_UNGATED_BUILD }, ip, () =>
    checkRateLimit(`web-build:${ip}`, WEB_BUILD_RATE_LIMIT, WEB_BUILD_RATE_WINDOW_MS),
  );

  if (gate.kind === "not_found") {
    return new Response(null, { status: 404 });
  }

  if (gate.kind === "rate_limited") {
    const sse = createSseStream();
    sse.emit("error", {
      code: "rate_limited",
      message: "You've built a few workspaces today — sign up to keep building.",
    });
    sse.close();
    return new Response(sse.stream, { headers: SSE_RESPONSE_HEADERS });
  }

  // SSRF hardening on the now-public path (final review 2026-07-04): resolve +
  // vet the pasted URL before any pipeline work. The actual scrape runs on
  // Firecrawl's hosted infra, so this is defense-in-depth, not a live hole.
  // Normalize schemeless pastes ("acme.com") the same way url-cache-key does,
  // and keep the rejection message generic (SsrfBlockedError contract).
  if (url) {
    const trimmed = url.trim();
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      await assertPublicHttpUrl(candidate);
    } catch {
      const sse = createSseStream();
      sse.emit("error", {
        code: "invalid_url",
        message: "That URL can't be reached — double-check it and try again.",
      });
      sse.close();
      return new Response(sse.stream, { headers: SSE_RESPONSE_HEADERS });
    }
  }

  return runAnonymousBuild(url);
}
