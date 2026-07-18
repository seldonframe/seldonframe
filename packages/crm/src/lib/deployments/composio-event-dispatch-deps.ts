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
// Deterministic replay — Reelier phase 2c slice 2. Precondition fix (review
// item 3): this was a per-dispatch `await import(...)` inside runAgenticTurn
// — a pure policy-flag check has no reason to pay a dynamic-import cost on
// every single run. Static, top-level, same as every other policy import in
// this file's sibling deps modules.
import { isDeterministicReplayOn } from "@/lib/web-build/policy";

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

      // Deterministic replay — Reelier phase 2c. Dark unless
      // SF_DETERMINISTIC_REPLAY=1: when off, neither the observe-mode
      // recorder (slice 1) nor the L0 replay-before-LLM seam (slice 2)
      // executes beyond this boolean check — runTurn() below is called
      // directly, byte-for-byte the pre-slice-1 code path.
      const replayOn = isDeterministicReplayOn({
        SF_DETERMINISTIC_REPLAY: process.env.SF_DETERMINISTIC_REPLAY,
      });

      const resolution = await getAIClient({ orgId });
      if (!resolution.client) {
        // No usable LLM key → can't drive the agent. Agent truth slice
        // (Task 1) — this is now an observable receipt reason ("no LLM key
        // configured") instead of a silent generic error; mirrors
        // runActionOnlyTurn's no_llm_key fail-soft, just no longer mute.
        // NOTE: this check runs BEFORE the L0 replay attempt below — a
        // deployment with a working enabled skill but no LLM key still
        // fails here today. Decoupling replay from the LLM-key requirement
        // is a documented future improvement, not this slice's scope (the
        // brief places replay "before running the agentic turn", not before
        // the org/LLM preconditions the turn itself already required).
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

      // The normal agentic-turn path (unchanged from slice 1 apart from
      // being wrapped in a closure) — invoked directly when replay is off,
      // and by replayOrTurn (only on a replay skip/diverge) when it's on.
      const runTurn = async (): Promise<{
        ok: boolean;
        toolCalls?: Array<{ tool: string; ok: boolean; note?: string }>;
        replyText?: string;
        errorMessage?: string;
      }> => {
        // Deterministic replay — Reelier phase 2c slice 1 (OBSERVE MODE
        // ONLY). Precondition fix (review item 3, "guarded Date
        // construction") — turnStartedAt is only ever read inside the
        // `if (replayOn)`/`if (recorder)` blocks below, so it's now only
        // constructed when actually needed (was unconditional before).
        let recorder: import("@/lib/deployments/replay/recorder").TraceRecorder | undefined;
        let turnStartedAt: Date | undefined;
        if (replayOn) {
          turnStartedAt = new Date();
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
          client: resolution.client!,
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
        if (recorder && turnStartedAt) {
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
      };

      if (!replayOn) {
        return runTurn();
      }

      // Deterministic replay — Reelier phase 2c slice 2. Try a deterministic
      // L0 skill replay BEFORE the agentic turn; only falls through to
      // runTurn() on a skip (no enabled skill / gate refused) or a
      // divergence (an assert failed mid-replay).
      const { replayOrTurn } = await import("@/lib/deployments/replay/replay-or-turn");
      const { attemptL0Replay, markReplaySkillReplayed } = await import(
        "@/lib/deployments/replay/replay-before-llm"
      );
      const { writeWorkflowTrace } = await import("@/lib/deployments/replay/persist");
      const { extractMessageId, extractSender, extractSubject } = await import(
        "@/lib/deployments/composio-event-dispatch"
      );

      // Trigger vars/filter threading — built ONCE from the fired event and
      // passed into attemptL0Replay below, which both fills the skill's
      // {{message_id}}/{{sender}}/{{subject}} vars AND evaluates the
      // enabled skill's trigger_filter against sender/subject.
      const trigger = {
        messageId: extractMessageId(payload ?? {}),
        sender: extractSender(payload ?? {}),
        subject: extractSubject(payload ?? {}),
      };

      return replayOrTurn(
        {
          attemptL0Replay,
          runTurn,
          // Persist ONE agent_workflow_traces row (kind:'replay-run') for
          // any non-skipped attempt (pass OR diverge) — see the design's D
          // section. Best-effort; writeWorkflowTrace itself never throws.
          persistReplayRun: async (replay) => {
            if (replay.kind === "skipped") return;
            await writeWorkflowTrace({
              orgId,
              deploymentId,
              triggerKind: "email",
              triggerKey: extractMessageId(payload ?? {}),
              startedAt: new Date(replay.record.startedAt),
              finishedAt: new Date(replay.record.finishedAt),
              ok: replay.kind === "passed",
              callCount: replay.record.steps.length,
              records: replay.record,
              kind: "replay-run",
              inputTokens: 0,
              outputTokens: 0,
            });
          },
          markSkillReplayed: markReplaySkillReplayed,
        },
        {
          orgId,
          deploymentId,
          orgSlug: org.slug,
          timezone: org.timezone ?? "UTC",
          blueprint,
          trigger,
        },
      );
    },
  };
}
