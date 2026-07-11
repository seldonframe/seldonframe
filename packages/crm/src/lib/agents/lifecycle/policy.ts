// Agent lifecycle slice (Learn→Verify→Connect→Run→Sell) — flag policy.
// Mirrors isRecordToAgentOn (lib/recordings/policy.ts): strict "1" only, so a
// stray "true"/"yes" in Vercel can never accidentally open the ladder or the
// marketplace publish gate it wires into.

export function isAgentLifecycleEnabled(env: {
  SF_AGENT_LIFECYCLE?: string | undefined;
}): boolean {
  return env.SF_AGENT_LIFECYCLE === "1";
}
