# Design picker on the claimed dashboard — design

**Date:** 2026-07-14 · **Branch:** `feature/dashboard-design-picker` · **Status:** approved (Max, in-chat 2026-07-14: "allow users to change their design model right on /dashboard?claimed=1 just like we do on /clients/<slug>/ready")

## Problem

A visitor who builds on /try and claims lands on `/dashboard?claimed=1` (the
fresh-claimed hero branch of `app/(dashboard)/dashboard/page.tsx`). The
"Change design" landing-design picker exists only on the agency-side ready
page (`/clients/[slug]/ready`) — the claimed owner has no way to re-skin
their site from their own dashboard short of asking SeldonChat.

## Approach — reuse, don't rebuild (verified seam)

Everything already exists and authorizes correctly:

- `ReadyDesignPicker` (`app/(dashboard)/clients/[slug]/ready/ready-design-picker.tsx`)
  is a self-contained client wrapper: optimistic value + `useTransition` +
  `setLandingTemplateAction(slug, id)` + `<PickerStyles/>`. Its only coupling
  to the ready page is the import path of the action.
- `setLandingTemplateAction` (`app/(dashboard)/clients/[slug]/ready/actions.ts:135`)
  gates on session + org ownership (`ownerId` / `parentUserId` / `orgMembers`).
  A claimed owner (link-owner sets `ownerId` = user id) passes. It calls the
  shared `setLandingTemplateForOrg` core (same one SeldonChat's
  `update_design` tool uses), which handles both tracks (health templates vs
  8 aesthetic archetypes) and revalidates `/w/[slug]`.
- The ready page computes the picker's props (track detection + current
  choice + auto-resolved id + options) inline at
  `app/(dashboard)/clients/[slug]/ready/page.tsx:244-281`.

### Changes

1. **Extract the prop-derivation into a shared server-safe pure helper**
   (second occurrence — extraction now justified per CLAUDE.md §3.1):
   `packages/crm/src/components/clients/design-picker/resolve-module-props.ts`

   ```ts
   export function resolveDesignModuleProps(input: {
     theme: unknown; soul: unknown; settings: unknown;
   }): {
     initialValue: DesignId;
     autoResolvedId?: Exclude<DesignId, "auto">;
     autoReason: string;
     designs?: DesignTemplate[];
     sectionLabel?: string;
     autoNote?: string;
   }
   ```

   Body = the exact logic currently at ready/page.tsx:244-281
   (`isLandingTemplateId` / `isHealthVertical` / `resolveHealthTemplate` /
   `classifyArchetypeFromSoul` / `ARCHETYPE_DESIGNS`). The ready page is
   refactored to call it (pure refactor — identical rendered props).

2. **Relocate the client wrapper to the shared picker folder** so both
   surfaces import it:
   `packages/crm/src/components/clients/design-picker/ReadyDesignPicker.tsx`
   (moved from the ready route; the ready route re-exports or imports from
   the new path). It keeps calling `setLandingTemplateAction` imported from
   `app/(dashboard)/clients/[slug]/ready/actions.ts` — server actions are
   module-scoped, importing across route folders is fine and avoids
   duplicating the auth gate. NO new server action.

3. **Dashboard surface** (`app/(dashboard)/dashboard/page.tsx`, fresh-claimed
   branch only, the `isFreshClaimedWorkspace && activeWorkspace` block at
   ~line 682): render a "Landing design" card using the shared wrapper.
   - Data: `soul` is already loaded (used by agent picks). `theme` +
     `settings` for the active workspace are NOT selected today → add ONE
     scoped select (`organizations.theme`, `organizations.settings` where
     `id = activeWorkspace.id`) inside the fresh-claimed branch only (zero
     cost on every other dashboard render).
   - Placement: a card following the booking/intake/chatbot card row in the
     hero column (match the existing card idiom of that branch — border,
     rounded, muted eyebrow). Keep it compact; the module already renders
     its own thumbnail + "Change design" control.
   - Pass `slug = activeWorkspace.slug`.
   - NOT flag-gated (the picker is already live on ready + copilot; this is
     a third surface of the same capability).
   - The populated (non-fresh) dashboard branch is OUT OF SCOPE.

## Non-goals

- No new server action, no change to `setLandingTemplateForOrg` /
  `setArchetypeForOrg`.
- No change to the ready page's rendered behavior (refactor must be
  invisible).
- No design-picker on the populated dashboard or operator views (later if
  wanted).

## Tests

- New: `tests/unit/design-picker/resolve-module-props.spec.ts` — pure helper:
  health-track workspace (landingTemplate set / health vertical) returns
  health defaults + choice; archetype-track returns `ARCHETYPE_DESIGNS`,
  archetype choice/auto resolution from theme, fallback to
  `classifyArchetypeFromSoul`; missing theme/soul → sane "auto" defaults.
- Existing suites must stay green; the ready page refactor is covered by
  tsc + the helper spec (the page has no dedicated spec today).
- Visual: vision-verify is deferred to post-deploy eyeball (the card reuses
  the existing module's styles); flag if `PickerStyles` mounts twice
  anywhere (it must mount once per surface).

## Verification

`/verify-build` via verify-runner in this worktree (no migrations, no deps,
no env). Post-deploy smoke: claimed dashboard shows the card; picking a
style re-skins `/w/<slug>` (the #67 normalizeTheme/aestheticArchetype
regression is already fixed on main — confirm it stays fixed by the smoke).
