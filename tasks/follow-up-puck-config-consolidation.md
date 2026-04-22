# Follow-up — Puck config consolidation (deduplicate field definitions)

**Created:** 2026-04-22
**Target landing:** before end of week (by 2026-04-27)
**Estimate:** ~30 minutes
**Priority:** Medium — structural cleanup, not blocking any other work

## Context

On 2026-04-22 the Vercel prod deploys for `crm` had been failing for 14+ hours because `packages/crm/src/lib/puck/config.impl.tsx` uses `useState` / `useEffect` at module top level and was being transitively imported from server-runtime code paths (API routes via `validator.ts` and `generate-with-claude.ts`). Turbopack rejects hooks-in-server-bundle.

The emergency fix (commit `d9a96d76`, merged to main 2026-04-22) broke the import chain by:

1. Marking `config.impl.tsx` as `"use client"`.
2. Creating `packages/crm/src/lib/puck/config-fields.ts` — pure-data mirror of all 32 components' `fields` declarations, no React, safe to import from server-runtime code.
3. Rewiring `validator.ts` and `generate-with-claude.ts` to import `componentFieldRegistry` from `config-fields.ts` instead of `puckConfig` from `config.impl.tsx`.

The emergency fix DUPLICATES the field data across the two files. `config-fields.ts` carries a `*** KEEP IN SYNC WITH packages/crm/src/lib/puck/config.impl.tsx ***` warning. This follow-up removes the duplication.

## Fix

Make `config-fields.ts` the single source of truth for component field definitions. `config.impl.tsx` imports from it and layers React rendering on top.

### Target shape

**`packages/crm/src/lib/puck/config-fields.ts` (unchanged in structure):**

```ts
export const componentFieldRegistry: Record<string, PuckComponentFields> = {
  Hero: { fields: { headline: { type: "text" }, ... } },
  // ...all 32
};
```

**`packages/crm/src/lib/puck/config.impl.tsx` (refactored):**

```ts
"use client";

import { componentFieldRegistry } from "./config-fields";
// ...React + UI imports

export const puckConfig: Config = {
  categories: { /* unchanged */ },
  components: {
    Hero: {
      label: "Hero",
      fields: componentFieldRegistry.Hero.fields,
      defaultProps: { /* unchanged */ },
      render: ({ ... }) => ( /* unchanged JSX */ ),
    },
    Section: {
      label: "Section",
      fields: componentFieldRegistry.Section.fields,
      defaultProps: { /* unchanged */ },
      render: ({ ... }) => ( /* unchanged JSX */ ),
    },
    // ...all 32 refactored the same way
  },
};
```

Every component's inline `fields: { ... }` block gets replaced with `fields: componentFieldRegistry.<name>.fields`. `defaultProps` and `render` stay inline in `config.impl.tsx` — those are client-side concerns.

### Blast radius

**Low.** The shapes read from `componentFieldRegistry` and the shapes of `puckConfig.components[name].fields` are already identical (we verified this when landing the emergency fix — the validator reads the same `{ type, options }` descriptors from both). Consumers:

- `validator.ts` + `generate-with-claude.ts` — already read from `componentFieldRegistry`. **No change needed.**
- `editor/[pageId]/page.tsx` + `puck-page-renderer.tsx` — use `puckConfig` via `config.ts` → `config.impl.tsx`. After refactor, the config still exposes the same `{ label, fields, defaultProps, render }` per component. **No change needed.**

No server/client boundary changes. No new deps. No runtime behavior change.

### Acceptance criteria

1. `config-fields.ts` is the sole source-of-truth for every component's `fields`.
2. `config.impl.tsx` refactored — each component references `componentFieldRegistry.<name>.fields` rather than declaring its fields inline.
3. The `*** KEEP IN SYNC WITH packages/crm/src/lib/puck/config.impl.tsx ***` warning comment at the top of `config-fields.ts` is removed.
4. Green bar:
   - `pnpm test:unit` — 162/162 passing (baseline maintained).
   - `pnpm emit:blocks:check` — no drift.
   - `pnpm emit:event-registry:check` — no drift.
   - Preview deploy on Vercel passes.
   - The Puck editor renders the same 32 components with identical behavior (visual smoke test).

### Non-goals

- Renaming `config-fields.ts` or `componentFieldRegistry` — structurally good as is.
- Changing the field schema or adding new components.
- Touching `defaultProps` or `render` functions.

## Schedule

Target: before end of week (2026-04-27). One ~30-minute sitting. Can land between PR 2 (agent validator) and PR 3 (CRM BLOCK.md migration) of Scope 3 Step 2b.1, or whenever there's capacity — it doesn't gate anything.

## Related

- Emergency fix commit: `d9a96d76` (on `main`).
- Lesson captured: **L-18** in `tasks/lessons.md` — "Server-side imports of client-only modules fail at build time, not dev time."
