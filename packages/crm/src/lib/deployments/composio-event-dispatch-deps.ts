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
  claimComposioPushRun,
  releaseComposioPushRunClaim,
} from "@/lib/deployments/store";
import { writeRunReceipt } from "@/lib/agent-receipts/write";
import type { DispatchComposioEventDeps } from "@/lib/deployments/composio-event-dispatch";

/** Build the production deps for dispatchComposioEventToDeployments.
 *  `claimRun`/`releaseClaim` wire the verify-gate fix-wave atomic
 *  claim-before-run (FIX 1 daily cap + FIX 2 dedupe, one statement) and the
 *  FIX 3 release-on-failure — see store.ts::claimComposioPushRun. */
export function buildDispatchComposioEventDeps(): DispatchComposioEventDeps {
  return {
    listMatchingDeployments: listComposioEventDeploymentsForOrg,
    claimRun: (deploymentId, orgId, messageId) =>
      claimComposioPushRun(deploymentId, orgId, messageId),
    releaseClaim: releaseComposioPushRunClaim,
    // Agent receipts slice (Task 2a) — record every STARTED push run
    // (ok/error) so a webhook-triggered agent's runs are queryable.
    // writeRunReceipt is itself fail-soft (never throws). Agent truth slice
    // (Task 1) — errorMessage (present only on an errored run) flows through
    // to writeRunReceipt's derivation, which scrubs + prefixes it; never
    // computed here, so this file stays a thin pass-through.
    writeReceipt: ({ orgId, deploymentId, status, sourceRef, toolCalls, replyText, errorMessage }) =>
      writeRunReceipt({
        orgId,
        deploymentId,
        triggerKind: "push",
        sourceRef,
        status,
        toolCalls,
        replyText,
        errorMessage,
      }),

    runAgenticTurn: async ({ orgId, deploymentId, channel, blueprint, payload }) => {
      const { db } = await import("@/db");
      const { organizations } = await import("@/db/schema/organizations");
      const { eq } = await import("drizzle-orm");
      const { getAIClient } = await import("@/lib/ai/client");
      const { runStatelessAgentTurn } = await import("@/lib/agents/stateless-turn");

      // Deterministic replay — Reelier phase 2c slice 1 (OBSERVE MODE ONLY).
      // Dark unless SF_DETERMINISTIC_REPLAY=1: when off, `recorder` stays
      // undefined, `wrapToolCall` is never passed to runStatelessAgentTurn,
      // and no new code path executes beyond this boolean check.
      const { isDeterministicReplayOn } = await import("@/lib/web-build/policy");
      const replayOn = isDeterministicReplayOn({
        SF_DETERMINISTIC_REPLAY: process.env.SF_DETERMINISTIC_REPLAY,
      });
      let recorder: import("@/lib/deployments/replay/recorder").TraceRecorder | undefined;
      const turnStartedAt = new Date();
      if (replayOn) {
        try {
          const { TraceRecorder } = await import("@/lib/deployments/replay/recorder");
          recorder = new TraceRecorder({
            name: `email:${deploymentId}`,
            startedAt: turnStartedAt.toISOString(),
            // Native tool names aren't known until getToolsForCapabilities
            // resolves inside runStatelessAgentTurn — this slice records the
            // capability allowlist instead (a stable, cheap proxy for
            // "what was bound"), never the resolved tool-name list.
            wrapped: blueprint.capabilities ?? [],
          });
        } catch (err) {
          // Recorder construction must never affect the turn — fall through
          // with recorder left undefined (no tracing this run).
          console.warn(
            "[composio-event-dispatch-deps] TraceRecorder construction failed:",
            err instanceof Error ? err.message : String(err),
          );
          recorder = undefined;
        }
      }

      const resolution = await getAIClient({ orgId });
      if (!resolution.client) {
        // No usable LLM key → can't drive the agent. Agent truth slice
        // (Task 1) — this is now an observable receipt reason ("no LLM key
        // configured") instead of a silent generic error; mirrors
        // runActionOnlyTurn's no_llm_key fail-soft, just no longer mute.
        return { ok: false, errorMessage: "no LLM key configured" };
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
      if (!org) return { ok: false, errorMessage: "organization not found" };

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

      // Agent receipts slice (Task 2a) — collect a secret-safe tool-call
      // trail via the SAME onToolEvent seam the supervised-run action log
      // uses (stateless-turn.ts: `line` is already a summarized, no-secrets
      // gloss — never the raw tool input/output). Only "result" events are
      // kept (start events would double the list with no extra info).
      const toolCalls: Array<{ tool: string; ok: boolean; note?: string }> = [];

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
        onToolEvent: (event) => {
          if (event.phase !== "result") return;
          toolCalls.push({ tool: event.tool, ok: event.ok === true, note: event.line });
        },
        // Deterministic replay — only passed when recording is on; every
        // other caller/run leaves this undefined (identical unwrapped path).
        wrapToolCall: recorder
          ? (tool, args, run) => recorder!.wrapCall(tool, args, run)
          : undefined,
      });

      // Deterministic replay — persist ONE row for this run, success or
      // failure, best-effort (writeWorkflowTrace never throws). Runs after
      // the turn resolves so recording never delays or blocks the turn
      // itself; a persistence failure is swallowed inside the writer.
      if (recorder) {
        try {
          const { writeWorkflowTrace } = await import("@/lib/deployments/replay/persist");
          const { extractMessageId } = await import(
            "@/lib/deployments/composio-event-dispatch"
          );
          await writeWorkflowTrace({
            orgId,
            deploymentId,
            triggerKind: "email",
            triggerKey: extractMessageId(payload ?? {}),
            startedAt: turnStartedAt,
            finishedAt: new Date(),
            ok: turn.ok === true,
            callCount: recorder.callCount,
            records: recorder.finish(),
            // No token metering path exists on this turn result yet — store
            // 0 rather than inventing a new one (slice 1 scope).
            inputTokens: 0,
            outputTokens: 0,
          });
        } catch (err) {
          console.warn(
            "[composio-event-dispatch-deps] deterministic-replay persist failed (fail-soft, run continues):",
            err instanceof Error ? err.message : String(err),
          );
        }
      }

      return {
        ok: turn.ok === true,
        toolCalls,
        replyText: turn.ok === true ? turn.reply : undefined,
        // Agent truth slice (Task 1) — the turn's own diagnostic (e.g.
        // "[runtime error] anthropic 401: invalid x-api-key") when it
        // failed. Unscrubbed here — writeRunReceipt's deriveReceiptSummary
        // scrubs before it's ever persisted.
        errorMessage: turn.ok === false ? turn.message : undefined,
      };
    },
  };
}
