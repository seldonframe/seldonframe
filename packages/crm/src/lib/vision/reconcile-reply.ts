// lib/vision/reconcile-reply.ts — SeldonChat never-lies fix, Layer 2
// (docs/superpowers/specs/2026-07-06-seldonchat-never-lies-fix.md).
//
// The copilot's assistantMessage ("Done ✅") is generated BEFORE the vision
// check runs, so it can be truthfully wrong: the model said "done" because
// the tool call reported ok:true, but the independent vision pass then finds
// the change never actually landed on the live page. This function is the
// last-mile honesty gate: it rewrites the reply to the truth ONLY when the
// vision check is a genuine, completed failure.
//
// FAIL-SOFT IS ABSOLUTE — this must never turn a real "Done" into a false
// "that didn't work":
//   - no visionCheck at all (didn't fire / errored before assembly) → unchanged
//   - visionCheck.skipped (timeout, render_failed, or any future skip reason)
//     → unchanged, even if it happens to carry a pass:false shape
//   - visionCheck.pass === true → unchanged
//   - visionCheck.gaps.length === 0 → unchanged (nothing concrete to report)
// Only a completed, non-skipped pass:false WITH at least one gap may alter
// the reply.

export type VisionCheckResult = {
  pass: boolean;
  gaps: string[];
  skipped?: string;
};

export type ReconcileResult = {
  text: string;
  corrected: boolean;
};

/**
 * Reconciles the copilot's assistant reply against the vision-verify result.
 * Pure function, no I/O — see fail-soft contract above.
 */
export function reconcileReplyWithVision(
  replyText: string,
  visionCheck: VisionCheckResult | undefined,
): ReconcileResult {
  if (!visionCheck) {
    return { text: replyText, corrected: false };
  }
  if (visionCheck.skipped) {
    return { text: replyText, corrected: false };
  }
  if (visionCheck.pass === true) {
    return { text: replyText, corrected: false };
  }
  if (!visionCheck.gaps || visionCheck.gaps.length === 0) {
    return { text: replyText, corrected: false };
  }

  const honest =
    `That didn't fully land yet — the visual check shows: ${visionCheck.gaps.join("; ")}. ` +
    "Let me try that a different way.";

  return { text: honest, corrected: true };
}
