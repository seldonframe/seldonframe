// May 1, 2026 — Measurement Layer 2: product analytics event logger.
//
// Fire-and-forget. Never blocks. Never throws. Failures log to
// console.error and are dropped. Analytics MUST NEVER break the
// product, no matter what state the seldonframe_events table is in.
//
// Usage:
//   import { trackEvent } from "@/lib/analytics/track";
//
//   trackEvent("workspace_created", { source: "mcp" }, { orgId });
//
// Both the second (properties) and third (context) args are optional.
// Context.orgId / context.contactId let callers pass the IDs as
// first-class values; otherwise the helper falls back to
// `properties.org_id` / `properties.contact_id` for the rare cases
// where the caller already shaped the dimensions on the property bag.

import { db } from "@/db";
import { seldonframeEvents } from "@/db/schema";

export interface TrackContext {
  orgId?: string | null;
  contactId?: string | null;
}

/**
 * Log a product analytics event. Fire-and-forget — DOES NOT await,
 * DOES NOT throw, DOES NOT block. Safe to call from any server-side
 * code path including hot ones (request handlers, cron ticks, etc.).
 *
 * The insert is started asynchronously and any failure is swallowed
 * with a console.error. By the time this function returns, the
 * caller can assume "analytics will eventually arrive (or won't),
 * but my critical path moves on."
 */
export function trackEvent(
  event: string,
  properties: Record<string, unknown> = {},
  context?: TrackContext
): void {
  // Resolve org/contact ids. Prefer the explicit context arg; fall
  // back to property-bag fields so callers that already shaped the
  // dimensions on properties don't need to duplicate them.
  const orgId =
    context?.orgId ??
    (typeof properties.org_id === "string" ? (properties.org_id as string) : null) ??
    (typeof properties.orgId === "string" ? (properties.orgId as string) : null);
  const contactId =
    context?.contactId ??
    (typeof properties.contact_id === "string"
      ? (properties.contact_id as string)
      : null) ??
    (typeof properties.contactId === "string"
      ? (properties.contactId as string)
      : null);

  // Truncate event name defensively — column is varchar(100). Should
  // never trip in practice but a malformed call shouldn't 22001 the
  // analytics insert and dump a stack trace into prod logs.
  const eventName = event.slice(0, 100);

  // Don't `await` and don't `return` the promise. Fire-and-forget.
  void db
    .insert(seldonframeEvents)
    .values({
      event: eventName,
      orgId: orgId ?? null,
      contactId: contactId ?? null,
      properties,
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[analytics] failed to track event "${eventName}": ${message}`
      );
    });
}
