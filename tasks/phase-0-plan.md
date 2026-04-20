# Phase 0 — Substrate Implementation Plan

**Scope:** 4 discrete slices preparing the CSS/component substrate for Phase 1 (CRM polish) and later phases (Booking/Intake rewrites).
**Date:** 2026-04-20
**Status:** Plan mode — awaiting approval before slice 0a.
**Budget:** Days 1-2 of 11-day sprint to May 1 ship.

Facts verified against the worktree before writing each slice (imports greped by name, hand-rolled drawers greped by `fixed inset-0`, token wiring read from `globals.css` @theme inline block).

---

## Slice 0a — Unify color tokens to oklch

### Goal
Eliminate the mixed-format color system. Every token becomes oklch; every `hsl(var(--<token>))` wrapper becomes either `var(--<token>)` (raw CSS) or the Tailwind alias (`bg-<token>`, `text-<token>`).

### What we know (verified)
- `packages/crm/src/app/globals.css` lines 9-45 wire tokens to Tailwind v4's `@theme inline`: `--color-primary: var(--primary)`. When `--primary: 166 72% 40%` (hsl-triplet), `var(--color-primary)` resolves to the raw triplet string, which is **not** a valid CSS color on its own.
- 51 occurrences of `hsl(var(--<hsl-triplet-token>))` remain across the codebase. These are currently valid because `hsl()` wraps the triplet into a real color.
- Tokens that need conversion (hsl-triplet → oklch):
  - `--primary`, `--primary-foreground`
  - `--accent`, `--accent-foreground`
  - `--ring`
  - `--positive`, `--caution`, `--negative`
  - `--chart-1..5`
  - `--sidebar-primary`, `--sidebar-primary-foreground`
  - `--sidebar-accent`, `--sidebar-accent-foreground`
  - Both `:root` and `.dark` scope — 14 tokens × 2 themes = ~28 values to compute.

### Files touched
**Edit:**
- `packages/crm/src/styles/design-tokens.css` — convert 28 token values
- **~51 occurrences** of `hsl(var(--<hsl-triplet>)...)` across the codebase — same codemod pattern as the 217-replacement fix shipped in `cd2258f3`. Spans landing sections, marketplace pages, recharts widgets, a few surface components. Exact file list via `grep -rE "hsl\(var\(--(primary|accent|ring|positive|caution|negative|chart-|sidebar-(primary|accent))"` at run time.

**Create (throwaway):**
- `scripts/fix-hsl-triplet-to-oklch.mjs` — mirrors the codemod I wrote today for oklch tokens (`fix-hsl-oklch.mjs`, deleted post-use). Dry-run + `--write` modes. Deleted after slice lands.

### Verification steps (in execution order)
1. **Pre-work spike** (~10 min) — verify whether `bg-primary` *currently* renders correctly despite the broken `--color-primary` wiring. Three hypotheses:
   - (a) `bg-primary` is silently broken too, but no one noticed because hand-rolled `.crm-button-primary` class covers the button case with its own color. Grep for `bg-primary`, `text-accent`, etc. to see what would break.
   - (b) Tailwind v4's `@theme inline` auto-wraps non-color-function values (unlikely, but check the generated CSS).
   - (c) The classes resolve to `background-color: 166 72% 40%`, which is invalid, but the inherited/cascade color is still rendering something acceptable.
   - **This spike determines the actual scope of this slice.** If (a), we've been living with another invisible bug and this slice fixes more than 51 occurrences.
