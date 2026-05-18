// Predicate evaluator — runtime evaluator for the `match` predicates
// stored on workflow_waits rows. Used by the sync resume path in
// bus.ts (PR 2 M3) to decide whether an arriving event matches a
// pending wait.
//
// Predicate shape mirrors the `Predicate` primitive from
// lib/agents/types.ts — keep the two in sync. The runtime evaluator
// does NOT import the Zod schema (no parse, no type-check — the
// predicate was already validated at synthesis time, and on wait
// registration the interpolations were resolved per G-4).
//
// Field path convention (matches validator.ts):
//   - Paths starting with `data.X` address the event's data payload.
//   - Other paths are not meaningful at event-arrival time (capture
//     scope was frozen at wait-registration via interpolation
//     resolution, so field refs don't reach into that scope anymore).

type Predicate =
  | { kind: "field_equals"; field: string; value: string | number | boolean }
  | { kind: "field_contains"; field: string; substring: string }
  | { kind: "field_exists"; field: string }
  | { kind: "event_emitted"; eventType: string }
  | { kind: "all"; of: Predicate[] }
  | { kind: "any"; of: Predicate[] };

function readFieldPath(
  eventData: Record<string, unknown>,
  field: string,
): { found: boolean; value: unknown } {
  // Only `data.*` paths dereference into eventData. Anything else is
  // out-of-scope at runtime and reports not-found.
  if (!field.startsWith("data.")) return { found: false, value: undefined };
  const segments = field.slice(5).split(".");
  let current: unknown = eventData;
  for (const seg of segments) {
    if (current && typeof current === "object" && seg in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[seg];
    } else {
      return { found: false, value: undefined };
    }
  }
  return { found: true, value: current };
}

export function evaluatePredicate(
  predicate: Predicate | Record<string, unknown> | null | undefined,
  eventPayload: Record<string, unknown>,
): boolean {
  if (!predicate) return true; // no predicate = unconditional match

  // 2026-05-18 (later) — backwards-compat for the "plain object" shape
  // emitted by the conversation step dispatcher (and any future caller
  // that wants ergonomic key/value predicates without authoring the
  // full {kind: "field_equals", ...} envelope). When the predicate has
  // no `kind`, we treat each top-level entry as a field_equals on the
  // corresponding event payload key.
  //
  // Bug it fixes: conversation step paused on sms.replied with
  // matchPredicate={contactId: "<uuid>"}. The arriving event payload
  // had contactId at the top level, but evaluatePredicate's switch
  // fell through (no matching case), returned undefined, and the
  // resume scan treated that as no-match → the wait NEVER resumed.
  // Speed-to-lead conversations silently never advanced past the
  // qualifier. Visible bug: operator replied "Tuesday 2pm" but the
  // run stayed in "Awaiting reply" forever; some other path (likely
  // the soul-aware chatbot, since the precedence-check also relied
  // on the same wait being detectable) sent a generic "we couldn't
  // find your appointment" reply instead.
  const asRecord = predicate as Record<string, unknown>;
  if (typeof asRecord.kind !== "string") {
    for (const [key, expected] of Object.entries(asRecord)) {
      if (eventPayload[key] !== expected) return false;
    }
    return true;
  }

  const p = predicate as Predicate;
  switch (p.kind) {
    case "field_equals": {
      const { found, value } = readFieldPath(eventPayload, p.field);
      return found && value === p.value;
    }
    case "field_contains": {
      const { found, value } = readFieldPath(eventPayload, p.field);
      return found && typeof value === "string" && value.includes(p.substring);
    }
    case "field_exists": {
      const { found, value } = readFieldPath(eventPayload, p.field);
      return found && value !== undefined && value !== null;
    }
    case "event_emitted":
      // Runtime semantics: this predicate is always true when a matching
      // event reaches the evaluator — the eventType check happens at
      // the wait-lookup stage (findUnresolvedWaitsForEvent filters by
      // type). Included here for completeness so validator-authored
      // predicates composed inside all/any still evaluate.
      return true;
    case "all":
      return p.of.every((child) => evaluatePredicate(child, eventPayload));
    case "any":
      return p.of.some((child) => evaluatePredicate(child, eventPayload));
  }
}
