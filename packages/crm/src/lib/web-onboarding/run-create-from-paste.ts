// packages/crm/src/lib/web-onboarding/run-create-from-paste.ts
//
// Phase Q — "no website" workspace creation orchestrator.
//
// Mirrors run-create-from-url.ts exactly. The only differences:
//   - RunDeps.extractBusinessFactsFromPaste instead of ...FromUrl
//   - RunInput.body.text (pasted content) instead of .url
//   - Text validation: text.trim().length < 20 → 400 paste_too_thin
//   - fetching event carries { source: "paste" } instead of { url }
//   - seedSoulWikiSourceUrl is skipped (TODO Phase Q.1 — see comment below)
//   - seedClientContactInAgencyCrm called with sourceUrl: null

import { createSseStream, SSE_RESPONSE_HEADERS } from "./sse";
import type { CreateFullWorkspaceInput, CreateFullWorkspaceResult } from "@/lib/workspace/create-full";
import type { LimitDecision } from "@/lib/billing/limits";
import type { ExtractedBusinessFacts } from "./extraction-prompt";
import { runR1LandingStep } from "@/lib/landing/r1-landing-step";
import { applyLandingTemplateForWorkspace } from "@/lib/landing/apply-landing-template";

export type RunPasteDeps = {
  enforceWorkspaceLimit: (args: { primaryOrgId: string | null; ownedWorkspaceCount: number }) => Promise<LimitDecision>;
  getOwnedWorkspaceCount: (userId: string) => Promise<number>;
  getOperatorByokAnthropicKey: (orgId: string) => Promise<{ key: string; source: "byok" } | null>;
  extractBusinessFactsFromPaste: (args: { pastedText: string; byokKey: string }) => Promise<ExtractedBusinessFacts>;
  createFullWorkspace: (input: CreateFullWorkspaceInput) => Promise<CreateFullWorkspaceResult>;
  markOperatorOnboarded: (operatorOrgId: string, operatorUserId?: string) => Promise<void>;
  linkWorkspaceToOperator: (workspaceId: string, userId: string) => Promise<unknown>;
  createWebsiteChatbot: (args: { workspaceId: string; workspaceSlug: string }) => Promise<unknown>;
  seedClientContactInAgencyCrm: (args: {
    agencyOrgId: string;
    clientWorkspaceId: string;
    clientWorkspaceSlug: string;
    businessName: string;
    email?: string | null;
    phone?: string | null;
    sourceUrl?: string | null;
  }) => Promise<unknown>;
  seedDefaultOutboundTriggers: (orgId: string) => Promise<unknown>;
  workspaceBaseDomain: string;
};

export type RunPasteInput = {
  deps: RunPasteDeps;
  body: { text: unknown; landingTemplate?: string; themeMode?: string };
  sessionUser: { id: string; primaryOrgId: string | null } | null;
};

export type RunPasteResult = {
  stream: ReadableStream<Uint8Array>;
  headers: Record<string, string>;
};

