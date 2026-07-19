// P2.1-T1 — the schedule cron runtime: make an authored *scheduled* agent
// actually fire on its cron.
//
// The agent generator can author an agent whose `blueprint.trigger.kind ===
// "schedule"` (e.g. a weekly social poster on "0 9 * * 1"). Until now nothing
// FIRED it — the only schedule infra was the archetype `scheduled-triggers`
// dispatcher (schedule-dispatcher.ts), which is keyed off a separate
// `scheduled-triggers` table by `archetypeId`, NOT off a deployment's
// `blueprint.trigger`, and whose onFire is a log-only stub. So this is a CLEAN,
// dedicated path (decision recorded in the task report): enumerate ACTIVE
// deployments whose template trigger is a schedule, and replay `runEventAgent`
// for each one that's DUE this tick — reusing the same orchestrator the event-
// agent path uses (it already handles action-only posters, guardrails, verify).
//
// MONEY-SAFE: this module only DECIDES which agents to FIRE and calls
// runEventAgent. runEventAgent's own gates (guardrails / verify / the per-agent
// connection check for a live post) decide whether anything actually goes out —
// the cron never sends/posts directly.
//
// IDEMPOTENT: a per-deployment `lastFiredAt` (stored on the deployment, see
// store.ts) guards against double-firing within one cron window. We fire only
// when the cron is due AND we have NOT already fired inside the current window
// (lastFiredAt older than `now - windowMinutes`). The 15-min window matches the
// cron cadence in vercel.json.
//
// PURE orchestration + DI'd: `list`, `runEventAgent`, and `markFired` are all
// injected, so the loop logic is unit-tested with no Postgres / Twilio / Resend.
// The production wiring (schedule-agents-deps.ts) supplies the DB-backed list +
// the real run-event-agent deps + the markFired writer.
//
// FAIL-SOFT per deployment: one deployment's error (a throwing run or a throwing
// markFired) is swallowed + counted, and the rest still fire. NEVER throws.
//
// No "use server", no top-level I/O imports — safe from a route handler.

import { isCronDueWithin } from "./cron-due";
import type { FiredEvent, RunEventAgentResult } from "./run-event-agent";
import { scrubSecretShapes } from "@/lib/agent-receipts/write";

/** The synthetic event type a scheduled fire replays through runEventAgent. The
 *  orchestrator's findEventAgents resolves the matching scheduled agent for the
 *  org (see schedule-agents-deps.ts), so the type is a stable marker for "a cron
 *  cadence fired" rather than a domain event. */
export const SCHEDULE_FIRED_EVENT = "schedule.fired";

/** An ACTIVE deployment whose template's blueprint trigger is a `schedule`. One
 *  row per fireable scheduled agent. Resolved by `listScheduledAgentDeployments`. */
export type ScheduledAgentDeployment = {
  /** The deployment row id — the markFired target + the loop-memory subject. */
  deploymentId: string;
  /** The org the scheduled agent runs FOR: the provisioned client workspace when
   *  present, else the builder/agency org (the same org runEventAgent grounds in). */
  orgId: string;
  /** A stable key for the agent (the agent template id) — carried for
   *  observability / loop-memory scoping. */
  agentKey: string;
  /** The 5-field cron from `blueprint.trigger.cron`. */
  cron: string;
  /** The IANA timezone the cron's wall-clock is interpreted in (the org's tz). */
  tz: string;
  /** When this deployment last fired its schedule (ISO), or null if never. The
   *  idempotency guard: a fire inside the current window is skipped. */
  lastFiredAt: string | null;
};

/** Injected side-effects for `runDueScheduledAgents`. Every one is DB/Twilio-free
 *  in tests. */
