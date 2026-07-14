# Plan — design picker on the claimed dashboard

Spec: `docs/superpowers/specs/2026-07-14-dashboard-design-picker-design.md`
Worktree: `.claude/worktrees/dashboard-design-picker` · branch `feature/dashboard-design-picker` (off `origin/main` @ `5a739dad9`)

Commit per task. TDD where there's logic (Task 1); Tasks 2-3 are wiring
covered by tsc + existing suites.
Regression set: `node --test --import tsx` over the new spec +
`tests/unit/web-onboarding/clients-new-form.spec.tsx` (touches nothing else,
but run the full `tests/unit/design-picker/` dir if created) + spot-run any
suite that imports from `components/clients/design-picker/`
(grep first — likely none today).

## Task 1 — `resolveDesignModuleProps` helper (+ spec)

New: `packages/crm/src/components/clients/design-picker/resolve-module-props.ts`
New: `packages/crm/tests/unit/design-picker/resolve-module-props.spec.ts`

Lift the logic from `app/(dashboard)/clients/[slug]/ready/page.tsx:244-281`
VERBATIM into a pure function (inputs `{ theme, soul, settings }`, returns
`{ initialValue, autoResolvedId, autoReason, designs, sectionLabel, autoNote }`).
Import the same deps the page uses today (`isLandingTemplateId`,
`isHealthVertical`, `resolveHealthTemplate`, `classifyArchetypeFromSoul`,
`ARCHETYPE_DESIGNS`, types). Server-safe: no "use client", no React.
Spec cases per the design doc §Tests (health track via template id, health
track via vertical, archetype track with persisted choice, archetype track
falling back to soul classification, null theme/soul).

## Task 2 — refactor ready page onto the helper + relocate the wrapper

Edit: `app/(dashboard)/clients/[slug]/ready/page.tsx` — replace lines
244-281 with a call to `resolveDesignModuleProps({ theme: workspace.theme,
soul: workspace.soul, settings: workspace.settings })`; pass its fields to
`<ReadyDesignPicker/>` exactly as before (prop names unchanged). Remove
now-unused imports.

Move: `app/(dashboard)/clients/[slug]/ready/ready-design-picker.tsx` →
`packages/crm/src/components/clients/design-picker/ReadyDesignPicker.tsx`.
Keep the file content identical EXCEPT the action import becomes
`import { setLandingTemplateAction } from "@/app/(dashboard)/clients/[slug]/ready/actions";`
Update the ready page's import. Delete the old file (no re-export shim —
grep first for other importers; scout found none, verify with
`grep -r "ready-design-picker" packages/crm/src`).

Gate: `npx tsc --noEmit` delta 0 vs baseline; ready page renders the same
props (pure refactor).

## Task 3 — claimed-dashboard card

Edit: `app/(dashboard)/dashboard/page.tsx`, inside the
`isFreshClaimedWorkspace && activeWorkspace` branch (~682):

- Add one scoped select inside this branch:
  `db.select({ theme: organizations.theme, settings: organizations.settings }).from(organizations).where(eq(organizations.id, activeWorkspace.id)).limit(1)`
  (match the file's existing query idiom; `soul` is already in scope).
- `const designProps = resolveDesignModuleProps({ theme, soul, settings })`.
- Render a card after the booking/intake/chatbot card row, matching that
  branch's card idiom (same border/rounded/padding classes as the sibling
  cards — read them and copy):

  ```tsx
  <ReadyDesignPicker
    slug={activeWorkspace.slug}
    initialValue={designProps.initialValue}
    autoResolvedId={designProps.autoResolvedId}
    autoReason={designProps.autoReason}
    designs={designProps.designs}
    sectionLabel={designProps.sectionLabel}
    autoNote={designProps.autoNote}
  />
  ```

  wrapped in the card container. No flag gate. Populated-dashboard branch
  untouched.
- Comment style: match the file's dated-comment idiom (one short comment
  explaining why the select lives inside the branch — zero cost elsewhere).

## Verify

verify-runner in this worktree: new spec green, full unit regression delta 0,
tsc delta 0 vs baseline, use-server check, no migrations, regression grep.
Then GATE 2 (Max merges) + post-deploy smoke: /dashboard?claimed=1 shows the
card; a style pick re-skins /w/<slug>.
