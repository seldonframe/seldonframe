// packages/crm/src/lib/web-onboarding/run-create-from-url.ts
//
// PATCHED PER PLAN CORRECTION (2026-05-16):
// Calls the canonical createFullWorkspace orchestrator from
// lib/workspace/create-full.ts (handles soul + landing + chatbot + demo
// atomically). SSE event sequence is fetching → extracting → building →
// done. No mapFactsToSoul adapter — extracted facts are passed directly
// because they're already CreateFullWorkspaceInput-shaped.

import { createSseStream, SSE_RESPONSE_HEADERS } from "./sse";
import { validateCreateFromUrlInput } from "./url-validator";
import type { CreateFullWorkspaceInput, CreateFullWorkspaceResult } from "@/lib/workspace/create-full";
import type { LimitDecision } from "@/lib/billing/limits";
import type { ExtractedBusinessFacts } from "./extraction-prompt";

export type RunDeps = {
  enforceWorkspaceLimit: (args: { primaryOrgId: string | null; ownedWorkspaceCount: number }) => Promise<LimitDecision>;
  getOwnedWorkspaceCount: (userId: string) => Promise<number>;
  getOperatorByokAnthropicKey: (orgId: string) => Promise<{ key: string; source: "byok" } | null>;
  extractBusinessFactsFromUrl: (args: { url: string; byokKey: string }) => Promise<ExtractedBusinessFacts>;
  createFullWorkspace: (input: CreateFullWorkspaceInput) => Promise<CreateFullWorkspaceResult>;
  workspaceBaseDomain: string;
};

export type RunInput = {
  deps: RunDeps;
  body: { url: unknown };
  sessionUser: { id: string; primaryOrgId: string | null } | null;
};

export type RunResult = {
  stream: ReadableStream<Uint8Array>;
  headers: Record<string, string>;
};

export async function runCreateFromUrl(input: RunInput): Promise<RunResult> {
  const sse = createSseStream();

  // Drive in the background so the response can return immediately.
  (async () => {
    try {
      // 1. Auth gate
      if (!input.sessionUser) {
        sse.error(401, { reason: "unauthorized" });
        sse.close();
        return;
      }

      // 2. URL validation
      const validation = validateCreateFromUrlInput(input.body.url);
      if (!validation.ok) {
        sse.error(400, { reason: validation.code });
        sse.close();
        return;
      }

      // 3. Workspace limit (uses REAL enforceWorkspaceLimit from lib/billing/limits.ts)
      const ownedCount = await input.deps.getOwnedWorkspaceCount(input.sessionUser.id);
      const decision = await input.deps.enforceWorkspaceLimit({
        primaryOrgId: input.sessionUser.primaryOrgId,
        ownedWorkspaceCount: ownedCount,
      });
      if (!decision.allowed) {
        sse.error(402, {
          reason: decision.reason,
          message: decision.message,
          upgradeUrl: decision.upgradeUrl,
          used: decision.used,
          limit: decision.limit,
          tier: decision.tier,
        });
        sse.close();
        return;
      }

      // 4. BYOK precondition
      if (!input.sessionUser.primaryOrgId) {
        sse.error(412, { reason: "needs_byok", message: "Add your Anthropic API key to extract from URLs." });
        sse.close();
        return;
      }
      const byok = await input.deps.getOperatorByokAnthropicKey(input.sessionUser.primaryOrgId);
      if (!byok) {
        sse.error(412, { reason: "needs_byok", message: "Add your Anthropic API key to extract from URLs." });
        sse.close();
        return;
      }

      // 5. Fetch + extract (one call — Anthropic does the web_fetch server-side)
      sse.emit("fetching", { url: validation.url });
      let facts: ExtractedBusinessFacts;
      try {
        facts = await input.deps.extractBusinessFactsFromUrl({ url: validation.url, byokKey: byok.key });
      } catch (err: unknown) {
        const reason = (err as { reason?: string }).reason ?? "extraction_failed";
        sse.error(422, { reason });
        sse.close();
        return;
      }
      sse.emit("extracting", { fields: Object.keys(facts).sort() });

      // 6. Build workspace (atomic — createFullWorkspace handles soul, landing,
      //    chatbot, demo seeding all in one call).
      sse.emit("building", { phase: "soul_landing_chatbot_demo" });
      const result = await input.deps.createFullWorkspace(facts as CreateFullWorkspaceInput);
      if (result.status !== "ready") {
        sse.error(500, {
          reason: "internal_error",
          detail: result.error?.message ?? "createFullWorkspace failed",
          step: result.error?.step ?? "unknown",
        });
        sse.close();
        return;
      }

      // 7. Done
      sse.emit("done", {
        workspaceId: result.workspace_id,
        slug: result.slug,
        dashboardUrl: `/dashboard?ws=${result.slug}`,
        publicHomeUrl: result.public_urls?.home,
      });
      sse.close();
    } catch (err: unknown) {
      sse.error(500, { reason: "internal_error", detail: err instanceof Error ? err.message : String(err) });
      sse.close();
    }
  })();

  return { stream: sse.stream, headers: SSE_RESPONSE_HEADERS };
}
