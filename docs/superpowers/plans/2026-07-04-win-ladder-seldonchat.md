# Win Ladder + SeldonChat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a /try claim, the workspace hero grows a four-step, state-detected win ladder (real-calendar test booking → SeldonChat edits → domain/$29 → hire agents), centered on SeldonChat — an authed, Sonnet-powered copilot dock that wields the workspace-admin action layer with live preview and undo.

**Architecture:** Three independently-mergeable phases. Phase A rebuilds SeldonChat on the EXISTING agent runtime (`executeTurn`) by adding a `workspace_copilot` capability whose tools are thin zod wrappers over the already-shipped admin action layer; a hidden per-org copilot agent row + an authed SSE route with a 20/day cap. Phase B adds the pure ladder engine + hero UI + step wiring (org-level Composio calendar connect, share/QR assets, contextual starter agents) + PostHog funnel events via a new shared server-capture module. Phase C is the /pricing truth pass and LLM analytics on the runtime loop. Everything is flag-dark behind `SF_WIN_LADDER` except Phase C (truth fixes ship live).

**Tech Stack:** Next.js 16 (packages/crm), drizzle/Neon, existing agent runtime (Anthropic SDK), posthog-node, Composio (@composio/core, keys already in Vercel), `qrcode` (new, tiny, server-side only), node:test + tsx specs.

## Global Constraints

- **Flag:** ladder UI + SeldonChat dock render ONLY when `isWinLadderOn({SF_WIN_LADDER: process.env.SF_WIN_LADDER})` — strict `"1"` check, same pattern as `isWebUngatedBuildOn` (packages/crm/src/lib/web-build/policy.ts:10). Flag-off = byte-identical current behavior.
- **Copilot model:** `claude-sonnet-4-20250514` exactly (founder call). System prompt uses `cache_control` where the existing runtime already applies it — do not add a new caching scheme.
- **Copilot free cap:** 20 queries/day/org via `checkRateLimit("copilot-daily:" + orgId, 20, 86_400_000)` (packages/crm/src/lib/utils/rate-limit.ts:54). Cap response is a warm entice, never an error.
- **$29 rail:** the ladder/domain/pricing CTAs POST `{ priceId: GROWTH_BASE_PRICE_ID }` to `/api/stripe/checkout` (the verified-live $29 price, packages/crm/src/lib/billing/price-ids.ts:78; allowlisted; resolves tier "workspace" whose `getOrgFeatures().customDomains === true`). NO new Stripe surfaces, NO webhook changes.
- **Privacy:** PostHog events carry ids/counts/names of steps and tools — never prompt/completion bodies, never tool arg values, never raw tokens (same posture as lib/analytics/mcp-capture.ts).
- **Copilot v1 tool scope:** site/landing/theme/sections/intake/booking-config + version undo ONLY. No billing, no deletion of workspaces, no secrets. Section/page deletes require the in-chat confirm word ("confirm").
- **Copilot agents are invisible plumbing:** the hidden copilot agent row must be excluded from every agent list, the activation funnel's "built an agent" metric, and ladder step-4 detection.
- **Never-lies:** the copilot reports only what tool results confirmed; failures are stated plainly.
- **House rules:** `git add` ONLY named files (never `-A`); no migrations unless a task names one (none do — ladder state derives from existing data + `organizations.settings` jsonb merges using the COALESCE `||` idiom from mark-operator-onboarded.ts:80); comments only for non-obvious constraints.
- **Commit trailer:** every commit ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Verify per task:** the named spec file(s) green via `node --import tsx --test <file>`, `cd packages/crm && npx tsc --noEmit` zero NEW errors, `bash scripts/check-use-server.sh src` clean.

---

# PHASE A — SeldonChat (front-door copilot)

### Task 1: Copilot flag + tool registry (pure core, TDD)

**Files:**
- Modify: `packages/crm/src/lib/web-build/policy.ts` (append `isWinLadderOn`)
- Create: `packages/crm/src/lib/agents/copilot/tools.ts`
- Modify: `packages/crm/src/lib/agents/tools.ts` (register the capability in `getToolsForCapabilities`, ~line 1939)
- Test: `packages/crm/tests/unit/agents/copilot-tools.spec.ts`

