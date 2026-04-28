/**
 * Template loader / matcher.
 *
 * Phase 3 plumbing: given a workspace creation request, pick the right
 * starter blueprint (HVAC, dental, …) and customize the workspace-level
 * fields (name, industry slug, phone, address, etc.) before persisting.
 *
 * Templates live in `skills/templates/<industry>.json` at the repo root.
 * They're imported as JSON modules; Next.js + Node 24 both handle this.
 *
 * The set of available templates is hardcoded here rather than scanned
 * from disk — keeps the resolution deterministic and avoids surprises
 * if a new file lands in skills/templates/ that isn't yet wired in.
 */

import type { Blueprint } from "./types";

import generalTemplate from "../../../../../skills/templates/general.json";
import hvacTemplate from "../../../../../skills/templates/hvac.json";

// Add new vertical packs here once they ship + pass `pnpm template:validate`.
//
// JSON imports widen tuple types like `[9, 17]` to `number[]`, which doesn't
// satisfy `DayHourRange = [number, number] | null`. The `as unknown as`
// double-cast is safe because:
//   1. Each template is validated against schema.json at build time
//      (pnpm template:validate, gated in CI per Phase 3 C1).
//   2. The schema's WeeklyHours definition forbids any other tuple shape.
// If validation passes, the runtime shape matches Blueprint; the cast just
// silences TS's inability to narrow JSON-imported numeric arrays.
const TEMPLATES: Record<string, Blueprint> = {
  general: generalTemplate as unknown as Blueprint,
  hvac: hvacTemplate as unknown as Blueprint,
};

/**
 * Picks a starter blueprint based on the workspace's `industry`. Falls
 * back to the general template if no match. Always returns a deep clone
 * so callers can safely mutate before persisting.
 */
export function pickTemplate(industry: string | null | undefined): Blueprint {
  const key = (industry ?? "general").toLowerCase().trim();
  const match = TEMPLATES[key] ?? TEMPLATES.general;
  // Structured clone — JSON round-trip is fine since blueprints are pure data.
  return JSON.parse(JSON.stringify(match)) as Blueprint;
}

/**
 * Returns the list of industries currently wired up. Useful for CLI help
 * messages and (future) operator-facing template picker UIs.
 */
export function listTemplateIndustries(): string[] {
  return Object.keys(TEMPLATES).sort();
}
