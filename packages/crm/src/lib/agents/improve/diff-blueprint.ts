// Improve verb + trust rail (2026-07-02) — Task 12: the field-diff helper
// backing the Studio improve panel.
//
// `diffBlueprintFields` is a PURE, string-serializing diff between the
// agent's CURRENT blueprint and a proposed PATCH (`Partial<AgentBlueprint>`
// — never the full blueprint, per the plan's propose-only posture). It never
// reads or writes anything — the panel calls it client-side over the plain
// JSON `{ before, patch }` values already present in the run/proposal result,
// no server round-trip needed.
//
// Rules (brief's interface + TDD spec, diff-blueprint.spec.ts):
//   - iterate ONLY the patch's own keys (`Object.keys(after)`) — a field the
//     patch doesn't touch never appears, even if the current blueprint has
//     it and even if it "conceptually" differs from some baseline;
//   - a patch field whose value is deep-equal to the current value is
//     OMITTED — unchanged fields don't clutter the diff (the panel's
//     `<h2>Proposed changes</h2>` list should show only what actually moves);
//   - primitives (string/boolean/number) render as their plain string form
//     (`String(value)`), never JSON-quoted, so a greeting reads as the
//     greeting text, not `"the greeting text"`;
//   - arrays/objects are JSON.stringify'd with NO indentation (compact,
//     single-line) so the panel can render each row as one line;
//   - a missing/undefined `before` value (the patch adds a field the
//     blueprint never had) renders as an empty string, not the literal
//     "undefined" — an empty before-cell reads naturally as "(none)" in the
//     panel's copy.
//
// NOT "use server": a plain pure function, imported directly by the client
// island (improve-panel.tsx) — no server round-trip needed for a pure diff.

import type { AgentBlueprint } from "@/db/schema/agents";

export type BlueprintFieldDiff = {
  field: string;
  before: string;
  after: string;
};

/** Deep structural equality via JSON serialization — sufficient here since
 *  every AgentBlueprint field is plain JSON-shaped data (no functions, no
 *  Dates, no cyclic refs); key ORDER differences would false-negative this,
 *  but both sides originate from the same shape (current blueprint vs. a
 *  patch produced by proposePatch/applyImproveProposal's own merge), so this
 *  never happens in practice. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Render one field's value as a compact, human-scannable string. `undefined`
 *  → empty string (a field that's simply absent). Primitives print plain
 *  (no JSON quoting); arrays/objects print as compact single-line JSON. */
function serializeFieldValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * PURE. Diffs a proposed blueprint PATCH against the agent's current
 * blueprint, field by field, for exactly the fields the patch touches.
 * Returns one row per CHANGED field only (deep-equal fields are omitted).
 * Never mutates either input.
 */
export function diffBlueprintFields(
  before: AgentBlueprint,
  after: Partial<AgentBlueprint>,
): BlueprintFieldDiff[] {
  const diffs: BlueprintFieldDiff[] = [];

  for (const field of Object.keys(after) as Array<keyof AgentBlueprint>) {
    const beforeValue = before[field];
    const afterValue = after[field];

    if (deepEqual(beforeValue, afterValue)) continue;

    diffs.push({
      field,
      before: serializeFieldValue(beforeValue),
      after: serializeFieldValue(afterValue),
    });
  }

  return diffs;
}
