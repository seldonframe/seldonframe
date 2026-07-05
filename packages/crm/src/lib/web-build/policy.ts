// Web ungated-build policy — flag + guardrail constants.
// Flag pattern mirrors isTasteFlagOn (taste-policy.ts): strict "1" after trim,
// so a stray "true"/"yes" in Vercel can never accidentally open the surface.

export const WEB_BUILD_RATE_LIMIT = 3;
export const WEB_BUILD_RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** organizations.settings.origin marker for anonymous web builds (no schema column). */
export const WEB_UNGATED_ORIGIN = "web_ungated";

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
  return env.SF_SIMPLE_HOME === "1";
}
