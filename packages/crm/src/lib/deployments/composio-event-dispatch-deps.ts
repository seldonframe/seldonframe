// Email-agent slice (Part B1) — PRODUCTION deps for
// dispatchComposioEventToDeployments (./composio-event-dispatch.ts).
//
// Mirrors schedule-agents-deps.ts's split: the orchestrator is pure/DI'd +
// unit-tested; this file is the only place that touches Postgres / Composio /
// Anthropic. `runAgenticTurn` drives the matched deployment's agent ONE turn,
// NON-testMode, via runStatelessAgentTurn — the SAME seam
// run-event-agent-deps.ts's runActionOnlyTurn uses for a live tool-fire (no
// hand-rolled tool loop). It also splices the operator's voice profile
// (Part A2) for an email-channel deployment, so a push-triggered draft is
// written in the operator's voice too.
//
// Plain lib module (NOT "use server"); imported only from
// lib/events/listeners.ts (server-only).

import {
  listComposioEventDeploymentsForOrg,
  isComposioMessageProcessed,
  markComposioMessageProcessed,
} from "@/lib/deployments/store";
import type { DispatchComposioEventDeps } from "@/lib/deployments/composio-event-dispatch";

/** Build the production deps for dispatchComposioEventToDeployments. */
export function buildDispatchComposioEventDeps(): DispatchComposioEventDeps {
  return {
    listMatchingDeployments: listComposioEventDeploymentsForOrg,
    isAlreadyProcessed: isComposioMessageProcessed,
    markProcessed: markComposioMessageProcessed,

    runAgenticTurn: async ({ orgId, channel, blueprint }) => {
      const { db } = await import("@/db");
      const { organizations } = await import("@/db/schema/organizations");
      const { eq } = await import("drizzle-orm");
      const { getAIClient } = await import("@/lib/ai/client");
      const { runStatelessAgentTurn } = await import("@/lib/agents/stateless-turn");

      const resolution = await getAIClient({ orgId });
      if (!resolution.client) {
        // No usable LLM key → can't drive the agent. Not an error the caller
        // needs to see beyond "did not run" — mirrors runActionOnlyTurn's
        // no_llm_key fail-soft.
        return { ok: false };
      }

      const [org] = await db
        .select({
          slug: organizations.slug,
          name: organizations.name,
          soul: organizations.soul,
          timezone: organizations.timezone,
        })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);
      if (!org) return { ok: false };

      // Email-agent slice (Part A2) — splice the operator's voice profile for
      // an email-channel deployment. Read error / missing note → null (no-op).
      let voiceProfileNote: string | null = null;
      if (channel === "email") {
        try {
          const { readBrainNote } = await import("@/lib/brain/store");
          const { VOICE_PROFILE_NOTE_PATH } = await import(
            "@/lib/agents/voice-profile/ingest-sent-mail"
          );
          const note = await readBrainNote({
            orgId,
            scope: "workspace",
            path: VOICE_PROFILE_NOTE_PATH,
          });
          voiceProfileNote = note?.body ?? null;
        } catch {
          voiceProfileNote = null;
        }
      }

      const turn = await runStatelessAgentTurn({
        orgId,
        orgSlug: org.slug,
        orgName: org.name ?? "your business",
        soul:
          org.soul && typeof org.soul === "object"
            ? (org.soul as Parameters<typeof runStatelessAgentTurn>[0]["soul"])
            : null,
        timezone: org.timezone ?? "UTC",
        blueprint,
        voiceProfileNote,
        messages: [
          {
            role: "user",
            content:
              "You have a new email in your inbox. Check it and triage it using your tools (label, draft a reply if appropriate).",
          },
        ],
        testMode: false,
        client: resolution.client,
      });

      return { ok: turn.ok === true };
    },
  };
}