**Interfaces:**
- Consumes: admin action layer — `mutateSectionField` (`@/lib/blueprint/mutate`) + `renderBlueprint` via the section-update route's internals, `getLandingStructureForWorkspace`/`moveSectionForWorkspace`/`deleteSectionForWorkspace` (`@/lib/page-blocks/landing-structure.ts:234/320/344`), `addIntakeFieldForWorkspace` (`@/lib/page-blocks/intake-structure.ts:263`), `customizeLandingR1`/`listLandingVersions`/`revertLandingR1` (`@/lib/landing/r1-customize.ts:136/428/316`), theme via `db.update(organizations)` on the `theme` jsonb (mirror `saveThemeSettingsAction`'s field set, lib/theme/actions.ts:100), `AgentTool` type + `ToolExecuteContext` (`@/lib/agents/tools.ts:87/35`).
- Produces: `export const COPILOT_CAPABILITY = "workspace_copilot"`, `export function buildCopilotTools(): AgentTool[]` (7 tools: `get_site_structure`, `edit_site` (NL instruction → customizeLandingR1 with the PLATFORM `process.env.ANTHROPIC_API_KEY` as byokKey and ctx.orgId as workspaceId, userId = ctx passed through), `update_section_field`, `move_section`, `delete_section` (requires `confirm: true` arg), `add_intake_field`, `list_versions` + `undo_last_change` (revert to the previous version id)). `isWinLadderOn(env): boolean`.

- [ ] **Step 1: Write the failing test** — `copilot-tools.spec.ts` asserting: `buildCopilotTools()` returns tools whose names exactly match the 8-name list; every tool has `jsonSchema.type === "object"`; `delete_section` schema requires `confirm`; `isWinLadderOn({SF_WIN_LADDER:"1"})===true`, `"true"`/undefined → false. Mock nothing (pure surface only — schemas + names; execute fns are NOT called in this spec).
- [ ] **Step 2: Run it** — `node --import tsx --test packages/crm/tests/unit/agents/copilot-tools.spec.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** — `policy.ts` append:
```ts
/** Win-ladder + SeldonChat dock flag (2026-07-04). Same strict-"1" contract as
 *  isWebUngatedBuildOn: anything else keeps the surfaces dark. */
export function isWinLadderOn(env: { SF_WIN_LADDER?: string | undefined }): boolean {
  return env.SF_WIN_LADDER?.trim() === "1";
}
```
`copilot/tools.ts`: each tool = `{ name, description, inputSchema: z.object(...), jsonSchema, execute }` where execute delegates to the consumed function with `ctx.orgId` as the workspace id and returns the underlying result verbatim (never throw: wrap in try/catch returning `{ ok:false, error: message }`). `edit_site` passes `{ workspaceId: ctx.orgId, instruction, userId: "copilot:" + ctx.orgId, byokKey: process.env.ANTHROPIC_API_KEY ?? "" }` and returns `{ ok, summary }` from `customizeLandingR1`. `undo_last_change` = `listLandingVersions(ctx.orgId, 2)` → revert to `[1].id` (the previous), `{ok:false,error:"nothing to undo"}` when <2. In `tools.ts` `getToolsForCapabilities`, add before the return: `if (capabilities?.includes(COPILOT_CAPABILITY)) { native.push(...buildCopilotTools()); }` (import from `./copilot/tools`; follow the exact merge idiom the function already uses for its native list).
- [ ] **Step 4: Re-run test** → PASS. Also `npx tsc --noEmit` + `bash scripts/check-use-server.sh src`.
- [ ] **Step 5: Commit** — `git add packages/crm/src/lib/web-build/policy.ts packages/crm/src/lib/agents/copilot/tools.ts packages/crm/src/lib/agents/tools.ts packages/crm/tests/unit/agents/copilot-tools.spec.ts` → `feat(copilot): workspace_copilot capability + admin toolset (flag-dark)`.

### Task 2: Hidden copilot agent + invisibility guarantees (TDD)

**Files:**
- Create: `packages/crm/src/lib/agents/copilot/ensure-agent.ts`
- Modify: the agents LIST loaders (find via `grep -rn "listAgents\|from(agents)" packages/crm/src/lib/agents/store.ts` — every org-scoped list select) to filter `ne(agents.type, "workspace_copilot")`; the activation funnel "built" metric (`packages/crm/src/lib/super-admin/activation.ts` — the agents-built stage query) same filter.
- Test: `packages/crm/tests/unit/agents/copilot-ensure.spec.ts`

**Interfaces:**
- Consumes: `agents` schema (read `packages/crm/src/db/schema/agents.ts` first — reuse its `type` column exactly as the existing archetypes do; if `type` is a constrained union, extend the TS union, no migration — it is `text` typed).
- Produces: `export async function ensureWorkspaceCopilotAgent(orgId: string, deps = defaultDeps): Promise<{ agentId: string; conversationIdFor(userId: string): Promise<string> }>` — get-or-create ONE agent row per org (`type: "workspace_copilot"`, `name: "SeldonChat"`, `blueprint: { capabilities: ["workspace_copilot"] }`, status active) + get-or-create ONE `agentConversations` row per (agent, operator user id) keyed via the conversation's existing external-key column (read schema; use the same column `send_conversation_turn` dedupes on, storing `copilot:<userId>`).
- DI: `deps = { findAgent, createAgent, findConversation, createConversation }` so the spec runs DB-free.

- [ ] **Step 1: Failing test** — with stub deps: creates when absent (asserts insert args: type/name/capabilities), returns existing when present (no create call), conversation keyed per user, second call idempotent.
- [ ] **Step 2: Run** → FAIL. 
- [ ] **Step 3: Implement** (pure orchestration around the injected deps; default deps use the same drizzle patterns as `lib/agents/store.ts`). Add the list-filter `ne(agents.type, "workspace_copilot")` to every org agent list surfaced to UI + the funnel stage query, each with the one-line comment `// copilot rows are plumbing, not user agents (win-ladder plan T2)`.
- [ ] **Step 4: Re-run + suite** — the copilot spec green; run the existing agents-store + activation-funnel specs (`grep -l "activation" packages/crm/tests/unit` → run those files) to prove no regression.
- [ ] **Step 5: Commit** — named files → `feat(copilot): hidden per-org SeldonChat agent + list/funnel invisibility`.

