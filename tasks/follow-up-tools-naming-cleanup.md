# Follow-up: tools.ts naming convention cleanup

**Context:** Deferred from SLICE 2 audit G-3 (2026-04-23). The
repo has two `<slug>.block.md` ↔ `<shortened>.tools.ts` pairs
that break the `<slug>.tools.ts` convention the scaffold enforces
for new blocks. Cleanup of the existing offenders is out-of-slice
for SLICE 2 — it would silently ripple into unrelated files.

## Known offenders

Verified 2026-04-23 at HEAD (`claude/fervent-hermann-84055b`):

| Block slug (`id` in frontmatter) | Current `.tools.ts` | Expected `.tools.ts` |
|---|---|---|
| `formbricks-intake` | `intake.tools.ts` | `formbricks-intake.tools.ts` |
| `landing-pages` | `landing.tools.ts` | `landing-pages.tools.ts` |

5 of 7 core blocks already follow the convention cleanly:
`caldiy-booking.tools.ts`, `crm.tools.ts`, `email.tools.ts`,
`payments.tools.ts`, `sms.tools.ts`.

## Scope

1. Rename `packages/crm/src/blocks/intake.tools.ts` →
   `packages/crm/src/blocks/formbricks-intake.tools.ts`.
2. Rename `packages/crm/src/blocks/landing.tools.ts` →
   `packages/crm/src/blocks/landing-pages.tools.ts`.
3. Update import references:
   - `scripts/emit-block-tools.impl.ts` — TARGETS registry imports.
   - Any other cross-file reference discovered via `grep -r "intake.tools"`
     and `grep -r "landing.tools"`.
4. Update the TARGETS registry `slug` fields if they don't already
   match the block's `id` frontmatter (verify — likely already
   correct since emit-check is green).
5. Run `pnpm emit:blocks:check` — must remain green.
6. Run `pnpm test:unit` — all tests must pass.

## Estimate

- ~1 hour wall-clock
- ~30 LOC (pure rename + import update; no new code)
- Risk: low. Pure refactor. emit-check + unit tests verify.

## Priority

**Nice-to-have.** The inconsistency is grandfathered (the scaffold
enforces the convention going forward; existing offenders don't
block any feature work). No functional impact.

**Pickup window:** between slices, or opportunistically if someone
touches the emit-block-tools script for another reason.

## Why not folded into SLICE 2

- Out-of-slice ripple: the scaffold's audit (step-block-scaffolding-
  audit.md) carefully scopes "new blocks only." Migrating existing
  blocks introduces unrelated commits into the scaffold PR.
- Reviewer focus: SLICE 2's PRs are best reviewed against scaffold
  correctness. A rename commit in the same branch distracts.
- Low urgency: the inconsistency has been in the tree since 2b.2
  and caused zero observable issues.
