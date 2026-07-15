// packages/crm/src/lib/landing/apply-live-archetype.ts
//
// 2026-07-15 — LIVE ARCHETYPE AT THE SOURCE
//
// The archetype id is denormalized into MANY payload fields at R1
// generation time (top-level `archetype`, `hero.archetype`, and a per-section
// `archetype` on every section object — ServicesGrid, Testimonials, FAQ,
// Footer, sticky-nav, servicePages[].sections[], etc.). When the operator
// switches the design via the picker, only `organizations.theme
// .aestheticArchetype` is updated — the frozen payload fields are never
// touched, so a design switch silently re-skins nothing (or, pre-fix, only
// the one field a single render site happened to override locally).
//
// Fix: normalize ALL of them, once, at the loader (see r1-save.ts) via this
// pure deep-walk helper, so every render site (current and future) inherits
// the live theme uniformly instead of drifting field-by-field.
//
// This module is deliberately dependency-free (no db, no React) so it stays
// trivially unit-testable and reusable from any consumer of the payload.

import { ARCHETYPES } from "@/lib/workspace/aesthetic-archetypes";

/**
 * Deep-walks a plain-JSON payload (objects/arrays only — no class instances,
 * Dates, Maps, etc., which the R1 payload never contains) and returns a NEW
 * object where every property literally named `archetype` whose current
 * string value is a valid key of `ARCHETYPES` has been replaced with `live`.
 *
 * - Non-`archetype` keys are left untouched, even when their value happens
 *   to look like an archetype id.
 * - `archetype` values that are NOT a recognized archetype id (unknown /
 *   stale strings) are left untouched — we only ever replace known ids.
 * - The input is not mutated; a structurally new object is returned.
 */
export function applyLiveArchetype<T>(payload: T, live: string): T {
  return walk(payload, live) as T;
}

function walk(value: unknown, live: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => walk(item, live));
  }

  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (key === "archetype" && typeof val === "string" && val in ARCHETYPES) {
        out[key] = live;
      } else {
        out[key] = walk(val, live);
      }
    }
    return out;
  }

  return value;
}