export type RunDueScheduledAgentsDeps = {
  /** Enumerate the ACTIVE scheduled-agent deployments (DB-backed in prod). */
  list: () => Promise<ScheduledAgentDeployment[]>;
  /** Fire one scheduled agent — the SAME orchestrator the event-agent path uses.
   *  In prod this is `runEventAgent(event, buildRunEventAgentDeps(orgId))`; it
   *  already handles action-only posters + the L1/L2/L3 gates. Returns the run
   *  summary (for the cron's audit/log). */
  runEventAgent: (event: FiredEvent) => Promise<RunEventAgentResult>;
  /** Persist this deployment's new `lastFiredAt` (the idempotency stamp). In prod
   *  this writes the deployment's `customization._scheduleLastFiredAt` jsonb (no
   *  migration — see store.ts::markDeploymentScheduleFired). */
  markFired: (deploymentId: string, firedAt: Date) => Promise<void>;
  /** The "already fired this window?" window, in minutes. Defaults to 15 (the
   *  cron cadence). A deployment whose lastFiredAt is newer than `now - window`
   *  is skipped even if the cron is due (it already fired this tick's window). */
  windowMinutes?: number;
  /** Agent receipts slice (Task 2b) — optional DI hook, called once per fire
   *  ATTEMPT (never for a skip), with the outcome of THIS deployment's
   *  runEventAgent call. Default no-op: every existing caller/test is
   *  byte-for-byte unaffected. In prod this is writeRunReceipt
   *  (lib/agent-receipts/write.ts), itself fail-soft — but this hook is ALSO
   *  guarded here (a throw is swallowed) so an injected writer can never
   *  affect the cron loop. */
  writeReceipt?: (args: {
    orgId: string;
    deploymentId: string;
    status: "ok" | "error";
    sourceRef: string;
    summary: string;
  }) => Promise<void>;
};

/** The cron tick's outcome summary (logged by the route; asserted by tests). */
export type RunDueScheduledAgentsResult = {
  /** How many scheduled deployments were enumerated. */
  scanned: number;
  /** How many were DUE this window AND fired (runEventAgent invoked). */
  fired: number;
  /** How many were skipped (not due, OR already fired this window). */
  skipped: number;
  /** How many threw while firing / marking (swallowed; surfaced for observability). */
  errors: number;
};

/** Default idempotency window — matches the every-15-min cron cadence in vercel.json. */
const DEFAULT_WINDOW_MINUTES = 15;

/**
 * True iff `lastFiredAt` falls INSIDE the current window `(now - windowMinutes,
 * now]` — i.e. the deployment already fired this tick's window and must be
 * skipped to stay idempotent. A null/blank/unparseable `lastFiredAt` → false
 * (never fired, or a junk stamp we don't trust → allow the fire). Pure.
 *
 * We compare against `now - window` (exclusive): a stamp exactly `window` minutes
 * old is treated as a PRIOR window (allow), matching `isCronDueWithin`'s inclusive
 * back-edge so the two windows tile without a double-fire or a gap.
 */
export function firedWithinWindow(
  lastFiredAt: string | null | undefined,
  nowMs: number,
  windowMinutes: number,
): boolean {
  if (typeof lastFiredAt !== "string" || lastFiredAt.trim().length === 0) return false;
  const firedMs = Date.parse(lastFiredAt);
  if (!Number.isFinite(firedMs)) return false;
  const windowStart = nowMs - windowMinutes * 60_000;
  return firedMs > windowStart;
}

/**
 * Fire every DUE scheduled-agent deployment. PURE orchestration over the injected
 * deps — NEVER throws.
 *
 * For each enumerated deployment:
 *   1. `isCronDueWithin(cron, now, window, tz)` — is a scheduled hit in this
 *      window? No → skip.
 *   2. `firedWithinWindow(lastFiredAt, now, window)` — did we already fire this
 *      window? Yes → skip (idempotent).
 *   3. else → `await runEventAgent({type: SCHEDULE_FIRED_EVENT, orgId, ...})`,
 *      then `markFired(deploymentId, now)`. Both are guarded: a throw from either
 *      is swallowed + counted in `errors`, and the loop CONTINUES to the next
 *      deployment (one bad agent never starves the rest). A fire that runs but
 *      whose markFired throws is still counted as `fired` (the agent DID run —
 *      the only cost of a missed stamp is a possible re-fire next tick, which the
 *      window guard + runEventAgent's own throttle/guardrails contain).
 */
