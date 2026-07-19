// Web ungated-build policy — flag + guardrail constants.
// Flag pattern mirrors isTasteFlagOn (taste-policy.ts): strict "1" after trim,
// so a stray "true"/"yes" in Vercel can never accidentally open the surface.

export const WEB_BUILD_RATE_LIMIT = 3;
export const WEB_BUILD_RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** organizations.settings.origin marker for anonymous web builds (no schema column). */
export const WEB_UNGATED_ORIGIN = "web_ungated";

/**
 * Task 8: unclaimed anonymous web-build workspaces (created via the /try
 * paste-box flow, no owner attached yet) stay out of the search index until
 * claimed via signup. Claimed workspaces and every non-web-build workspace
 * keep the existing indexable behavior. Shared by the /w and /s public
 * routes so subdomain metadata can never drift from the /w rule again.
 */
export function shouldIndexWorkspace(
  ownerId: string | null,
  settings: Record<string, unknown>,
): boolean {
  return !(ownerId === null && settings["origin"] === WEB_UNGATED_ORIGIN);
}

export function isWebUngatedBuildOn(env: {
  SF_WEB_UNGATED_BUILD?: string | undefined;
}): boolean {
  return env.SF_WEB_UNGATED_BUILD?.trim() === "1";
}

/**
 * Per-IP daily build cap, env-overridable (2026-07-04): `SF_WEB_BUILD_RATE_LIMIT`
 * lets ops raise/lower the cap (e.g. founder testing bursts) without a code
 * change — a redeploy picks up the new value. Falls back to the compiled
 * WEB_BUILD_RATE_LIMIT (3) on absent/invalid/non-positive values, so a typo'd
 * env can never open an unlimited lane.
 */
export function resolveWebBuildRateLimit(env: {
  SF_WEB_BUILD_RATE_LIMIT?: string | undefined;
}): number {
  const raw = env.SF_WEB_BUILD_RATE_LIMIT?.trim();
  if (!raw) return WEB_BUILD_RATE_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || String(parsed) !== raw) {
    return WEB_BUILD_RATE_LIMIT;
  }
  return parsed;
}

/** Win-ladder + SeldonChat dock flag (2026-07-04). Same strict-"1" contract as
 *  isWebUngatedBuildOn: anything else keeps the surfaces dark. */
export function isWinLadderOn(env: { SF_WIN_LADDER?: string | undefined }): boolean {
  return env.SF_WIN_LADDER?.trim() === "1";
}

/** Simple-home module registry flag (2026-07-05). Same strict-"1" contract as
 *  isWinLadderOn: anything else keeps the simplified surface dark. */
export function isSimpleHomeOn(env: { SF_SIMPLE_HOME?: string | undefined }): boolean {
  return env.SF_SIMPLE_HOME?.trim() === "1";
}

/** Vision-verify product feature flag (Track B P1, 2026-07-05): after a
 *  SeldonChat edit that changes the public site, screenshot the preview +
 *  grade it with an independent vision pass before the copilot says "done".
 *  Same strict-"1" contract as the flags above — inert until flipped, and
 *  fail-soft even when on (see lib/vision/verify-page.ts). */
export function isVisionVerifyOn(env: { SF_VISION_VERIFY?: string | undefined }): boolean {
  return env.SF_VISION_VERIFY?.trim() === "1";
}

/** Autopay console flag (2026-07-08): gates the agency billing/retainer
 *  editor, the client-portal Billing section, and the revenue strip. Task 1
 *  (cycle recording) is NOT gated by this — it's additive + idempotent and
 *  ships live-on-merge. Same strict-"1" contract as the flags above. */
export function isAutopayConsoleOn(env: { SF_AUTOPAY_CONSOLE?: string | undefined }): boolean {
  return env.SF_AUTOPAY_CONSOLE?.trim() === "1";
}

/** Deterministic replay — Reelier phase 2c, slice 1 (2026-07-17): OBSERVE MODE
 *  ONLY. When on, the email-triggered deployed-agent turn (composio-event-
 *  dispatch.ts) records its tool-call sequence into `agent_workflow_traces`
 *  in the Reelier trace-record format (lib/deployments/replay/trace-format.ts)
 *  — no replay, no LLM change, no behavior change for users. Same strict-"1"
 *  contract as the flags above: dark by default, a stray "true"/"yes" in
 *  Vercel can never accidentally turn recording on. */
export function isDeterministicReplayOn(env: {
  SF_DETERMINISTIC_REPLAY?: string | undefined;
}): boolean {
  return env.SF_DETERMINISTIC_REPLAY?.trim() === "1";
}

/** Replay gate v2 — idempotent-send (2026-07-18,
 *  docs/superpowers/plans/2026-07-18-replay-gate-v2-spec.md). Separate flag
 *  from SF_DETERMINISTIC_REPLAY by design (spec §1): turning this on alone
 *  does nothing — a skill must ALSO carry a valid idempotency config
 *  (replay_skills.idempotency, set via `replay-ops.ts set-idempotency`)
 *  before lib/deployments/replay/replay-before-llm.ts's v2 branch ever
 *  activates for it. Same strict-"1" contract as every other flag here:
 *  dark by default. When off (or a skill has no idempotency config), replay
 *  behavior is BYTE-IDENTICAL to v1 — see gate-v2.ts's module header. */
export function isReplayGateV2On(env: { SF_REPLAY_GATE_V2?: string | undefined }): boolean {
  return env.SF_REPLAY_GATE_V2?.trim() === "1";
}
