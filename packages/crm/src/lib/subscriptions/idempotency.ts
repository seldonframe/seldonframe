// resolveIdempotencyTemplate — delivery-time template resolver.
//
// Shipped in SLICE 1 PR 2 Commit 2 per tasks/step-subscription-audit.md
// §5.1. At delivery time (and enqueue time, post-2026-04-22 design —
// filter evaluates synchronously so key resolution is trivially cheap
// at emit path), the runtime expands the author's template by
// replacing `{{ref}}` tokens with values from:
//
//   - Envelope-reserved names (G-3 default + composite fallback):
//       id         → event log row id
//       eventType  → the event's type string
//       emittedAt  → ISO timestamp of emission
//       orgId      → workspace id
//   - Payload fields: `{{data.<path>}}` walks the dotted path
//     against the event's data payload. Nested lookup supported
//     (e.g., `{{data.inner.key}}` → payload.inner.key).
//
// Missing payload fields render as the literal `{{placeholder}}`
// token. This is defensive: at delivery time the parser-side
// validator already refused subscriptions whose idempotency template
// references unknown fields (M3 validator). A missing field here
// means the event's actual payload disagrees with its declared
// shape — the literal placeholder preserves deterministic dedup
// (same event replays produce same literal) without crashing.

export type EventEnvelope = {
  id: string;
  eventType: string;
  emittedAt: string;
  orgId: string;
};

const INTERPOLATION_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

export function resolveIdempotencyTemplate(
  template: string,
  payload: Record<string, unknown>,
  envelope: EventEnvelope,
): string {
  return template.replace(INTERPOLATION_RE, (raw, inner) => {
    const body = String(inner).trim();
    if (!body) return raw;
    const segments = body.split(".");
    const [root, ...path] = segments;

    // Envelope-reserved names — direct field lookup.
    if (root === "id") return envelope.id;
    if (root === "eventType") return envelope.eventType;
    if (root === "emittedAt") return envelope.emittedAt;
    if (root === "orgId") return envelope.orgId;

    // data.<path> — walk the payload.
    if (root === "data") {
      if (path.length === 0) {
        // `{{data}}` alone — render as JSON. Authors rarely want this
        // but it's deterministic.
        return JSON.stringify(payload);
      }
      const value = walkPath(payload, path);
      if (value === undefined) return raw; // defensive — literal on missing
      return String(value);
    }

    // Unknown root — render as literal. M3 validator already
    // rejected these at parse time, so reaching here means the
    // BLOCK.md changed shape after install (possible but rare).
    return raw;
  });
}

function walkPath(obj: unknown, path: string[]): unknown {
  let current: unknown = obj;
  for (const segment of path) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
