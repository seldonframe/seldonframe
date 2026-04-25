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
  predicate: Predicate | null | undefined,
  eventPayload: Record<string, unknown>,
): boolean {
  if (!predicate) return true; // no predicate = unconditional match

  switch (predicate.kind) {
    case "field_equals": {
      const { found, value } = readFieldPath(eventPayload, predicate.field);
      return found && value === predicate.value;
    }
    case "field_contains": {
      const { found, value } = readFieldPath(eventPayload, predicate.field);
      return found && typeof value === "string" && value.includes(predicate.substring);
    }
    case "field_exists": {
      const { found, value } = readFieldPath(eventPayload, predicate.field);
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
      return predicate.of.every((child) => evaluatePredicate(child, eventPayload));
    case "any":
      return predicate.of.some((child) => evaluatePredicate(child, eventPayload));
  }
}