### Task 3: Authed copilot turn route + 20/day cap

**Files:**
- Create: `packages/crm/src/app/api/copilot/turn/route.ts`
- Create: `packages/crm/src/lib/agents/copilot/cap.ts`
- Test: `packages/crm/tests/unit/agents/copilot-cap.spec.ts`

**Interfaces:**
- Consumes: `executeTurn` (`@/lib/agents/runtime.ts:81`) with `blueprintOverride: { capabilities: ["workspace_copilot"], model: "claude-sonnet-4-20250514", systemPromptExtras: COPILOT_PERSONA }` — read `composeSystemPrompt` (`lib/agents/prompt.ts`) first and thread the persona through whichever existing blueprint field carries operator instructions (the blueprint has a prompt/persona field — use it, do not add runtime params); `ensureWorkspaceCopilotAgent` (T2); `checkRateLimit` + `isRateLimiterDistributed` (`@/lib/utils/rate-limit.ts:54/112`); `requireAuth`/`getOrgId` (`@/lib/auth/helpers`).
- Produces: `POST /api/copilot/turn` body `{ message: string }` → JSON `{ kind: "reply", text, toolEvents: {name, ok}[] }` | `{ kind: "capped", used: 20, limit: 20, upgrade: "/pricing" }`. Pure `export function capResponse(limit: number)` and `export const COPILOT_PERSONA: string` (the never-lies + confirm-destructive + "you ACT, then state what changed" instructions) live in `cap.ts` for testability.