2. Convert hsl-triplet values using oklch converter. Use https://oklch.com for exact conversion. Record each old-value → new-value in a comment in the commit.
3. Write codemod script targeting only hsl-triplet tokens (exactly mirrors the shape of today's already-deleted script).
4. Dry-run codemod → expect ≈51 replacements. Review per-token counts.
5. Apply codemod with `--write`.
6. `pnpm --filter @seldonframe/crm build` — expect green.
7. Manual spot-checks listed below.

### Blast radius (what might visually regress)
| Surface | Risk | Why |
|---|---|---|
| **Landing sections** (hero, features, testimonials, pricing, etc. — 13 files with heavy `--primary`/`--accent`/`--chart-*` usage) | **High** | Marketing gradients use these tokens most densely. Any oklch conversion that shifts hue even slightly changes the brand feel. |
| **Recharts widgets** (MRR, trend, revenue) | **High** | Chart line colors use `hsl(var(--primary))`. If tokens drift, chart colors drift. |
| **Button primary states** | **Medium** | `.crm-button-primary` in `overrides.css` uses `var(--primary)` (triplet) — need to update that class too, not just the token value. |
| **Focus rings** | **Low** | `--ring` is used for focus-visible. Subtle but user-noticeable. |
| **Stage badges on dashboard** (`stageBadgeClass` in dashboard/page.tsx — uses raw `border-[hsl(220_70%_55%_/_0.2)]` triplet literals, not token refs) | **Zero** | Literal triplets unchanged. |
| **CRM engine** | **Low** | Uses Tailwind aliases, few hsl-wrapped refs. |

### Validation (spot-check pages)
After `pnpm build` is green, visually spot-check these pages on a local `pnpm dev` or Vercel preview before marking done:
- `/` (landing — most dense token usage)
- `/pricing`
- `/dashboard` (stats cards, MRR chart, trend chart)
- `/deals/pipeline` (kanban stage badges + accent colors)
- `/login` + `/signup` (primary buttons, focus rings)
- `/marketplace` (cards, badges)
- Stripe Connect button in `/settings/billing` (uses `--positive`)

Screenshot these before/after; compare for brand drift.

### Estimated duration
**90-120 min** — the pre-work spike could change this. If spike reveals scope (a) (broader silent bug), add 30-60 min.

### Rollback plan
- Single commit. If any brand-critical color drifts noticeably: `git revert <sha>`, push. Zero-downtime — the hsl-triplet format works fine (it's just inconsistent with oklch, not broken).
- If only one token drifts: cherry-pick the conversion fix for that token, leave others.

### Risk mitigation
- **Precision conversion**: use oklch converter from the hsl triplet's hex equivalent. Record both values in the commit comment so future hand-tuning knows what the original was.
- **No approximation**: don't hand-roll "eyeballed" oklch values. Use a converter.

---

## Slice 0b — Delete orphaned legacy components

### Goal
Remove dead code that confuses future readers and inflates search results. Zero behavior change.

### What we know (verified — imports greped by component name)
| File | LOC | Import count | Status |
|---|---|---|---|
| `packages/crm/src/components/deals/kanban-board.tsx` | 197 | **0** | ✅ Orphaned — safe to delete |
| `packages/crm/src/components/contacts/contacts-inline-table.tsx` | 155 | **0** | ✅ Orphaned — safe to delete |
| `packages/crm/src/components/contacts/create-contact-form.tsx` | ~60 | **0** | ✅ Orphaned — safe to delete |
| `packages/crm/src/components/contacts/create-contact-page-form.tsx` | ~80 | 1 (by `/contacts/new/page.tsx`) | ❌ **Keep** — actively used |
| `packages/crm/src/components/contacts/contacts-page-actions.tsx` | 103 | 1 (by `/contacts/page.tsx`) | ❌ **Keep** — actively used |
| `packages/crm/src/components/contacts/csv-import.tsx` | ? | 1 (by `/contacts/page.tsx`) | ❌ **Keep** — actively used |
| `packages/crm/src/components/deals/create-deal-form.tsx` | ? | 1 (by `/deals/pipeline/page.tsx`) | ❌ **Keep** — actively used |

Total LOC removed: **~412 lines**.

### Files touched
**Delete:**
- `packages/crm/src/components/deals/kanban-board.tsx`
- `packages/crm/src/components/contacts/contacts-inline-table.tsx`
- `packages/crm/src/components/contacts/create-contact-form.tsx`

**Edit:** None.

### Verification steps (in execution order)
1. Re-verify zero imports at execution time (in case a slice 0a side-effect added a reference — unlikely but cheap to check): `grep -rn "KanbanBoard\|ContactsInlineTable\|CreateContactForm[^P]" packages/crm/src` (the `[^P]` avoids matching `CreateContactPageForm`).
2. Delete the 3 files.
3. `pnpm --filter @seldonframe/crm build` — any surviving transitive import breaks the build. Build failure here = my import check missed something; investigate before retrying.
4. Grep the new diff for any references to the deleted names: should find zero.

### Blast radius
| Risk | Why |
|---|---|
| **Build break from a missed import** | Caught immediately by `pnpm build`. Trivial to fix or revert. |
| **Framer-motion bundle size drop** | Positive — `kanban-board.tsx` was the only direct importer of `motion/framer-motion` in the deals surface. Removes ~30KB from that page's bundle after tree-shake. |
| **No visual regression expected** | All 3 files are unmounted. |

### Validation (spot-check pages)
After `pnpm build` green:
- `/contacts` renders with the engine (`TableView`)
- `/contacts/new` still renders the create form
- `/contacts` CSV import banner still works
- `/deals/pipeline` kanban still drag-drops (confirms we deleted the orphaned one, not the in-use engine version)

### Estimated duration
**15-20 min**.

### Rollback plan
- `git revert <sha>`. Files return. Zero user-visible effect either way.

---

## Slice 0c — Install missing shadcn primitives

### Goal
Install the Radix-backed primitives Phase 1+ will depend on. Purely additive — nothing uses them until Phase 1 starts importing them.

### What we know (verified)
Currently installed in `packages/crm/src/components/ui/`: `accordion, animated-list, badge, bento-grid, border-beam, button, card, checkbox, dock, input, label, marquee, number-ticker, particles, select, separator, sheet, shimmer-button, square-primitives, textarea, typing-animation`.

**Missing for Phase 1+:**
- `dialog` — used by detail drawers and confirmation modals (replaces hand-rolled patterns)
- `dropdown-menu` — used by per-row action menus in CRM tables
- `tooltip` — hover hints on icon buttons
- `popover` — filter pop-outs, relation hovers
- `table` — shadcn's semantic table (replaces hand-rolled in contacts/deals)
- `tabs` — admin page sub-navigation
- `avatar` — contact/assignee avatars
- `scroll-area` — styled scroll for kanban columns + long lists
- `toast` — replace the demo-only `demo-toast-provider` with full toast system (shadcn now uses `sonner`)

### Files touched
**Create (shadcn CLI):**
- `packages/crm/src/components/ui/dialog.tsx`
- `packages/crm/src/components/ui/dropdown-menu.tsx`
- `packages/crm/src/components/ui/tooltip.tsx`
- `packages/crm/src/components/ui/popover.tsx`
- `packages/crm/src/components/ui/table.tsx`
- `packages/crm/src/components/ui/tabs.tsx`
- `packages/crm/src/components/ui/avatar.tsx`
- `packages/crm/src/components/ui/scroll-area.tsx`
- `packages/crm/src/components/ui/sonner.tsx` (the modern shadcn toast)

**Edit:**
- `packages/crm/package.json` — Radix deps (`@radix-ui/react-dialog`, `-dropdown-menu`, `-tooltip`, `-popover`, `-tabs`, `-avatar`, `-scroll-area`) + `sonner`. Shadcn CLI auto-edits this.
- `pnpm-lock.yaml` — lockfile update.

### Verification steps (in execution order)
1. `cd packages/crm && npx shadcn@latest add dialog dropdown-menu tooltip popover table tabs avatar scroll-area sonner` — let the CLI create files + add deps.
2. `pnpm install` in the monorepo root to sync workspaces.
3. `pnpm --filter @seldonframe/crm build` — should be green.
4. Grep the diff for unexpected changes (shadcn CLI sometimes modifies `components.json` or `globals.css` — confirm changes are scoped).
5. Confirm `ui/sheet.tsx` (already installed) was not overwritten.

### Blast radius
| Risk | Why |
|---|---|
| **Bundle size increase** | ~40-60 KB gzipped across all 9 primitives. Tree-shakable — only what's imported ships. Acceptable. |
| **Version conflicts with `@base-ui/react 1.3.0`** | Unlikely but check — Radix and Base UI both ship primitives; they coexist fine but both in deps is wasteful. Flag for cleanup in Phase 1 if unused. |
| **shadcn CLI edits `components.json` or `globals.css` unexpectedly** | Inspect diff before committing. |
| **Behavior regressions** | Zero — none of these are imported yet. |

### Validation (spot-check pages)
No visual check needed — primitives aren't mounted anywhere yet. Just confirm:
- `pnpm build` green
- All 9 new files present in `components/ui/`
- No unexpected file-level changes outside `components/ui/` + `package.json` + `pnpm-lock.yaml`

### Estimated duration
**30-45 min** — mostly CLI + lockfile regen. Bulk of time is confirming CLI didn't do anything surprising.

### Rollback plan
- `git revert <sha>`. Files and deps roll back.
- If partial success (some primitives break the build): delete the specific failing file and corresponding dep line, re-run build.

---

## Slice 0d — Standardize drawer/sheet/modal on `ui/sheet.tsx`

### Goal
Kill the one hand-rolled `fixed inset-0` drawer in booking admin and route it through the shadcn `Sheet` component. Delivers proper focus trap, ESC-to-close, backdrop animation, and a11y — all currently missing.

### What we know (verified via `grep -rn "fixed inset-0" packages/crm/src/components`)
| Location | Is a real hand-rolled drawer? | Action |
|---|---|---|
| `packages/crm/src/components/bookings/bookings-page-content.tsx:516` | ✅ Yes — "Create appointment type" drawer | **Migrate** |
| `packages/crm/src/components/layout/command-palette.tsx:55` | ❌ No — it's a modal (Cmd-K palette), not a drawer; already uses `crm-modal-backdrop` class | Leave |
| `packages/crm/src/components/ui/sheet.tsx:80` | ❌ No — it's the shadcn Sheet definition itself | Leave |

**Only one migration target.** The audit initially listed "drawer/sheet/modal standardization" as a larger effort; in reality, the substrate is already mostly standardized — the booking drawer is the lone outlier.

### Files touched
**Edit:**
- `packages/crm/src/components/bookings/bookings-page-content.tsx` — replace the `fixed inset-0 flex` block (lines ~515-690, about 175 lines of JSX) with `<Sheet open={isPanelOpen} onOpenChange={setIsPanelOpen}><SheetContent side="right">...form...</SheetContent></Sheet>`. Form body stays identical — only the outer drawer shell changes.

### Verification steps
1. Read current state of lines 515-690 in `bookings-page-content.tsx`.
2. Rewrite the drawer wrapper to use `<Sheet>` + `<SheetContent side="right" className="w-full max-w-md">`. Move the existing `<form>` inside `<SheetContent>` untouched.
3. Remove the local `isPanelOpen` state if `Sheet` manages it (it doesn't — controlled API). Keep the useState.
4. `pnpm --filter @seldonframe/crm build` — green.
5. On a local `pnpm dev`: click "New appointment type" → drawer slides in from right → form submits → drawer closes. Click backdrop → closes. Press ESC → closes. Tab-cycle → focus stays inside drawer (new a11y win).

### Blast radius
| Risk | Why |
|---|---|
| **Animation feel changes** | Shadcn `Sheet` has built-in slide transition (Radix). Current hand-rolled has no animation. Improvement. |
| **Focus behavior changes** | Sheet traps focus automatically. Current hand-rolled does not. Improvement. |
| **Close behavior changes** | Sheet adds ESC + close button + backdrop click. Current has only the Close button. All three desirable. |
| **Form state reset on close** | Identical to current — form resets on panel close because it unmounts. |
| **Visual width / padding drift** | Sheet's default padding differs slightly from the current `p-6` inline styling. Adjust via `className="p-6"` on `<SheetContent>`. |
| **z-index stacking** | Sheet uses `z-50` by default, matching current `z-50`. No conflict. |

### Validation (spot-check pages)
- `/bookings` → click "New appointment type" → drawer opens from right, solid dark background (already fixed today in `cd2258f3`, but confirm Sheet variant still renders correctly).
- Form submits + drawer closes on success.
- ESC closes.
- Backdrop click closes.
- Tab stays in drawer.
- Screen-reader announces drawer open/close (`aria-labelledby` etc. — Radix handles).

### Estimated duration
**30-45 min**.

### Rollback plan
- Single commit. `git revert <sha>` restores the hand-rolled drawer. Zero functional regression — the hand-rolled one works for the 80% case.

---

## Sequencing dependencies between slices

| Slice | Depends on |
|---|---|
| 0a — token unification | Nothing. Can run first. |
| 0b — delete orphans | Independent. Can run any time. Runs fast — good "warm-up" slice. |
| 0c — install primitives | Independent. Could technically run first, but typesetting it after 0a means the primitives inherit the unified tokens. |
| 0d — drawer migration | **Depends on 0c** (imports `ui/sheet.tsx` — already present, but Sheet variants may be refined during 0c install if shadcn ships an update). |

**Recommended execution order: 0b → 0a → 0c → 0d.**

- **0b first**: delete orphans quickly, shrink the diff surface for all subsequent slices. Reduces risk that later edits touch dead code and make reverts messier.
- **0a second**: token unification. Biggest blast radius but unblocks everything else.
- **0c third**: install primitives after tokens are stable so the new components inherit the unified palette cleanly.
- **0d last**: drawer migration consumes the Sheet primitive — must come after 0c is in place.

---

## Combined timeline for Phase 0

| Slice | Duration | Cumulative |
|---|---|---|
| 0b delete orphans | 15-20 min | 20 min |
| 0a token unification | 90-120 min (+30-60 if pre-work spike reveals broader silent bug) | ≤ 3 hr |
| 0c install primitives | 30-45 min | ≤ 3h 45m |
| 0d drawer migration | 30-45 min | ≤ 4h 30m |

**Target: Phase 0 complete in Day 1.** Day 2 reserved for buffer + smoke testing before Phase 1 starts.

If any slice fails build and can't be resolved in its estimated duration × 1.5, revert and revisit.

---

## Ship checklist per slice

Every slice, before declaring done:
- [ ] `pnpm --filter @seldonframe/crm build` green
- [ ] `grep` verification that the slice's invariant holds (e.g., 0a: zero `hsl(var(--X))` for any X)
- [ ] Spot-check page(s) specific to the slice render correctly on Vercel preview
- [ ] Commit message documents what + why + verification result
- [ ] Push to main via the established worktree pattern (`git push origin claude/sad-nightingale-5e7c94:main`)
- [ ] Watch Vercel deploy go green on the new SHA

---

## Out-of-scope for Phase 0

These are tempting but belong to later phases:
- Any shadcn primitive I add but don't install today (progress, skeleton, radio-group, switch) — install when a specific slice needs them, not preemptively.
- Any visual polish (hover states, spacing, typography tweaks) — Phase 1 territory.
- Any new component creation beyond the shadcn CLI additions — Phase 1 territory.
- Drawer refactors in `/contacts/[id]`, `/deals/[id]`, automation builder — Phase 1+.
- `lucide-react` icon audit — defer.

---

## Open questions for before slice 0a

1. **Pre-work spike in slice 0a** — the "is `bg-primary` currently broken?" investigation could reveal a broader invisible bug. Comfortable with me timebox-spiking it inside slice 0a, or want it as a separate discovery slice first?
2. **Exact brand primary value** — is `oklch(...)` (derived from `hsl(166 72% 40%)`) acceptable, or is there a canonical hex/brand-book reference I should derive from instead? The current triplet may have drifted from the original brand.
3. **Toast library choice** — shadcn now defaults to `sonner` (not the old `toast` primitive). Go with `sonner`, or use Radix Toast? `sonner` is the modern choice and lighter.

Waiting for approval before starting slice 0b (the suggested first).
