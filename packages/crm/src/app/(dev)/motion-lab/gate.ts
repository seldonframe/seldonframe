// /motion-lab dev-only gate — Max's single surface to review every vendored
// motion component. Flag pattern mirrors isRecordToAgentOn
// (lib/recordings/policy.ts): strict "1", so a stray "true"/"yes" in Vercel
// can never accidentally open the surface in prod.

export function isMotionLabOn(env: { SF_MOTION_LAB?: string | undefined }): boolean {
  return env.SF_MOTION_LAB === "1";
}
