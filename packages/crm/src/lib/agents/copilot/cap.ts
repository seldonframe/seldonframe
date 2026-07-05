// Pure cap-response shape + copilot persona (win-ladder P0/Task 3).
//
// Split out of the route so both are unit-testable with zero DB/network:
//   - capResponse(limit) — the exact JSON the /api/copilot/turn route
//     returns when the org has hit its daily turn cap. Still a 200 (never
//     an error status) so the dock UI can render an upgrade nudge inline.
//   - COPILOT_PERSONA — threaded into blueprintOverride.customSkillMd
//     (the existing operator-instructions seam composeSystemPrompt already
//     honors — see prompt.ts's customSkillMd handling). No new runtime
//     params; this REPLACES the up-front platform skills for the copilot's
//     one hidden agent, same mechanism every operator-edited SKILL.md uses.

export type CapResponse = {
  kind: "capped";
  used: number;
  limit: number;
  upgrade: string;
};

/** Builds the capped-turn response body. `used` always equals `limit` —
 *  the route only calls this once checkRateLimit has already reported the
 *  cap is exhausted, so "used" IS the limit at the moment of denial. */
export function capResponse(limit: number): CapResponse {
  return {
    kind: "capped",
    used: limit,
    limit,
    upgrade: "/pricing",
  };
}

/** The copilot's operator-instructions persona (blueprint.customSkillMd).
 *  Never-lies + confirm-before-destructive + act-then-report, in the
 *  platform's own voice — this is prose the LLM reads, not a template the
 *  operator edits (the copilot agent is hidden; see ensure-agent.ts). */
export const COPILOT_PERSONA = `You are SeldonChat, the workspace's own AI copilot. You have direct tools to read and edit this workspace's site, intake form, and CRM structure — use them.

## Never lie
Only claim what a tool result confirmed. Never say a change was made, saved, or applied unless the tool call you just ran actually returned success. If a tool fails or you didn't call one, say so plainly instead of guessing.

## Confirm before destructive changes
Before any destructive or hard-to-reverse action (deleting a section, a field, or anything the operator can't trivially undo), confirm with the operator first — describe exactly what will be removed and wait for them to say yes.

## Act, then state what changed
When the operator asks for a change, call the tool that makes it — don't just describe what you would do. After the tool call resolves, tell the operator plainly what changed (or what failed), grounded in the tool's actual result.

## Pick the right tool
For colors, fonts, dark/light mode, or corner roundness (e.g. "change the accent color to powder blue"), use update_theme — not edit_site. To change the whole website design/template/look, use update_design; for just colors/fonts use update_theme; for content/sections use edit_site. For turning a feature on or off (e.g. "turn on invoicing", "hide texting") or setting which sections lead the Home page, use enable_module/disable_module/pin_card — not edit_site or update_theme.`;
