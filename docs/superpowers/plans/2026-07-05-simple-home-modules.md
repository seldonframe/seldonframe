# Simple Home + Modules + Command Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** First-time owners get a one-spine Home in plain language; the rest of the product becomes modules that wake on request (SeldonChat tools or a "Turn on more features" page); SeldonChat becomes a top command bar in the workspace chrome.

**Architecture:** A fixed module registry (pure) + a per-org `organizations.settings.surface` jsonb key (absent ⇒ grandfathered ⇒ everything on) read by the existing pure nav builder and the dashboard page. Fresh claims write a minimal module set at the link-owner write point. The command bar is a sticky client component above `{children}` in the (dashboard) layout that opens the existing SeldonChat panel prefilled. Three new copilot tools mutate the surface through the same helpers. Copy fixes ship flag-independent; every structural change is dark behind `SF_SIMPLE_HOME`.

**Tech Stack:** Next.js App Router (packages/crm), Drizzle + Neon HTTP, zod, node:test via `scripts/run-unit-tests.js`, no new dependencies.

## Global Constraints

- Flag: `SF_SIMPLE_HOME`, strict `=== "1"`, same pattern as `isWinLadderOn` in `packages/crm/src/lib/web-build/policy.ts`. Flag off ⇒ rendered output byte-identical to today EXCEPT the copy truth pass and the MCP-banner owner gate (Task 6 marks which is which).
- Settings writes use the 42P18-safe idiom: build the patch object in JS, single `${JSON.stringify(patch)}::jsonb` parameter, `COALESCE(settings,'{}'::jsonb) || …` merge. NEVER pass a jsonb_build_object key as a bare SQL param (prod incident 2026-07-05, ledger).
- Owner language (grade-6) on owner surfaces: "features" not "blocks", "lead form" not "intake form", no file names (BLOCK.md), no protocol names (MCP) for owners, no metrics computed from test/zero data. Buyer copy rule still binds: never GMV/fees.
- Day-one module set for fresh claims: `["home","website","bookings","customers"]`. Existing orgs (no `settings.surface`) are grandfathered: everything visible, zero change.
- Disable hides, never deletes. Money can't hide with an active subscription/unpaid invoice; Agents can't hide with a deployed agent. `home` and settings never hide.
- House commit rule: `git add` ONLY named files. One implementer at a time. Commit messages end with the Co-Authored-By line used in this repo.
- Verify per task: run the named spec files; `cd packages/crm && npx tsc --noEmit` (zero NEW errors vs baseline); `pnpm check:use-server`; `npx next build` for tasks touching routes/pages.

## File Structure

- `packages/crm/src/lib/workspace/modules.ts` (NEW) — registry + types. Pure.
- `packages/crm/src/lib/workspace/surface.ts` (NEW) — read/write/guard helpers. DB.
- `packages/crm/src/lib/web-build/policy.ts` — add `isSimpleHomeOn`.
- `packages/crm/src/app/api/v1/workspace/[id]/link-owner/route.ts` — fresh-claim surface write.
- `packages/crm/src/components/layout/nav-config.ts` — module filter + features item.
- `packages/crm/src/app/(dashboard)/settings/features/page.tsx` + `actions.ts` (NEW) — the plain toggle list.
- `packages/crm/src/app/(dashboard)/dashboard/page.tsx` — copy pass + section gating.
- `packages/crm/src/components/command-bar.tsx` (NEW) + `packages/crm/src/app/(dashboard)/layout.tsx` + `packages/crm/src/components/seldon-chat.tsx` — the bar.
- `packages/crm/src/lib/agents/copilot/tools.ts` + `cap.ts` — 3 new tools + persona line.
- Tests under `packages/crm/tests/unit/workspace/` and existing spec files named per task.

---

### Task 1: Flag + module registry (pure, TDD)

**Files:**
- Modify: `packages/crm/src/lib/web-build/policy.ts` (append; read the file — mirror `isWinLadderOn` exactly)
- Create: `packages/crm/src/lib/workspace/modules.ts`
- Test: `packages/crm/tests/unit/workspace/modules.spec.ts` (new; follow the harness conventions of `tests/unit/activation/ladder.spec.ts` — node:test, run via `node --import tsx --test`)

