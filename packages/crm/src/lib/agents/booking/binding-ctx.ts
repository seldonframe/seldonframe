// Pure mapper: a deployment's runtime CalendarBinding → the `ctx.booking` slice
// the booking tools read. Lives in a PLAIN module (NOT runtime.ts) because
// runtime.ts is "use server" — where Turbopack's `next build` rejects any
// non-async export ("Server Actions must be async functions"), even though
// check-use-server.sh doesn't flag it. Both runtime.ts and its spec import this.

import type { CalendarBinding } from "@/lib/agents/booking/calendar-backend";
import type { ToolExecuteContext } from "@/lib/agents/tools";

/** The legacy `mode` field is the handoff selector and just needs a valid
 *  BookingMode: `external_link` for the link-handoff binding, otherwise `native`
 *  (book_external still routes through the seam via `binding`, NOT this mode).
 *  `binding` is what the CalendarBackend seam reads. Returns undefined for no
 *  binding so `ctx.booking` stays undefined for workspace/operator agents (the
 *  byte-for-byte native default). */
export function bindingToCtxBooking(
  binding: CalendarBinding | undefined,
): ToolExecuteContext["booking"] {
  if (!binding) return undefined;
  return {
    mode: binding.mode === "external_link" ? "external_link" : "native",
    externalUrl: binding.externalUrl ?? null,
    binding,
  };
}
