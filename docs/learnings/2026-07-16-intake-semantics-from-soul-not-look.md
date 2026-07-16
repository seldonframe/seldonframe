# Booking intake questions came from the LOOK, not the business — soul-first classification + creation-time seeding

## The problem, in one line
An HVAC company built via the anonymous /try URL flow showed B2B consulting
booking questions (Company / Your role / Team size / Budget range) instead of
HVAC dispatch questions, because picking the "Technical" visual design set
`theme.aestheticArchetype = "technical-restrained"` and the booking page's
lazy field resolver trusted that theme as an intake-semantics signal.

## The approach
1. **Trace why the lazy resolver ran at all.** The booking template row had
   `metadata.intakeFields: null` — creation-time seeding lived only in
   `enhanceLandingForWorkspace` (packages/crm/src/lib/workspace/enhance-blocks.ts),
   which v1.55.0 removed from the default creation path. Every URL/paste-flow
   workspace therefore resolves fields at render time, forever.
2. **Fix the resolver's trust order (slice A).** In the resolver (extracted to
   packages/crm/src/lib/bookings/resolve-intake-fields.ts), classify from
   BUSINESS signals (`soul.personality_vertical ?? settings.crmPersonality.vertical`
   + emergency/same-day/review/description via `classifyArchetypeFromSoul`)
   BEFORE consulting `theme.aestheticArchetype`. The theme is only a fallback
   when soul/settings carry no meaningful vertical.
3. **Seed at creation so semantics are immune to look switches (slice B).**
   `createFullWorkspace` (create-full.ts step 12.7) now writes
   `metadata.intakeFields` on every booking-template row; stored fields win
   over the lazy resolver, so a later design pick can't change the questions.
   Both the /try URL flow and the paste flow funnel through
   `createFullWorkspace`, so one call site covers both.
4. **Make both paths share ONE classifier.** The independent reviewer caught
   that the first cut of the seeder used raw `classifyArchetype` without the
   resolver's health override — a physio (vertical `"general"`, since health
   niches aren't in the CRM personality registry) would get contractor fields
   seeded PERMANENTLY, unfixable at render time because stored fields win.
   Fix: `classifyIntakeArchetypeFromBusinessSignals` (health override →
   meaningful-vertical classify → null) used by resolver AND seeder.
5. **Testability drove the file layout.** `"use server"` modules may only
   export async functions, so the resolver had to move to its own pure module
   to be unit-testable; the seeder takes injected `templates` +
   `writeTemplateMetadata` callbacks (the `resolveOrgArchetype` pattern) so
   the seed/skip contract tests run without a database. `classifyArchetypeFromSoul`
   moved from db-bound apply-archetype-theme.ts to pure aesthetic-archetypes.ts
   (re-exported for back-compat) so tests don't drag `@/db`.

## Judgment calls
- **`"general"` is treated as NO vertical.** It's the registry default for
  unmatched businesses; letting it trigger soul-first classification would
  short-circuit into the classifier catch-all and defeat the workspace-name/
  appointment-title hint classification (the 2026-05-18 "Roofs by Shiloh"
  fix). Truthy ≠ meaningful.
- **The health override was NOT folded into the vertical classifier.** It runs
  first, on blended hints that now include the personality vertical — because
  health niches classify to the catch-all otherwise (physio matches no
  archetype regex).
- **enhance-blocks' own inline seeding was left untouched** — it's off the
  default path; touching it risked a Kitchen Sink change.
- **Did NOT re-fix the live Flow-Tech row** — it was already hand-patched in
  prod; treated as non-repro by design.
- **Accepted nit:** the pure resolver type-imports `BookingIntakeField` from
  the `"use server"` actions.ts (erased at runtime, harmless); moving the type
  would churn many importers for zero behavior.

## The reusable rule, one line
A visual/design choice must never drive data semantics: classify semantics
from what the business IS (soul/settings), consult the look only when the
business gives no signal — and when two code paths (creation seed + lazy
resolve) must agree, make them call one shared function, or they WILL drift.

Related: docs/learnings + memory "landing-demo-trades-design-merge" (design
picker = SURFACE-not-build), the step-0 health override comment in
resolve-intake-fields.ts, memory "worktree-typecheck-method" (junction ritual).