**Interfaces:**
- Produces: `isSimpleHomeOn(env: { SF_SIMPLE_HOME?: string | undefined }): boolean`
- Produces: `type ModuleId = "home" | "website" | "bookings" | "customers" | "leads" | "inbox" | "messaging" | "money" | "agents" | "integrations"`
- Produces: `MODULE_IDS: readonly ModuleId[]`, `DEFAULT_FRESH_MODULES: readonly ModuleId[]` (= home, website, bookings, customers)
- Produces: `MODULE_REGISTRY: readonly ModuleDef[]` where `ModuleDef = { id: ModuleId; label: string; description: string; alwaysOn: boolean }` — labels/descriptions in owner language: home "Home" / "Your overview" (alwaysOn true); website "Website" / "Your public website and how it looks"; bookings "Bookings" / "Your calendar and appointments"; customers "Customers" / "People, deals, and follow-ups"; leads "Lead forms" / "Forms that turn visitors into customers"; inbox "Inbox" / "Messages from your customers in one place"; messaging "Texting" / "Send and receive text messages"; money "Money" / "Invoices and payments"; agents "AI staff" / "Assistants that answer, book, and follow up"; integrations "Connected apps" / "Google Calendar, Gmail, and more".

- [ ] **Step 1: failing test** — `modules.spec.ts`: asserts (a) `MODULE_IDS` has the 10 ids above in order; (b) `DEFAULT_FRESH_MODULES` equals `["home","website","bookings","customers"]`; (c) every registry entry has non-empty label+description and none contains the words "block", "intake", "MCP", or "workspace" (copy-rule guard as a test); (d) exactly `home` has `alwaysOn: true`; (e) `isSimpleHomeOn({SF_SIMPLE_HOME:"1"})` true, `"0"`/`"true"`/undefined false.
- [ ] **Step 2: run** `cd packages/crm && node --import tsx --test tests/unit/workspace/modules.spec.ts` — FAIL (module not found).
- [ ] **Step 3: implement** `modules.ts` (pure constants exactly as in Interfaces) + `isSimpleHomeOn` appended to policy.ts:

```ts
export function isSimpleHomeOn(env: { SF_SIMPLE_HOME?: string | undefined }): boolean {
  return env.SF_SIMPLE_HOME === "1";
}
```

- [ ] **Step 4: run** same command — PASS. Also `npx tsc --noEmit`.
- [ ] **Step 5: commit** `git add packages/crm/src/lib/workspace/modules.ts packages/crm/src/lib/web-build/policy.ts packages/crm/tests/unit/workspace/modules.spec.ts && git commit -m "feat(surface): SF_SIMPLE_HOME flag + module registry"`

### Task 2: Surface read/write/guard helpers (DB, TDD)

**Files:**
- Create: `packages/crm/src/lib/workspace/surface.ts`
- Test: `packages/crm/tests/unit/workspace/surface.spec.ts`

