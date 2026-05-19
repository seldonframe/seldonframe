// AdminRunContext — the full RunContext shape, used only by the
// dashboard render pipeline. Importing this from a customer-facing
// file is a lint signal that something is wrong (the agency field
// should not reach customer surfaces).
import type { RunContext } from "./run-context";

export type AdminRunContext = RunContext;

/**
 * Defensive accessor for the admin surface. Currently a passthrough,
 * but kept as a function so future enforcement (e.g. throw if called
 * from the wrong code path via stack inspection in dev) has a hook.
 */
export function getRunContextAdminOnly(rc: RunContext): AdminRunContext {
  return rc;
}
