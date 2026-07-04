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
