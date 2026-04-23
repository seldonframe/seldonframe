// Cross-registry validator for block-level ## Subscriptions entries.
//
// Shipped in SLICE 1 PR 1 M3 per tasks/step-subscription-audit.md
// §3.5 + §5.3. The parser (M2) populates
// `composition.subscriptions: SubscriptionEntry[]` on each BLOCK.md.
// Each entry is already shape-validated via SubscriptionEntrySchema
// (M1). This file's job is the CROSS-REGISTRY checks that the
// single-entry Zod schema cannot reach:
//
//   1. G-1 — the bare `<event.name>` from `<block-slug>:<event.name>`
//      must exist in the SeldonEvent registry.
//   2. handler name must resolve to an export on the block's
//      subscriptions module (PR 1 accepts a handlerExports set; PR 2
//      will wire in the actual module-import resolution at
//      install-time).
//   3. G-3 "no silent non-idempotent handlers" — every `{{ref}}` in
//      the idempotency_key template must resolve against either the
//      envelope-reserved names (id / eventType / emittedAt / orgId)
//      or a top-level field on the event's declared data payload.
//      Record<string, unknown> payloads short-circuit — their inner
//      shape is opaque, so we accept `{{data.<any>}}` without a
//      false positive.
//   4. filter predicate parses against the existing PredicateSchema
//      from lib/agents/types.ts (REUSED, NOT extended per the
//      containment principle validated across 2b.2 + 2c + SLICE 1-a).
//
// What this validator does NOT do (deferred to PR 2 runtime):
//   - Install-time active/inactive flipping (G-4): treat subscription
//     as inactive when its event type isn't produced by any installed
//     block. That requires cross-block registry walking which is PR
//     2's install migration.
//   - Auto-flip observability (§7.1.2): runtime concern.
//   - Actual module import to verify handler exports. Authors pass a
//     Set<string> here; PR 2 wires the real loader.

import type { SubscriptionEntry } from "./contract-v2";
import { PredicateSchema } from "../agents/types";

// ---------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------

export type SubscriptionValidationIssueCode =
  | "unknown_event"
  | "unknown_handler"
  | "bad_idempotency_key"
  | "bad_filter_predicate";

export type SubscriptionValidationIssue = {
  code: SubscriptionValidationIssueCode;
  /** 0-based index into the subscriptions array. */
  index: number;
  /** Dotted path within the subscription entry. */
  path: string;
  message: string;
};

/**
 * Runtime-queryable mirror of packages/core/src/events/event-registry.json.
 * Matches the shape in agents/validator.ts EventRegistry (same file
 * backs both) — duplicated structurally so a future refactor can
 * consolidate without cross-module coupling.
 */
export type EventRegistry = {
  events: Array<{
    type: string;
    fields: Record<string, { rawType: string; nullable: boolean }>;
  }>;
};

export type SubscriptionValidationContext = {
  eventRegistry: EventRegistry;
  /**
   * Exported handler names from the block's subscriptions.ts module.
   * Undefined skips handler resolution (PR 1 tests; PR 2 install-
   * time validation always provides it).
   */
  handlerExports?: Set<string>;
};

// ---------------------------------------------------------------------
// Envelope-reserved names. Correspond to `workflow_event_log` columns
// populated for every emitted event regardless of the event's own
// `data` shape — so `{{id}}`, `{{eventType}}`, `{{emittedAt}}`,
// `{{orgId}}` are always valid in an idempotency template.
// ---------------------------------------------------------------------

const ENVELOPE_RESERVED = new Set(["id", "eventType", "emittedAt", "orgId"]);

// ---------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------

export function validateSubscriptions(
  subs: SubscriptionEntry[] | undefined,
  ctx: SubscriptionValidationContext,
): SubscriptionValidationIssue[] {
  const issues: SubscriptionValidationIssue[] = [];
  if (!subs || subs.length === 0) return issues;

  const knownEvents = new Map(ctx.eventRegistry.events.map((e) => [e.type, e]));

  subs.forEach((sub, index) => {
    const bareEvent = stripBlockSlug(sub.event);
    const eventEntry = bareEvent ? knownEvents.get(bareEvent) : undefined;

    if (!eventEntry) {
      issues.push({
        code: "unknown_event",
        index,
        path: "event",
        message: `event "${sub.event}" resolves to bare name "${bareEvent ?? "<unqualified>"}" which is not in the SeldonEvent registry`,
      });
    }

    if (ctx.handlerExports && !ctx.handlerExports.has(sub.handler)) {
      issues.push({
        code: "unknown_handler",
        index,
        path: "handler",
        message: `handler "${sub.handler}" is not exported from the block's subscriptions module`,
      });
    }

    // Idempotency key walk. When the event is unknown we can still
    // catch envelope + unrecognized-root mistakes — we only skip the
    // `data.<field>` field-level walk (requires the event's shape).
    const idempotencyIssue = validateIdempotencyTemplate(
      sub.idempotency_key,
      eventEntry?.fields,
    );
    if (idempotencyIssue) {
      issues.push({
        code: "bad_idempotency_key",
        index,
        path: "idempotency_key",
        message: idempotencyIssue,
      });
    }

    // Filter predicate check — when present, must parse as Predicate.
    if (sub.filter !== undefined) {
      const parsed = PredicateSchema.safeParse(sub.filter);
      if (!parsed.success) {
        issues.push({
          code: "bad_filter_predicate",
          index,
          path: "filter",
          message: `filter does not parse as a valid Predicate: ${parsed.error.issues[0]?.message ?? "unknown parse error"}`,
        });
      }
    }
  });

  return issues;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function stripBlockSlug(fullyQualified: string): string | null {
  // Split on first colon only — audit §3.4 (parser strips the same way).
  const colon = fullyQualified.indexOf(":");
  if (colon === -1) return null;
  return fullyQualified.slice(colon + 1);
}

const INTERPOLATION_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

function validateIdempotencyTemplate(
  template: string,
  eventFields: Record<string, { rawType: string; nullable: boolean }> | undefined,
): string | null {
  INTERPOLATION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INTERPOLATION_RE.exec(template)) !== null) {
    const body = match[1].trim();
    if (!body) continue;
    const segments = body.split(".");
    const [root, ...path] = segments;

    // Envelope-reserved roots (id / eventType / emittedAt / orgId) —
    // always valid, sub-paths not allowed (they're scalars).
    if (ENVELOPE_RESERVED.has(root)) {
      if (path.length > 0) {
        return `idempotency_key "${template}" references envelope field "${root}" with sub-path ".${path.join(".")}" — envelope fields are scalars`;
      }
      continue;
    }

    // `data.<field>` — walk against the event's declared data shape
    // when available. When event is unknown (eventFields undefined),
    // skip the walk: unknown_event already fired on the event path,
    // and we'd rather under-report than false-positive here.
    if (root === "data") {
      if (path.length === 0 || !eventFields) continue;
      const firstSegment = path[0];
      const field = eventFields[firstSegment];
      if (!field) {
        return `idempotency_key "${template}" references data field "${firstSegment}" which is not declared on the event payload (available: [${Object.keys(eventFields).sort().join(", ")}])`;
      }
      // Record<string, unknown> has opaque inner shape — permit any
      // nested path. Typed fields at this layer are shallow; PR 2
      // runtime resolves deeper paths at delivery time.
      continue;
    }

    // Any other root is not recognized.
    return `idempotency_key "${template}" references "${root}" which is not an envelope field (id / eventType / emittedAt / orgId) or event payload field (data.*)`;
  }
  return null;
}