export async function runDueScheduledAgents(
  nowMs: number,
  deps: RunDueScheduledAgentsDeps,
): Promise<RunDueScheduledAgentsResult> {
  const result: RunDueScheduledAgentsResult = {
    scanned: 0,
    fired: 0,
    skipped: 0,
    errors: 0,
  };

  const window =
    typeof deps.windowMinutes === "number" && Number.isFinite(deps.windowMinutes)
      ? deps.windowMinutes
      : DEFAULT_WINDOW_MINUTES;

  let deployments: ScheduledAgentDeployment[];
  try {
    deployments = await deps.list();
  } catch (err) {
    // Can't enumerate → nothing to do this tick. Surface + bail (never throw).
    console.warn(
      "[schedule-agents] listScheduledAgentDeployments failed:",
      err instanceof Error ? err.message : String(err),
    );
    return result;
  }

  result.scanned = deployments.length;

  for (const d of deployments) {
    // 1. Is the cron due in this window?
    if (!isCronDueWithin(d.cron, nowMs, window, d.tz)) {
      result.skipped += 1;
      continue;
    }
    // 2. Already fired this window? (idempotency)
    if (firedWithinWindow(d.lastFiredAt, nowMs, window)) {
      result.skipped += 1;
      continue;
    }

    // 3. Fire — replay the SAME orchestrator the event path uses. Guarded so one
    //    deployment's failure never stops the rest.
    const firedAt = new Date(nowMs);
    let ran = false;
    try {
      const event: FiredEvent = {
        type: SCHEDULE_FIRED_EVENT,
        orgId: d.orgId,
        // A scheduled agent is NOT 1:1 to a contact — it's a poster/digest. The
        // matching agent (action-only / digest) doesn't need a contact; the
        // findEventAgents seam resolves the agent for the org, not a contact.
        contactId: null,
        payload: {
          deploymentId: d.deploymentId,
          agentKey: d.agentKey,
          cron: d.cron,
          firedAt: firedAt.toISOString(),
        },
      };
      const runResult = await deps.runEventAgent(event);
      ran = true;
      result.fired += 1;
      // Never-lies: a green "ok" badge must never sit next to a summary that
      // says "...failed N" — an aggregate with ANY failures (even mixed with
      // some successes) reports status "error"; the mixed counts stay
      // visible in the summary text (no "partial" status exists).
      await emitReceipt(deps, {
        orgId: d.orgId,
        deploymentId: d.deploymentId,
        status: runResult.failed > 0 ? "error" : "ok",
        sourceRef: firedAt.toISOString(),
        summary: summarizeScheduleFireResult(runResult),
      });
    } catch (err) {
      result.errors += 1;
      console.warn(
        `[schedule-agents] runEventAgent failed for deployment ${d.deploymentId}:`,
        err instanceof Error ? err.message : String(err),
      );
      // Agent truth slice (Task 1) — scrub L-10 credential shapes out of the
      // thrown error's message BEFORE it becomes a receipt summary (a
      // thrown Error can echo back a connection string / key from a lower
      // layer; the receipt is operator-facing and must never carry one).
      await emitReceipt(deps, {
        orgId: d.orgId,
        deploymentId: d.deploymentId,
        status: "error",
        sourceRef: firedAt.toISOString(),
        summary: `failed: ${
          err instanceof Error ? scrubSecretShapes(err.message).slice(0, 120) : "unknown error"
        }`,
      });
      // Do NOT markFired on a hard failure — a transient error should be retried
      // next tick (the agent never ran). Continue to the next deployment.
      continue;
    }

    // Stamp lastFiredAt so the next tick's window guard skips a re-fire. Best-
    // effort: a failed mark is counted but does NOT un-count the fire (the agent
    // ran). Guarded so a mark throw can't break the loop.
    if (ran) {
      try {
        await deps.markFired(d.deploymentId, firedAt);
      } catch (err) {
        result.errors += 1;
        console.warn(
          `[schedule-agents] markFired failed for deployment ${d.deploymentId}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  return result;
}

/**
 * Fold a RunEventAgentResult into a one-line receipt summary — this
 * orchestration level has no per-tool detail (that's inside runEventAgent),
 * so the receipt summarizes the aggregate counts instead. Pure.
 */
export function summarizeScheduleFireResult(result: RunEventAgentResult): string {
  const parts: string[] = [`matched ${result.matched}`];
  if (result.sent) parts.push(`sent ${result.sent}`);
  if (result.actionOnly) parts.push(`action-only ${result.actionOnly}`);
  if (result.scheduled) parts.push(`scheduled ${result.scheduled}`);
  if (result.blocked) parts.push(`blocked ${result.blocked}`);
  if (result.throttled) parts.push(`throttled ${result.throttled}`);
  if (result.failed) parts.push(`failed ${result.failed}`);
  if (result.skipped) parts.push(`skipped ${result.skipped}`);
  return parts.join(", ");
}

/** Fire the optional writeReceipt DI hook — guarded so a throw from an
 *  injected writer can never affect the cron loop (belt-and-suspenders on
 *  top of writeRunReceipt's own fail-soft contract in prod). */
async function emitReceipt(
  deps: RunDueScheduledAgentsDeps,
  args: {
    orgId: string;
    deploymentId: string;
    status: "ok" | "error";
    sourceRef: string;
    summary: string;
  },
): Promise<void> {
  if (!deps.writeReceipt) return;
  try {
    await deps.writeReceipt(args);
  } catch (err) {
    console.warn(
      `[schedule-agents] writeReceipt failed for deployment ${args.deploymentId}:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}