export async function runCreateFromPaste(input: RunPasteInput): Promise<RunPasteResult> {
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

      // 2. Text validation — need at least 20 chars for meaningful extraction.
      const rawText = input.body.text;
      if (typeof rawText !== "string" || rawText.trim().length < 20) {
        sse.error(400, { reason: "paste_too_thin" });
        sse.close();
        return;
      }
      const pastedText = rawText.trim();

      // 3. Workspace limit
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
        sse.error(412, { reason: "needs_byok", message: "Add your Anthropic API key to extract business facts." });
        sse.close();
        return;
      }
      const byok = await input.deps.getOperatorByokAnthropicKey(input.sessionUser.primaryOrgId);
      if (!byok) {
        sse.error(412, { reason: "needs_byok", message: "Add your Anthropic API key to extract business facts." });
        sse.close();
        return;
      }

      // 5. Extract facts from pasted text. Keep "fetching" event name so the
      //    UI's existing SSE listeners work unchanged — the source field
      //    distinguishes paste from URL in server logs.
      sse.emit("fetching", { source: "paste" });
      let facts: ExtractedBusinessFacts;
      try {
        facts = await input.deps.extractBusinessFactsFromPaste({ pastedText, byokKey: byok.key });
      } catch (err: unknown) {
        const reason = (err as { reason?: string }).reason ?? "extraction_failed";
        sse.error(422, { reason });
        sse.close();
        return;
      }
      sse.emit("extracting", { fields: Object.keys(facts).sort() });

      // 6. Build workspace (same atomic createFullWorkspace pipeline)
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

      // 7. Link workspace + post-creation side effects
      if (result.workspace_id) {
        try {
          await input.deps.linkWorkspaceToOperator(result.workspace_id, input.sessionUser.id);
        } catch (err) {
          console.warn(
            JSON.stringify({
              event: "link_workspace_to_operator_failed",
              user_id: input.sessionUser.id,
              workspace_id: result.workspace_id,
              detail: err instanceof Error ? err.message : String(err),
            }),
          );
        }

        // 7b. Auto-create the website-chatbot agent
        try {
          await input.deps.createWebsiteChatbot({
            workspaceId: result.workspace_id,
            workspaceSlug: result.slug ?? result.workspace_id,
          });
        } catch (err) {
          console.warn(
            JSON.stringify({
              event: "auto_chatbot_failed",
              workspace_id: result.workspace_id,
              detail: err instanceof Error ? err.message : String(err),
            }),
          );
        }

        // 7c. Seed default outbound message triggers (idempotent)
        try {
          await input.deps.seedDefaultOutboundTriggers(result.workspace_id);
        } catch (err) {
          console.warn(
            JSON.stringify({
              event: "seed_default_outbound_triggers_failed",
              workspace_id: result.workspace_id,
              detail: err instanceof Error ? err.message : String(err),
            }),
          );
        }

        // TODO Phase Q.1: seed pasted text as soul source once seedSoulWikiSource
        // is generalized to accept arbitrary text blobs (currently it takes a URL).
        // Operators can add the paste manually via Soul Wiki UI in the meantime.

        // 7d. Seed a contact row in the AGENCY's own CRM.
        //     sourceUrl is null — we don't have a URL for paste-sourced workspaces.
        if (input.sessionUser.primaryOrgId) {
          try {
            await input.deps.seedClientContactInAgencyCrm({
              agencyOrgId: input.sessionUser.primaryOrgId,
              clientWorkspaceId: result.workspace_id,
              clientWorkspaceSlug: result.slug ?? result.workspace_id,
              businessName: facts.business_name,
              email: facts.email ?? null,
              phone: facts.phone ?? null,
              sourceUrl: null,
            });
          } catch (err) {
            console.warn(
              JSON.stringify({
                event: "seed_client_contact_failed",
                agency_org_id: input.sessionUser.primaryOrgId,
                client_workspace_id: result.workspace_id,
                detail: err instanceof Error ? err.message : String(err),
              }),
            );
          }
        }

        // 7d2. Auto-pick a premium health/wellness landing template (best-
        //      effort, health-only) so /w/<slug> renders it instead of
        //      landing-r1. Non-health businesses are left on landing-r1.
        try {
          const tplFacts = facts as CreateFullWorkspaceInput;
          await applyLandingTemplateForWorkspace(
            result.workspace_id,
            {
              businessName: tplFacts.business_name,
              businessDescription: tplFacts.business_description,
              services: tplFacts.services,
            },
            input.body.landingTemplate,
          );
        } catch (err) {
          console.warn(
            JSON.stringify({
              event: "landing_template_autopick_failed",
              workspace_id: result.workspace_id,
              detail: err instanceof Error ? err.message : String(err),
            }),
          );
        }

        // 7e. Generate the R1 landing payload + persist.
        //     Same step as the URL path — non-fatal, public immediately.
        const r1Result = await runR1LandingStep({
          workspaceId: result.workspace_id,
          facts,
          byokKey: byok.key,
          themeMode: input.body.themeMode as ("auto" | "light" | "dark") | undefined,
        });
        if (r1Result.ok) {
          sse.emit("landing_built", { workspaceId: result.workspace_id });
        }
      }

      // 8. Emit granular progress events (fast succession — createFullWorkspace is atomic).
      //    2026-05-22 — soul_built carries the real business name + archetype so the
      //    build-animation v2 can crossfade Stage-A inferred values → Stage-B real
      //    values. Same contract as run-create-from-url.ts; see that file's header
      //    for the consumer-side detail.
      sse.emit("soul_built", {
        workspaceId: result.workspace_id,
        name: facts.business_name,
        archetype: result.configured?.theme.aestheticArchetype ?? null,
      });
      sse.emit("chatbot_built", { workspaceId: result.workspace_id });
      sse.emit("demo_seeded", { workspaceId: result.workspace_id });

      // 8b. Mark the OPERATOR as onboarded
      if (input.sessionUser.primaryOrgId) {
        try {
          await input.deps.markOperatorOnboarded(
            input.sessionUser.primaryOrgId,
            input.sessionUser.id,
          );
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

      // 9. Done — redirect to the workspace Ready hub
      sse.emit("done", {
        workspaceId: result.workspace_id,
        slug: result.slug,
        dashboardUrl: `/clients/${result.slug}/ready`,
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