**Interfaces:**
- Consumes: `ModuleId`, `MODULE_IDS`, `DEFAULT_FRESH_MODULES` from Task 1.
- Produces: `readEnabledModules(settings: unknown): ModuleId[] | null` — parses `settings?.surface?.modules`; returns null when the key is absent/malformed (grandfathered); filters unknown ids; always unions `["home"]`.
- Produces: `writeMinimalSurface(orgId: string): Promise<void>` — only-if-absent: `UPDATE organizations SET settings = COALESCE(settings,'{}'::jsonb) || ${JSON.stringify({surface:{modules:[...DEFAULT_FRESH_MODULES],version:1}})}::jsonb, updated_at = now() WHERE id = ${orgId} AND settings->'surface' IS NULL` via drizzle `sql` template — single `::jsonb` param, no bare key params (Global Constraints).
- Produces: `setModuleEnabled(orgId: string, moduleId: ModuleId, enabled: boolean): Promise<{ok: true, modules: ModuleId[]} | {ok: false, reason: string}>` — reads current org settings, computes next modules array (add/remove; never removes `home`), rejects disable when `canDisableModule` says no, writes the WHOLE surface object with the same `|| ${patch}::jsonb` merge (patch = `{surface:{modules,version:1,...preservedSurfaceKeys}}` — read-merge-write preserving sibling surface keys like `chatIntroSeen`).
- Produces: `canDisableModule(orgId: string, moduleId: ModuleId, deps?: {...}): Promise<{ok: boolean, reason?: string}>` — DI-injectable deps object (follow `ladder-server.ts`'s deps pattern): `money` blocked when the org has an ACTIVE Stripe subscription (`organizations.subscription` jsonb tier !== absent/inactive — read how `lib/billing/domain-gate.ts` derives tier and reuse that helper) ; `agents` blocked when a `deployments` row for the org is active (grep `lib/agents/store.ts` for the deployments active-status query and reuse); `home` always blocked; everything else allowed.

- [ ] **Step 1: failing tests** — DI/spy pattern copied from `tests/unit/activation/ladder-server.spec.ts`: (a) `readEnabledModules` null on `{}`/null/garbage; parses valid; strips unknown ids; injects home. (b) SQL-shape guard: `writeMinimalSurface`'s emitted SQL contains `::jsonb` and does NOT match `/jsonb_build_object\(\$/` (42P18 regression guard — same assertion style the ladder-server spec added). (c) `setModuleEnabled` refuses to remove home; preserves sibling surface keys in the written patch; returns reason from canDisableModule. (d) `canDisableModule` blocks money-with-subscription and agents-with-deployment via injected deps; allows otherwise.
- [ ] **Step 2: run** — FAIL. **Step 3: implement.** **Step 4: run** — PASS + `npx tsc --noEmit` + `pnpm check:use-server`.
- [ ] **Step 5: commit** the two files.

### Task 3: Fresh claims write the minimal surface

**Files:**
- Modify: `packages/crm/src/app/api/v1/workspace/[id]/link-owner/route.ts` (the `stampClaimingUserOnboarded` function, lines ~101-112 — called from both the already-linked path ~:156 and the fresh-claim path ~:239)
- Test: extend `packages/crm/tests/unit/workspace/surface.spec.ts` with the route-helper case only if the route has an existing spec harness (grep `tests` for `link-owner`); otherwise verify by type + manual trace in the report (do NOT scaffold a new route harness).

**Interfaces:**
- Consumes: `writeMinimalSurface(orgId)` (Task 2), `isSimpleHomeOn` (Task 1).

- [ ] **Step 1:** Inside `stampClaimingUserOnboarded`, after the `markOperatorOnboarded(...)` call, add:

```ts
if (isSimpleHomeOn({ SF_SIMPLE_HOME: process.env.SF_SIMPLE_HOME })) {
  await writeMinimalSurface(userRow.orgId).catch(() => {}); // fail-soft: claim must never break on surface write
}
```

(Idempotent by the SQL's only-if-absent guard; both call paths get it because both call this function.)
- [ ] **Step 2:** `npx tsc --noEmit` + `pnpm check:use-server` + run surface.spec.ts.
- [ ] **Step 3: commit** route file (+ spec if extended).

### Task 4: Nav module filter + "Turn on more features" item

**Files:**
- Modify: `packages/crm/src/components/layout/nav-config.ts` (`buildNavGroups`, `BuildNavInput`; the `inside-client-workspace` branch lines ~129-182; reuse the `filterHidden()` pattern at :94)
- Modify: the layout/server component that builds `BuildNavInput` (grep for `buildNavGroups(` call sites — pass the new field)
- Test: `packages/crm/tests/unit/layout/nav-config.spec.ts` (extend — this spec exists and is the gate)

**Interfaces:**
- Consumes: `ModuleId`, `readEnabledModules`.
- Produces: `BuildNavInput` gains optional `enabledModules?: ModuleId[] | null` (undefined/null ⇒ no filtering — grandfathered AND flag-off both flow through as null). Mapping (constant in nav-config.ts): home→Home; customers→Customers group header + Customers item; bookings→Bookings; leads→Intake/Lead-Forms item; inbox→Inbox; messaging→Messaging; money→Money group; agents→Agents group; integrations→Integrations item; Settings + "Back to agency" NEVER filtered. When `enabledModules` is non-null, append to the last group: `{ href: "/settings/features", label: "Turn on more features", icon: <the existing plus/sparkle icon used in this file — pick one already imported> }`.
- Caller: pass `enabledModules: simpleHomeOn ? readEnabledModules(activeOrg.settings) : null`.

- [ ] **Step 1: failing tests** in nav-config.spec.ts: (a) `enabledModules: ["home","website","bookings","customers"]` ⇒ inside-client-workspace nav contains Home/Bookings/Customers, does NOT contain Money/Agents/Integrations/Messaging/Inbox items, DOES contain Settings and "Turn on more features"; (b) `enabledModules: null` ⇒ output deep-equals today's output (snapshot the current groups in the test before changing the builder); (c) empty group headers are dropped (no "MONEY" header with zero items).
- [ ] **Step 2-4:** red → implement → green (`node --import tsx --test tests/unit/layout/nav-config.spec.ts`), tsc, check:use-server.
- [ ] **Step 5: commit** nav-config.ts + caller + spec.

### Task 5: /settings/features page + toggle action

**Files:**
- Create: `packages/crm/src/app/(dashboard)/settings/features/page.tsx` (server component) and `packages/crm/src/app/(dashboard)/settings/features/actions.ts` (`"use server"`)
- Test: `packages/crm/tests/unit/workspace/surface.spec.ts` already covers the write; the action itself follows the async-only rule (check:use-server is the gate).

**Interfaces:**
- Consumes: `MODULE_REGISTRY`, `readEnabledModules`, `setModuleEnabled`, org from `getOrgId()` (grep how sibling settings actions resolve it — same pattern, never from form input).
- Produces: `toggleModuleAction(formData: FormData): Promise<void>` — reads `moduleId` (validated with `z.enum(MODULE_IDS)`) and `enabled` ("true"/"false"), calls `setModuleEnabled(orgId, moduleId, enabled)`, `revalidatePath("/dashboard")`, `revalidatePath("/settings/features")`; surfaces `{ok:false}` reasons via `redirect` query or the page's search param message (match how other settings pages show notices — read `settings/billing/page.tsx` first and copy its notice pattern).

- [ ] **Step 1:** Page: title "Features", one-line intro "Turn features on when you need them. Turning one off just hides it — nothing is deleted." List every `MODULE_REGISTRY` entry: label, description, a form with hidden moduleId + submit toggle button ("Turn on"/"Turn off"; disabled + reason text when `canDisableModule` fails or `alwaysOn`). Grandfathered orgs (null surface): show the list with everything "On" and a note "You're seeing everything. Turning something off hides it from your menu." — toggling from null surface first materializes the full set then removes (implement in `setModuleEnabled`: null current ⇒ start from `MODULE_IDS`).
- [ ] **Step 2:** verify: `npx tsc --noEmit`, `pnpm check:use-server`, `npx next build` exit 0.
- [ ] **Step 3: commit** the two files (+ any notice-pattern import).

### Task 6: Dashboard copy truth pass + section gating + banner owner-gate

**Files:**
- Modify: `packages/crm/src/app/(dashboard)/dashboard/page.tsx` ONLY. Line anchors (verify before editing — the file may have drifted): MCP banner :1288-1311 and :1336-1343; "Newly installed blocks" :1521-1656; kanban embed + BLOCK.md caption :1658-1697 (caption :1672); "Your Blocks" :1699-1799 (+"Hidden blocks" :1785); KPI stats :1841-1856 (data :1225-1262); Lead Sources :1859-1899; Revenue Flow :1901-1970 (synthetic bar :1186-1189); Active Deals :1973-2050; Upcoming Sessions :2052-2068 (already gated).
- Test: no component harness exists for this page (per scout) — the gate is: flag-off grep proof + build + the copy assertions below run as greps in the verify task. Do NOT scaffold a page test harness.

**A. Flag-INDEPENDENT (ships live — copy/audience truth, precedent: the pricing truth pass):**
- :1672 caption → `"Drag deals between stages — totals update as you go."` (kill "BLOCK.md view metadata", "WIP limits", "pipeline schema").
- "Newly installed blocks" → "Just added to your workspace"; its sub-line "Live previews of what just shipped into this workspace. Share the public links or jump into the admin to customize." → "Share these pages or open them to make changes."
- "Your Blocks" → "Your features"; "Hidden blocks" → "Hidden features".
- MCP banner (:1288-1311, :1336-1343): additionally gate on NOT-claimed-owner: `const isClaimedOwner = Boolean(activeOrg?.ownerId && user?.id && activeOrg.ownerId === user.id)` (both fields are already selected in this page — verify; if ownerId isn't in the select, add it to the existing org select). Render banner only when `!isOperatorSession && !isClaimedOwner`.
- Soul default label: `packages/crm/src/lib/soul/fallback.ts:38` + `templates/default.ts:9` — `"Intake Forms"` → `"Lead Forms"` (fallback DEFAULTS only; per-workspace Soul overrides untouched).
**B. Flag-GATED (`simpleHomeOn` computed once at top of the page — `isSimpleHomeOn({SF_SIMPLE_HOME: process.env.SF_SIMPLE_HOME})`; combine with `const surfaceModules = readEnabledModules(activeOrg?.settings)`; define `const simplified = simpleHomeOn && surfaceModules !== null`):**
- KPI stats: render only when `!simplified || activeProjects > 0 || revenueThisMonthCents > 0 || hasRevenueHistory`.
- Lead Sources: `!simplified || totalLeads > 0`.
- Revenue Flow: `!simplified || hasRevenueHistory` (the synthetic single-bar series must never render when simplified).
- Active Deals: `!simplified || opportunityRows.length > 0`.
- Kanban embed: `showPipelineEmbed && (!simplified || (surfaceModules.includes("customers") && opportunityRows.length > 0))`.
- "Just added to your workspace" section: `!simplified` (the ladder owns first-run discovery).
- "Your features" section: `!simplified`.
Use exactly this boolean composition so flag-off (`simplified === false`) short-circuits every new condition to today's behavior.
- [ ] **Steps:** edit → `npx tsc --noEmit` → `npx next build` exit 0 → grep proofs: `grep -n "BLOCK.md\|Newly installed blocks\|Your Blocks\|Hidden blocks" packages/crm/src/app/\(dashboard\)/dashboard/page.tsx` returns zero rendered-string hits → commit page.tsx + the two soul files.

### Task 7: Command bar + SeldonChat prefill/auto-open

**Files:**
- Create: `packages/crm/src/components/command-bar.tsx` (`"use client"`)
- Modify: `packages/crm/src/app/(dashboard)/layout.tsx` (mount between `<DashboardTopbar …/>` ~:316 and `{children}` ~:317; SeldonChat mount ~:324-326)
- Modify: `packages/crm/src/components/seldon-chat.tsx` (accept prefill via the `seldonchat:open` CustomEvent detail; `hideLauncher` prop; auto-open-once)
- Modify: `packages/crm/src/lib/workspace/surface.ts` (add `markChatIntroSeen(orgId)` — same merge idiom, sets `surface.chatIntroSeen: true` preserving siblings) + a tiny `"use server"` action file `packages/crm/src/lib/workspace/surface-actions.ts` exporting `markChatIntroSeenAction()` (org from session).
- Test: extend `packages/crm/tests/unit/workspace/surface.spec.ts` (markChatIntroSeen preserves modules array); seldon-chat spec (`tests/unit/` — grep for the existing seldon-chat spec from H3) gains: prefill event populates the input; `hideLauncher` hides the bubble button.

**Interfaces:**
- `CommandBar({ enabled, autoOpenOnce, chips }: { enabled: boolean; autoOpenOnce: boolean; chips: string[] })` — sticky bar (`position: sticky; top: 0; z-40` inside the scroll column), placeholder **"Ask SeldonChat — change anything"**; on submit: `window.dispatchEvent(new CustomEvent("seldonchat:open", { detail: { prefill: text } }))` and clears itself. When `autoOpenOnce`: on mount, dispatch `seldonchat:open` with `{ chips }` once, then fire `markChatIntroSeenAction()` (fire-and-forget). Chips v1 (static): `["Change my colors", "Update my business hours", "Book a test appointment"]` — rendered as buttons inside the opened panel (SeldonChat side), clicking one sends it as the message.
- Layout: `const simpleHomeOn = isSimpleHomeOn({SF_SIMPLE_HOME: process.env.SF_SIMPLE_HOME});` `const surfaceModules = readEnabledModules(activeOrg?.settings);` mount `<CommandBar enabled autoOpenOnce={simpleHomeOn && surfaceModules !== null && !(activeOrg settings surface.chatIntroSeen)} chips={…}/>` only when `simpleHomeOn && !isOperatorSession && orgId`. SeldonChat mount gains `hideLauncher={simpleHomeOn}` (bar replaces bubble; flag off ⇒ bubble unchanged).
- SeldonChat: extend the existing `seldonchat:open` listener (component ~line 87) to read `event.detail?.prefill` → set input value (do NOT auto-send) and `event.detail?.chips` → render chip buttons above the input when the transcript is empty. `hideLauncher` prop: when true, don't render the floating launcher button (panel opens only via events).

- [ ] **Steps:** failing specs (prefill + hideLauncher + markChatIntroSeen) → red → implement → green → tsc → check:use-server → `npx next build` → commit the five files.

### Task 8: Copilot tools enable_module / disable_module / pin_card + persona

**Files:**
- Modify: `packages/crm/src/lib/agents/copilot/tools.ts` (after update_theme; same `safe()` wrapper, org from `ctx.orgId` ONLY, `logEvent(..., { orgId: ctx.orgId })` parity)
- Modify: `packages/crm/src/lib/agents/copilot/cap.ts` ("Pick the right tool" section: one line — features on/off and pinning go through these tools; visual style → update_theme; content/sections → edit_site)
- Modify: `packages/crm/src/lib/workspace/surface.ts` (add `setPinned(orgId, pinned: ModuleId[])` — merge idiom, preserves siblings; Home consumes `surface.pinned` ordering in a LATER wave — v1 stores it and the tool reads back honestly "saved — pinned sections will lead your Home page")
- Test: extend the copilot-tools spec (from H2b — has the module-mock pattern): enable happy path calls `setModuleEnabled(ctx.orgId, "money", true)`; disable of "money" surfaces the guard reason verbatim; zod rejects unknown module id; pin_card rejects non-registry ids; malicious args orgId ignored (same pattern as the update_theme case).

**Interfaces:**
- `enable_module` input `{ module: z.enum(MODULE_IDS) }`; `disable_module` same; `pin_card` input `{ modules: z.array(z.enum(MODULE_IDS)).min(1).max(4) }`. All three return `{ ok, modules?/pinned?, message }` with plain-language read-back ("Money is now in your sidebar — send your first invoice from there." / on guard: the reason, verbatim).

- [ ] **Steps:** red → implement → green (copilot-tools spec file) → tsc → check:use-server → commit tools.ts + cap.ts + surface.ts + spec.

### Task 9: Verify gate + rollout notes

**Files:**
- Create: `docs/superpowers/plans/2026-07-05-simple-home-rollout-notes.md`

- [ ] Full unit suite via `scripts/run-unit-tests.js` — zero wave-attributable failures (judge by delta vs the ledgered baseline; attribute per the T13 procedure in `.superpowers/sdd/progress.md`).
- [ ] `npx tsc --noEmit` zero new; `pnpm check:use-server` pass; `npx next build` exit 0.
- [ ] FLAG-OFF PROOF: `grep -rn "isSimpleHomeOn" packages/crm/src` — every call site listed with role; confirm: nav filter receives null when off; dashboard `simplified` false path preserves every section; command bar unmounted; bubble launcher unchanged; claim write skipped. Account for every file in `git diff <base>..HEAD --stat` as {flag-gated | copy-truth (intentional live) | test | docs}.
- [ ] Intentionally-live list (the ONLY live changes): dashboard copy rewrites, BLOCK.md caption, Soul default "Lead Forms", MCP banner owner-gate.
- [ ] Rollout notes: flip = `SF_SIMPLE_HOME=1` (non-secret); smoke checklist (fresh /try claim ⇒ 4-item nav + command bar + auto-open once; "turn on invoicing" via chat ⇒ Money appears; /settings/features toggles; grandfathered org unchanged; flag-off unchanged); risks (grandfather invariant, guard correctness); fast-follows (pinned ordering consumed by Home, ladder-derived chips, agency pre-shaping).
- [ ] Commit the notes file only.

**Final:** whole-branch review (most capable model) per superpowers:requesting-code-review, then merge per house method.

---

## Self-review (done)
- Spec coverage: Part A → T6; Part B → T1-T5, T8; Part C → T7; copy rule → T1(d) test + T6A + registry language; flags/rollout → T9. Gap check: agency pre-shaping + pinned-consumption are spec out-of-scope/fast-follow — recorded in T9 notes. ✓
- No placeholders; every step has code or an exact command/anchor. Line anchors marked verify-before-edit (file may drift). ✓
- Type consistency: `ModuleId`/`MODULE_IDS`/`DEFAULT_FRESH_MODULES`/`readEnabledModules`/`setModuleEnabled`/`canDisableModule`/`writeMinimalSurface`/`markChatIntroSeen`/`setPinned` used identically across T1-T8. ✓
