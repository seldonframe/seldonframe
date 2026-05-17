// packages/crm/src/lib/web-onboarding/run-create-from-url.ts
//
// 2026-05-17 UPDATE — TWO BUG FIXES:
//
//  (1) SSE event-name alignment. Previously emitted a single "building" event
//      that the UI didn't listen for; the UI's PROGRESS_KEYS array expects
//      soul_built → chatbot_built → demo_seeded after extracting. Result was
//      the LIVE BUILD checklist pulsing on "Shaping the personality" forever
//      even though the workspace had been fully created server-side. Now we
//      emit all three between extracting and done. createFullWorkspace is
//      still atomic (no internal callbacks) so the three events fire in fast
//      succession right before done — the user sees the checklist complete
//      cleanly instead of getting stuck.
//
//  (2) Operator-onboarding marker. proxy.ts:261 redirects any non-public
//      authed page to /clients/new when isSoulCompleted is false. That flag
//      is read from the operator's OWN organization's soulCompletedAt. For
//      agency operators (who create client workspaces as separate orgs and
//      never "complete" their own org's onboarding), the flag stayed false
//      forever — so after a successful /clients/new run, the browser would
//      navigate to /dashboard and get 307'd straight back to /clients/new.
//      We now call markOperatorOnboarded(primaryOrgId) right after the
//      workspace is provisioned so the next request's JWT refresh picks up
//      soulCompletedAt and the redirect gate passes.
//
// SSE event sequence is now:
//   fetching → extracting → soul_built → chatbot_built → demo_seeded → done
//
// PATCHED PER PLAN CORRECTION (2026-05-16):
// Calls the canonical createFullWorkspace orchestrator from
// lib/workspace/create-full.ts (handles soul + chatbot + demo atomically;
// landing is opt-in per the ops-stack-only flow). No mapFactsToSoul
// adapter — extracted facts are passed directly because they're already
// CreateFullWorkspaceInput-shaped.

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
  /**
   * Stamps soulCompletedAt on the OPERATOR's own org so proxy.ts:261 stops
   * redirecting them to /clients/new after the first successful workspace
   * creation. Idempotent — safe to call on every create. See
   * mark-operator-onboarded.ts for the SQL.
   */
  markOperatorOnboarded: (operatorOrgId: string) => Promise<void>;
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

      // 6. Build workspace (atomic — createFullWorkspace handles soul +
      //    chatbot + demo seeding in one call; landing is opt-in per the
      //    ops-stack-only flow so we no longer emit landing_built).
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

      // 7. Emit the granular progress events the UI listens for. createFull-
      //    Workspace is atomic from our perspective (no internal callbacks),
      //    so the three events fire in fast succession. The user briefly sees
      //    each step tick green right before the redirect — clean visual
      //    confirmation that every part of the workspace is ready, instead
      //    of the previous behaviour where the UI pulsed on "Shaping the
      //    personality" forever while we silently completed the build.
      sse.emit("soul_built", { workspaceId: result.workspace_id });
      sse.emit("chatbot_built", { workspaceId: result.workspace_id });
      sse.emit("demo_seeded", { workspaceId: result.workspace_id });

      // 8. Mark the OPERATOR's own org as onboarded so the proxy.ts:261
      //    redirect-to-/clients/new gate stops firing on their next page
      //    navigation. Idempotent — safe to call every time. Wrapped in a
      //    try/catch because a failure here must not block the user from
      //    reaching their freshly-created workspace; we just log + continue.
      if (input.sessionUser.primaryOrgId) {
        try {
          await input.deps.markOperatorOnboarded(input.sessionUser.primaryOrgId);
        } catch (err) {
          console.warn(
            JSON.stringify({
              event: "mark_operator_onboarded_failed",
              operator_org_id: input.sessionUser.primaryOrgId,
              workspace_id: result.workspace_id,
              detail: err instanceof Error ? err.message : String(err),
            }),
          );
        }
      }

      // 9. Done
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