- [ ] **Step 1: Failing test** — `capResponse(20)` shape; `COPILOT_PERSONA` contains the strings "confirm" and "only claim what a tool result confirmed" (guards against prompt drift).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement route**: `requireAuth()` → `getOrgId()` (401/400 on missing); `const allowed = await checkRateLimit("copilot-daily:" + orgId, 20, 86_400_000); if (!allowed) return NextResponse.json(capResponse(20));` → `ensureWorkspaceCopilotAgent(orgId)` → conversation for `session.user.id` → `executeTurn({ conversationId, userMessage: message, blueprintOverride })` → map result to `{kind:"reply",...}` (collect tool names/ok from the turn result's tool events — read `ExecuteTurnResult` in runtime.ts and use its actual field names). `export const runtime = "nodejs"`. Route returns 404 when `!isWinLadderOn(process.env)` (flag-dark).
- [ ] **Step 4: Verify** — spec green; tsc; check-use-server; `npx next build` ONCE at end of Phase A (T4 step 5 runs it).
- [ ] **Step 5: Commit** — named files → `feat(copilot): authed /api/copilot/turn on executeTurn + 20/day cap (flag-dark)`.

### Task 4: SeldonChat dock UI (rebirth)

**Files:**
- Rewrite: `packages/crm/src/components/seldon-chat.tsx` (the unmounted component — replace its internals, keep the export name)
- Modify: `packages/crm/src/app/(dashboard)/layout.tsx` (mount at the 2026-05-18 tombstone block, lines ~305-310)
- Test: `packages/crm/tests/unit/components/seldon-chat.spec.tsx` (pure render-logic pieces only — extract `export function shouldBustPreview(toolEvents: {name:string}[]): boolean` and test THAT; jsdom component tests are flaky in this repo)

**Interfaces:**
- Consumes: `POST /api/copilot/turn` (T3 shapes); `isWinLadderOn` server-side (layout passes `winLadderOn` boolean prop); HelpButton's floating pattern (`components/layout/help-button.tsx` — fixed bottom-right, click-outside, Escape).
- Produces: `<SeldonChat enabled={boolean} previewUrl={string} />` — a fixed bottom-LEFT dock button (HelpButton owns bottom-right) opening a panel: message list, input, send → POST turn; while `kind:"capped"` renders the warm entice card with a Link to `/pricing`; after any reply where `shouldBustPreview(toolEvents)` (true when any tool name starts with `edit_`/`update_`/`move_`/`delete_`/`add_`/`undo_`), reload the side preview `<iframe src={previewUrl + "?v=" + Date.now()}>` (desktop panel is two-pane ≥1024px: chat left, iframe right; below that, chat only + a "View site" link). First-open shows three example chips ("Change the headline to …", "Make the buttons match my logo", "Add a question to my intake form").

- [ ] **Step 1: Failing test** for `shouldBustPreview` (edit_site → true, get_site_structure → false, empty → false).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** component + mount: in layout.tsx replace the tombstone comment block with:
```tsx
{/* SeldonChat reborn (win-ladder plan, 2026-07-04): the FRONT-DOOR copilot dock.
    Unlike the 2026-05-18 removal (a talking helper), this one ACTS via the
    workspace_copilot toolset with live preview — flag-gated SF_WIN_LADDER. */}
{winLadderOn && !isOperatorSession && orgId ? (
  <SeldonChat enabled previewUrl={copilotPreviewUrl} />
) : null}
```
where layout computes `const winLadderOn = isWinLadderOn({ SF_WIN_LADDER: process.env.SF_WIN_LADDER });` and `copilotPreviewUrl` = the active workspace public home (reuse `buildWorkspaceUrls(activeOrg slug…).home` — the layout already loads `activeOrg`; derive slug from it, fall back to `"https://" + WORKSPACE-BASE`… read what the layout has in scope and pass the same `urls.home` the dashboard hero uses; if slug is unavailable in layout, pass null and the component hides the preview pane).
- [ ] **Step 4: Verify** — spec green; tsc; check-use-server; `cd packages/crm && npx next build` exit 0.
- [ ] **Step 5: Commit** — named files → `feat(copilot): SeldonChat dock + live preview, mounted at the old tombstone (flag-dark)`.

---

# PHASE B — the ladder

### Task 5: Ladder engine (pure, TDD)

**Files:**
- Create: `packages/crm/src/lib/activation/ladder.ts`
- Test: `packages/crm/tests/unit/activation/ladder.spec.ts`

**Interfaces:**
- Produces:
```ts
export type LadderStepId = "test_booking" | "make_it_yours" | "go_live" | "hire_agent";
export type LadderInputs = {
  hasBooking: boolean;          // any non-template booking exists
  calendarConnected: boolean;   // org-level Composio googlecalendar/outlook connection
  landingVersionCount: number;  // r1 customize/version rows (>=1 means an edit happened)
  copilotEverUsed: boolean;     // any copilot conversation has >=1 user message
  domainAttached: boolean;      // organizations.settings.customDomain truthy
  shareUsed: boolean;           // settings.activation.shareUsedAt stamped
  extraAgentCount: number;      // agents beyond default chatbot AND excluding workspace_copilot
};
export type LadderStep = { id: LadderStepId; done: boolean };
export type LadderState = { steps: LadderStep[]; current: LadderStepId | null; completedCount: number };
export function computeLadderState(i: LadderInputs): LadderState;
```
Done rules: test_booking = `hasBooking` (calendarConnected is a bonus badge, not the gate); make_it_yours = `landingVersionCount >= 1 || copilotEverUsed`; go_live = `domainAttached || shareUsed`; hire_agent = `extraAgentCount >= 1`. `current` = first not-done in order, null when all done.

- [ ] **Step 1: Failing test** — 6 cases: all-false → current test_booking / 0 done; booking only → current make_it_yours; versions≥1 without copilot → step2 done; domain OR share both satisfy go_live; all done → current null, completedCount 4; copilot agent never counts toward hire_agent (encode via extraAgentCount semantics comment).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (pure, ~30 lines). **Step 4: Run** → PASS. 
- [ ] **Step 5: Commit** — `git add packages/crm/src/lib/activation/ladder.ts packages/crm/tests/unit/activation/ladder.spec.ts` → `feat(activation): pure ladder engine`.

### Task 6: Ladder inputs resolver + shared PostHog server capture + funnel events

**Files:**
- Create: `packages/crm/src/lib/analytics/capture.ts` (generic sibling of mcp-capture)
- Modify: `packages/crm/src/lib/analytics/mcp-capture.ts` (extract/reuse the client singleton — move `getClient()` into `capture.ts`, import it back; behavior identical)
- Create: `packages/crm/src/lib/activation/ladder-server.ts`
- Test: `packages/crm/tests/unit/activation/ladder-server.spec.ts` (DI'd), plus re-run `packages/crm/tests/unit/marketplace/agent-mcp-rpc.spec.ts` (mcp-capture untouched behavior)

**Interfaces:**
- Produces: `capture.ts`: `export function getPosthogClient(): PostHog | null` (the moved singleton) + `export function captureServerEvent(input: { event: string; distinctId: string; properties?: Record<string, string | number | boolean | null> }): void` (captureImmediate, fire-and-forget, no-op without key — byte-for-byte the mcp-capture delivery posture).
- `ladder-server.ts`: `export async function resolveLadderInputs(orgId: string, deps = defaultDeps): Promise<LadderInputs>` — deps: `hasBooking` (the cheap select from Scout B: `db.select({id}).from(bookings).where(and(eq(orgId), ne(status,"template"))).limit(1)`), `landingVersionCount` (`listLandingVersions(orgId,1).length` — 1 is enough for ≥1), `calendarConnected` (`listConnections(orgId)` from `@/lib/integrations/composio/client` filtered to toolkit googlecalendar/outlook, wrapped try/catch → false), `copilotEverUsed` (conversation for the copilot agent has any user message — cheap select), `domainAttached`+`shareUsed` (one org settings read), `extraAgentCount` (agents where type NOT IN (default website chatbot type, "workspace_copilot") — read the default chatbot's `type` value from `lib/agents/auto-create-website-chatbot.ts` and pin it here).
  Plus `export async function stampLadderEvent(orgId: string, step: LadderStepId): Promise<void>` — COALESCE-merge `settings.activation.<step>At = ISO now` ONLY if absent, and when it was absent also `captureServerEvent({ event: "activation_step_completed", distinctId: orgId, properties: { step } })` — the if-absent check makes funnel events fire exactly once per step per org.
- The caller (T7's server component) computes state, and for every step done-but-unstamped calls `stampLadderEvent` fire-and-forget.

- [ ] **Step 1: Failing tests** — DI: resolveLadderInputs maps dep results onto the inputs shape; calendarConnected false on dep throw; stampLadderEvent captures only when previously unstamped (stub settings read/write + capture spy).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (+ the mcp-capture extraction — its spec still green proves no drift). **Step 4: Run both specs + tsc + check-use-server** → green.
- [ ] **Step 5: Commit** — named files → `feat(activation): ladder inputs + shared posthog server capture + once-only funnel stamps`.

### Task 7: Ladder UI on the claimed-workspace hero

**Files:**
- Create: `packages/crm/src/components/activation/win-ladder.tsx` (client, presentational: receives `state: LadderState` + per-step hrefs/flags, renders 4 rows with done-check/current-highlight, each row = title, one-line payoff, CTA button; step-2 CTA fires `window.dispatchEvent(new CustomEvent("seldonchat:open"))` which the dock listens for)
- Modify: `packages/crm/src/app/(dashboard)/dashboard/page.tsx` — inside the `isFreshClaimedWorkspace` block, after the `border-t` tertiary block (insert before line ~657 close), and ALSO render for NON-fresh workspaces while `completedCount < 4` (place the same component under the populated dashboard's header when `isWinLadderOn` and the active org's ladder is incomplete — the ladder must not vanish after the first contact arrives; compute once, render in both branches)
- Modify: `packages/crm/src/components/seldon-chat.tsx` (add the `seldonchat:open` listener)
- Test: extend `packages/crm/tests/unit/activation/ladder.spec.ts` with the href-builder pure fn `ladderStepHrefs(input: { bookingUrl: string; domainSettingsUrl: string })` if extracted; keep UI logic in the pure engine.

**Interfaces:**
- Consumes: `computeLadderState` + `resolveLadderInputs` + `stampLadderEvent` (T5/T6), `isWinLadderOn`, scope variables documented at dashboard/page.tsx lines 549-576 (`activeWorkspace`, `urls`, `publicBookingUrl`, `orgId`).
- Step CTAs: test_booking → `publicBookingUrl` (open site + a "Connect your calendar" secondary → `/integrations`); make_it_yours → open SeldonChat; go_live → share row (T9 component) + domain link `/settings/domain`; hire_agent → the T10 picker.

- [ ] **Step 1-4:** Build + wire (guard every addition with `winLadderOn`; zero behavior change flag-off — assert by reading the diff), run tsc/check-use-server, `npx next build` exit 0.
- [ ] **Step 5: Commit** — named files → `feat(activation): win-ladder card on the workspace dashboard (flag-dark)`.

### Task 8: Step 1 — org-level calendar connect + booking push

**Files:**
- Create: `packages/crm/src/lib/integrations/calendar-push.ts`
- Modify: `packages/crm/src/lib/events/listeners.ts` (inside the existing `booking.created` handler, after `sendBookingCalendarInvite` ~line 415, add fire-and-forget `pushBookingToConnectedCalendar({ orgId: bookingOrgId, bookingId })`)
- Test: `packages/crm/tests/unit/integrations/calendar-push.spec.ts` (DI'd pure orchestration)

**Interfaces:**
- Consumes: `@/lib/integrations/composio/client` — READ IT FULLY FIRST. Investigation step (part of this task, 15 min): determine the tool-execution path for an ORG-level googlecalendar connection (the /integrations wave connects org-level via `listConnections(orgId)`; triggers wave executes Composio tools — find the execute/`tools.execute` call it uses). Two accepted shapes: (a) direct Composio SDK `composio.tools.execute("GOOGLECALENDAR_CREATE_EVENT", { userId: orgId, arguments: {...} })`, or (b) the MCP-session wrapper the connector runtime uses. Implement whichever the client already supports; if NEITHER supports org-level execute today, implement (a) with `composioForOrg(orgId)`.
- Produces: `export async function pushBookingToConnectedCalendar(input: { orgId: string; bookingId: string }, deps = defaultDeps): Promise<{ pushed: boolean; reason?: string }>` — no connection → `{pushed:false, reason:"no_connection"}` silently; errors swallowed + logged via existing `logEvent` (never disturb booking flow). Event payload: summary = booking title + contact name, start/end from the booking row, description links the workspace admin.
- **Known caveat to verify live (recorded in memory):** the Composio slug/response shape for calendar ops was never live-smoked. The task's final step runs ONE real push against a test org IF `COMPOSIO_API_KEY` is present locally; otherwise report "deferred to deploy smoke" explicitly.

- [ ] **Step 1: Failing test** — DI: no-connection short-circuit; connection → execute called with orgId + mapped event fields; execute throw → `{pushed:false}` and no throw.
- [ ] **Steps 2-4:** Red → implement → green + tsc/check-use-server + re-run any listeners spec.
- [ ] **Step 5: Commit** — named files → `feat(bookings): push new bookings to org-connected Google/Outlook calendar (fail-soft)`.

### Task 9: Step 3 — share assets + the $29 domain CTA

**Files:**
- Create: `packages/crm/src/lib/activation/share.ts` + `packages/crm/src/components/activation/share-row.tsx`
- Modify: `packages/crm/package.json` + root `pnpm-lock.yaml` (`pnpm --filter @seldonframe/crm add qrcode` + `pnpm --filter @seldonframe/crm add -D @types/qrcode`)
- Modify: `packages/crm/src/app/(dashboard)/settings/domain/page.tsx` — the UpsellCard CTA (line ~262): replace `href="/signup/billing?next=/settings/domain"` with a button that POSTs `{ priceId: GROWTH_BASE_PRICE_ID, successPath: "/settings/domain" }` to `/api/stripe/checkout` (client mini-island mirroring pricing-shell.tsx:103's fetch) with copy "Unlock your domain — $29/mo · one booked job pays for the year"
- Test: `packages/crm/tests/unit/activation/share.spec.ts`

**Interfaces:**
- Produces: `share.ts`: `export async function buildShareAssets(input: { siteUrl: string }): Promise<{ siteUrl: string; qrDataUrl: string }>` using `QRCode.toDataURL(siteUrl, { margin: 1, width: 240 })`; pure-ish (qrcode is deterministic). `stampLadderEvent(orgId,"go_live")` fires from the share-row server action when the user clicks copy/download (a tiny `"use server"` action `markShareUsedAction()` that stamps `settings.activation.shareUsedAt` via the T6 helper).
- share-row.tsx: copy-link button, QR `<img src={qrDataUrl}>` + download link, one-line GBP hint ("Paste this link on your Google Business Profile").

- [ ] **Step 1: Failing test** — `buildShareAssets` returns a `data:image/png` url for a known input; length sanity (>100 chars).
- [ ] **Steps 2-4:** Red → implement → green; tsc; check-use-server; build once in T11.
- [ ] **Step 5: Commit** — named files (incl. package.json + pnpm-lock.yaml) → `feat(activation): share link + QR + $29 domain checkout CTA`.

### Task 10: Step 4 — contextual agent picker

**Files:**
- Create: `packages/crm/src/lib/activation/suggest-agents.ts` + `packages/crm/src/components/activation/agent-picks.tsx`
- Test: `packages/crm/tests/unit/activation/suggest-agents.spec.ts`

**Interfaces:**
- Investigation step FIRST (in-task): read `packages/crm/src/lib/agents/skills/speed-to-lead.ts`, the review-requester skill sibling, and `lib/agents/triggers/run-event-agent.ts` + whatever create-action the /agents builder uses for event-triggered agents (grep `trigger` in `lib/agents/store.ts` + the agents builder page) — pin the exact create call `(name, skill, trigger)`.
- Produces: `suggestAgentsForIndustry(industry: string | null): { id: "review-requester" | "speed-to-lead" | "missed-call-textback"; title: string; payoff: string }[]` — pure map: health/beauty/medspa/dental → [review-requester, speed-to-lead]; trades (plumb/hvac/roof/electric) → [speed-to-lead, review-requester]; unknown → [review-requester, speed-to-lead]. (Voice receptionist appears as a third "flagship" card with href `/automations/voice-receptionist`, always, no create action.)
- `agent-picks.tsx`: two one-click cards calling a `"use server"` `enableStarterAgentAction(pick: string)` that creates the workspace event-triggered agent via the pinned rail + `stampLadderEvent(orgId, "hire_agent")`. Industry read from `organizations.soul.industry` (Scout B: `lib/soul/types.ts:69`), threaded from the dashboard server component.

- [ ] **Step 1: Failing test** — the pure map (3 industry classes + unknown fallback; always exactly 2 picks; ids from the allowed union).
- [ ] **Steps 2-4:** Red → implement → green; tsc; check-use-server.
- [ ] **Step 5: Commit** — named files → `feat(activation): contextual starter-agent picks (step 4)`.

---

# PHASE C — truth + LLM analytics (ships live, no flag)

### Task 11: /pricing truth pass

**Files:**
- Modify: `packages/crm/src/app/pricing/pricing-shell.tsx` — replace the stale `TIERS` array (lines ~31-75, $19/$49/$297) with the single real card: name "SeldonFrame", $29/mo flat, unlimited workspaces, the INCLUDED list copied from `components/landing/marketing-pricing-section.tsx:24-33`, CTA POSTs `{ priceId: GROWTH_BASE_PRICE_ID }` to `/api/stripe/checkout` (keep the existing fetch shape at line ~103; drop the three-tier selector entirely)
- Delete: `packages/crm/src/components/marketing/landing-pricing-section.tsx` (orphaned — Scout C verified zero importers; re-verify with grep before `git rm`)
- Test: run `packages/crm/tests/unit` specs matching pricing (grep first; update any that assert the old TIERS)

- [ ] **Step 1:** Grep importers of `landing-pricing-section` (expect none) + pricing specs. **Step 2:** Implement the single-card shell (import GROWTH_BASE_PRICE_ID from `@/lib/billing/price-ids`). **Step 3:** `git rm` the orphan. **Step 4:** specs green + tsc + check-use-server + `npx next build` exit 0 (route still compiles).
- [ ] **Step 5: Commit** — named files → `fix(pricing): /pricing tells the truth — one $29 flat plan on the live checkout`.

### Task 12: LLM analytics — $ai_generation on the runtime loop

**Files:**
- Create: `packages/crm/src/lib/analytics/llm-capture.ts`
- Modify: `packages/crm/src/lib/agents/runtime.ts` — around the `anthropic.messages.create` loop (~lines 318-481): time each call, then fire-and-forget capture with the response's `usage` fields
- Test: `packages/crm/tests/unit/analytics/llm-capture.spec.ts`

**Interfaces:**
- TAXONOMY STEP FIRST (in-task, like the MCP wave): scratch-install `@posthog/ai` into the scratchpad (NOT a crm dep) and read its constants — pin the event name `$ai_generation` and property names ($ai_model, $ai_input_tokens, $ai_output_tokens, $ai_latency, $ai_trace_id, $ai_span_id, $ai_provider or as found — MATCH EXACTLY what the package emits, record provenance in the file header like mcp-capture.ts does).
- Produces: `export function captureLlmGeneration(input: { distinctId: string; orgId?: string | null; model: string; inputTokens: number; outputTokens: number; latencyMs: number; traceId: string; surface: "agent" | "copilot" | "extraction" }): void` — uses `getPosthogClient()` from T6's `capture.ts`; NEVER receives prompt/completion text (enforce by type — no string content fields). Runtime wiring: traceId = conversationId; surface = "copilot" when the agent type is workspace_copilot else "agent"; wrap in try/catch, zero effect on the loop.
- [ ] **Step 1: Failing test** — property mapping (given input, the capture spy receives the pinned $ai_* keys; no key contains prompt-ish fields).
- [ ] **Steps 2-4:** Red → implement → green; re-run the runtime-adjacent specs (grep executeTurn in tests, run those files); tsc; check-use-server.
- [ ] **Step 5: Commit** — named files → `feat(analytics): $ai_generation spans on every agent LLM call`.

### Task 13: Verify gate + rollout notes

- [ ] Full suite `node scripts/run-unit-tests.js` — zero NEW failures vs the ~81 pre-existing env baseline (enumerate any new ones by file; touched-surface delta must be zero).
- [ ] `cd packages/crm && npx tsc --noEmit` zero; `bash scripts/check-use-server.sh src` clean; `npx next build` exit 0.
- [ ] Flag-off proof: grep every new render/route for the `isWinLadderOn` guard; state the list in the report.
- [ ] Rollout note appended to `.superpowers/sdd/progress.md`: Max flips `SF_WIN_LADDER=1` in Vercel (non-secret); post-deploy smokes = copilot turn ("change my headline to X" on a test org → landing version increments + preview busts), ladder renders on Metro Medspa, share QR downloads, domain CTA opens Stripe checkout for $29, `$ai_generation` + `activation_step_completed` events visible in PostHog project 497925; the Composio calendar push live-smoke (the recorded open item) on a real connected calendar.
- [ ] Commit any doc-only changes → `chore(activation): win-ladder verify gate + rollout notes`.

---

## Self-review (done at plan time)
- **Spec coverage:** ladder 4 steps (T5-T10), SeldonChat front-door + cap + Sonnet (T1-T4), domain/$29 + pricing truth (T9/T11), PostHog funnel (T6) + LLM analytics (T12), flag-dark (global + T13), calendar caveat carried (T8). Email-connect ride-along deliberately absent (spec: out of scope v1).
- **Placeholders:** none — every code step names real functions pinned by scouts; the two in-task investigation steps (T8 execute-path, T10 create-rail) are bounded lookups with both outcomes specified, not deferred design.
- **Type consistency:** LadderStepId/LadderInputs used identically in T5/T6/T7; capture.ts's `getPosthogClient` consumed by T12; `COPILOT_CAPABILITY` string identical in T1/T2/T3.
