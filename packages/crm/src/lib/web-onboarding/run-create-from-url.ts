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
import { runR1LandingStep } from "@/lib/landing/r1-landing-step";

export type RunDeps = {
  enforceWorkspaceLimit: (args: { primaryOrgId: string | null; ownedWorkspaceCount: number }) => Promise<LimitDecision>;
  getOwnedWorkspaceCount: (userId: string) => Promise<number>;
  getOperatorByokAnthropicKey: (orgId: string) => Promise<{ key: string; source: "byok" } | null>;
  extractBusinessFactsFromUrl: (args: { url: string; byokKey: string }) => Promise<ExtractedBusinessFacts>;
  createFullWorkspace: (input: CreateFullWorkspaceInput) => Promise<CreateFullWorkspaceResult>;
  /**
   * Three-in-one onboarding stamp on the OPERATOR's own org + user row:
   * sets soulCompletedAt, welcomeShown=true, and planId='free' (all
   * idempotent / non-clobbering). Without this, every successful workspace
   * creation would (a) bounce them back to /clients/new via proxy.ts:261,
   * (b) detour through /welcome via proxy.ts:265, and (c) bounce them to
   * /pricing via plan-gate.ts:74. See mark-operator-onboarded.ts for the
   * full story.
   */
  markOperatorOnboarded: (operatorOrgId: string, operatorUserId?: string) => Promise<void>;
  /**
   * Make the operator the owner of the freshly-created workspace by
   * stamping organizations.ownerId AND inserting an org_members row
   * with role='owner'. Without this, createAnonymousWorkspace leaves
   * ownerId=null and the new workspace becomes invisible to the
   * operator's dashboard/clients listing — they create a workspace,
   * the SSE redirects them to /dashboard?ws=<slug>, but /clients shows
   * nothing because they aren't a member. See link-workspace-to-
   * operator.ts for the SQL + idempotency story.
   */
  linkWorkspaceToOperator: (workspaceId: string, userId: string) => Promise<unknown>;
  /**
   * Auto-create the website-chatbot agent so the Ready hub's "Test
   * chatbot →" link goes to a real /agents/<id>/test page instead of
   * the landing page. Replicates the v2/complete inline-create pattern
   * (status:'test' so it responds immediately). Non-fatal — see
   * runCreateFromUrl impl for the try/catch.
   */
  createWebsiteChatbot: (args: { workspaceId: string; workspaceSlug: string }) => Promise<unknown>;
  /**
   * 2026-05-17 — auto-seed a contact row in the AGENCY's own CRM
   * representing the new client SMB (Rain Pros, Seattle Heating, etc.).
   * Lets the agency operator see every client they manage as a contact
   * in their own /contacts list without manual data entry. Non-fatal —
   * runCreateFromUrl just logs failures and continues.
   */
  seedClientContactInAgencyCrm: (args: {
    agencyOrgId: string;
    clientWorkspaceId: string;
    clientWorkspaceSlug: string;
    businessName: string;
    email?: string | null;
    phone?: string | null;
    sourceUrl?: string | null;
  }) => Promise<unknown>;
  /**
   * 2026-05-17 — seed a soul_sources row with the source URL the
   * operator pasted so /settings/soul-wiki shows it as a pre-populated
   * source they can iterate on. Best-effort, non-fatal.
   */
  seedSoulWikiSourceUrl: (orgId: string, sourceUrl: string) => Promise<unknown>;
  /**
   * 2026-05-18 (messaging plan v2, slice 2) — seed the default outbound
   * message triggers (booking-confirmation email on booking.created,
   * etc.) so new workspaces ship with sane defaults. Idempotent.
   */
  seedDefaultOutboundTriggers: (orgId: string) => Promise<unknown>;
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

      // 7. Link the new workspace to the operator. createAnonymousWorkspace
      //    inserts the org with ownerId=null + no org_members row, which
      //    made sense in the MCP claim flow but breaks the web-onboarding
      //    flow — the operator can't see the workspace they just made
      //    because they aren't an owner OR a member. We stamp both now so
      //    /dashboard, /clients, and the workspace-switch flow all
      //    recognise them as authorized. Failures here are logged but
      //    non-fatal — the workspace exists, the operator just won't see
      //    it until link-owner is called separately. See
      //    lib/workspace/link-workspace-to-operator.ts for the SQL.
      // The result.status === "ready" check above narrows the discriminated
      // union, but the workspace_id field is still typed as optional on
      // the success variant. Guard explicitly so TS is happy and so a
      // malformed `ready` response (no id) doesn't crash the SSE thread.
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

        // 7b. Auto-create the website-chatbot agent for the new workspace.
        //     createFullWorkspace seeds CRM/booking/intake/landing but NOT
        //     the agent (that's historically done by /v2/complete or the
        //     MCP build_website_chatbot call). For the web onboarding flow
        //     we replicate the v2/complete pattern inline so the Ready hub
        //     can deep-link "Test chatbot →" to a real /agents/<id>/test
        //     page instead of dumping the user on the landing page.
        //
        //     Non-fatal: a failure here just means the Ready hub renders
        //     the "Create chatbot" CTA fallback instead of the test link;
        //     the workspace is still usable.
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

        // 7c1. Seed default outbound message triggers (messaging plan
        //      v2, slice 2). New workspaces ship with one trigger
        //      enabled by default: booking-confirmation email on
        //      booking.created. Slices 3/7 add SMS + intake + reminders.
        //      Idempotent — re-runs are no-ops.
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

        // 7c2. Seed the client workspace's soul_sources with the URL
        //      the operator pasted, so /settings/soul-wiki shows it as
        //      a pre-populated source on first visit. Operators can add
        //      YouTube videos / testimonials / pasted text afterward
        //      without needing to re-enter the website. Best-effort +
        //      non-fatal (HTTP fetch can fail).
        try {
          await input.deps.seedSoulWikiSourceUrl(result.workspace_id, validation.url);
        } catch (err) {
          console.warn(
            JSON.stringify({
              event: "seed_soul_wiki_source_failed",
              workspace_id: result.workspace_id,
              source_url: validation.url,
              detail: err instanceof Error ? err.message : String(err),
            }),
          );
        }

        // 7c. Seed a contact row in the AGENCY's own CRM so the agency
        //     operator sees every client they manage as a contact in
        //     their own /contacts list. Operator can convert to a deal,
        //     log activities, etc. — SeldonFrame becomes a real business
        //     OS for the agency, not just a tool for managing client
        //     workspaces in isolation. Idempotent + non-fatal.
        if (input.sessionUser.primaryOrgId) {
          try {
            await input.deps.seedClientContactInAgencyCrm({
              agencyOrgId: input.sessionUser.primaryOrgId,
              clientWorkspaceId: result.workspace_id,
              clientWorkspaceSlug: result.slug ?? result.workspace_id,
              businessName: facts.business_name,
              email: facts.email ?? null,
              phone: facts.phone ?? null,
              sourceUrl: validation.url,
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

        // 7d. Generate the R1 landing payload + persist.
        //     Public at /w/<slug> immediately — no approval gate.
        //     Non-fatal: workspace creation still succeeds without a
        //     landing if the LLM step errors. The SSE event fires only
        //     on success; the UI doesn't depend on it (build animation
        //     runs its own clock). Operator can retry via a future
        //     manual button.
        const r1Result = await runR1LandingStep({
          workspaceId: result.workspace_id,
          facts,
          byokKey: byok.key,
        });
        if (r1Result.ok) {
          sse.emit("landing_built", { workspaceId: result.workspace_id });
        }
      }

      // 8. Emit the granular progress events the UI listens for. createFull-
      //    Workspace is atomic from our perspective (no internal callbacks),
      //    so the three events fire in fast succession. The user briefly sees
      //    each step tick green right before the redirect — clean visual
      //    confirmation that every part of the workspace is ready, instead
      //    of the previous behaviour where the UI pulsed on "Shaping the
      //    personality" forever while we silently completed the build.
      // 2026-05-22 — soul_built now carries the real business name +
      // archetype so the build-animation v2 client-side crossfade can
      // swap from Stage-A inferred values (URL → guessed name + vertical)
      // to Stage-B real values (extracted name + classified archetype)
      // with a 180ms name fade + 1600ms confirmation flash. Without
      // these fields the animation only fires the flash but leaves the
      // inferred name on screen. See build-animation/build-stage-v2.tsx
      // (parseSoulPayload + applySoulBuilt) for the consumer contract.
      sse.emit("soul_built", {
        workspaceId: result.workspace_id,
        name: facts.business_name,
        archetype: result.configured?.theme.aestheticArchetype ?? null,
      });
      sse.emit("chatbot_built", { workspaceId: result.workspace_id });
      sse.emit("demo_seeded", { workspaceId: result.workspace_id });

      // 8. Mark the OPERATOR as onboarded — stamps soulCompletedAt,
      //    welcomeShown=true, and planId='free' in one shot so the next
      //    page navigation passes proxy.ts:261 (soul gate), proxy.ts:265
      //    (welcome gate), AND plan-gate.ts:74 (plan gate) without
      //    detouring through /clients/new, /welcome, or /pricing.
      //    Idempotent — safe to call every time. Wrapped in try/catch
      //    because a failure here must not block the user from reaching
      //    their freshly-created workspace; we just log + continue.
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

      // 9. Done — redirect to the dedicated "Workspace Ready" deliverables
      //    hub instead of the generic /dashboard?ws=<slug> view. The new
      //    page surfaces the public URLs (landing/intake/booking/chatbot)
      //    with correct slug-scoped links + next-step guidance, instead
      //    of dumping the operator into the empty agency dashboard. See
      //    app/(dashboard)/clients/[slug]/ready/page.tsx.
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
