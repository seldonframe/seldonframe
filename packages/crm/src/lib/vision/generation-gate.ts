// lib/vision/generation-gate.ts — Track B P2 (vision-verify on SITE
// GENERATION, not just post-edit). Reuses the P1 engine
// (lib/vision/verify-page.ts) verbatim: same visionVerifyPage race/timeout/
// try-catch shape, same buildVisionCheckLog + logEvent observability
// convention. This module only adds the GENERATION-specific goal/rubric +
// a pure on/off predicate — no new render/grade/parse logic.
//
// FAIL-SOFT IS ABSOLUTE, same as P1: generation is the money path (the
// moment the builder sees "your site is ready"). A vision hiccup — render
// timeout, grader error, malformed output — must NEVER delay or fail the
// generation flow. See run-create-from-url.ts for the call site: the whole
// check is wrapped in its own try/catch + a 10s race-timeout fallback, and
// `visionCheck` is only attached to the `done` SSE payload when the check
// actually produced a result.

/** Pure on/off predicate — mirrors shouldVisionVerify's flag-gate half.
 *  Generation has no "did an edit happen" condition (a fresh site always
 *  just got generated), so this is simply the flag value, exposed as its
 *  own named predicate so the call site reads as an explicit gate rather
 *  than an inline `if (isVisionVerifyOn(...))`. */
export function shouldGenerationVerify(flagOn: boolean): boolean {
  return flagOn;
}

/** Pure prompt-goal builder for the generation-time vision check. Kept pure
 *  and DI-free (no network, no Date.now()) so it's trivially unit-testable. */
export function buildGenerationVisionGoal(businessName: string): string {
  const name = businessName?.trim() || "the business";
  return `Verify the generated local-service website for "${name}" rendered correctly`;
}

/** Generation-specific rubric — broader than the post-edit SITE_RUBRIC
 *  (copilot/turn/route.ts) because a first-render has more ways to fail:
 *  a missing hero, a duplicated nav item (the real bug vision-verify caught
 *  in dev — see memory/vision-verify.md), or an empty services section. */
export const GENERATION_RUBRIC =
  "The hero section renders with a clear headline and a visible call-to-action button. " +
  "The navigation bar lists each item exactly once — no duplicate nav entries. " +
  "The services/sections area is present and not empty. " +
  "No broken or missing images. " +
  "All text is legible (no low-contrast or overlapping text). " +
  "The business name appears somewhere on the page. " +
  "Nothing overflows or breaks the viewport layout.";
