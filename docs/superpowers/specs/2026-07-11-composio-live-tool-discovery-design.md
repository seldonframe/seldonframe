# Composio Live Tool Discovery — any toolkit bindable with real tools

**Date:** 2026-07-11 · **Branch:** `feature/composio-live-discovery` (off `feature/record-to-agent` @ `d6d1ffe07`) · **Flag:** none (authoring-time fill; inert until a non-catalog toolkit is bound)

## 0. Problem

T1/T6 (2026-07-11) made compiled + generated composio bindings self-describing by seeding
`enabledTools` from `defaultToolsForToolkits()` — but that map only covers the 8 curated
catalog toolkits. Any other Composio toolkit (e.g. `youtube`, `synthflow_ai` — both seen in
real authored agents) still resolves to **zero real tools**: `defaultToolsForToolkits(["youtube"])
=== []`, and `resolveComposioBinding` wraps exactly `enabledTools` (empty ⇒ no tools, by
contract). The long-tail authored path (`bindComposioToolkits`) is worse — it never seeds at
all. Follow catalog.ts's own comment: defaults "can be widened later by live discovery."

## 1. Verified seams (recon 2026-07-11, all under `packages/crm/src`)

| Seam | Location | Verified fact |
|---|---|---|
| Curated defaults | `lib/integrations/composio/catalog.ts` | `defaultToolsForToolkits()` → `[]` for non-catalog slugs; `isCatalogToolkit()` |
| From-recording binder | `lib/recordings/compile-agent.ts:325` `bindingForToolkit` (pure) | Seeds catalog defaults; non-catalog toolkit ⇒ `enabledTools: []`. Persisted by `app/api/v1/recordings/compile-agent/route.ts` (orgId in scope) and recompiled by `lib/recordings/continue-interview.ts` (DI module, orgId in input, persists via `deps.updateTemplate`) |
| Keyword binder | `lib/agents/generate/bind-tools.ts:83` `bindingForEntry` (pure) | Seeds catalog defaults; all shipped `TOOL_CATALOG` toolkitSlugs are currently catalog slugs |
| Long-tail binder | `lib/agents/generate/composio-resolver.ts:276` `bindComposioToolkits` (pure) | **Always** `enabledTools: []` — the youtube/synthflow_ai path. Wired via `defaultResolveCapabilities` in BOTH `lib/agents/generate/actions.ts:212` and `app/api/v1/agents/generate/route.ts:148` (near-duplicate `defaultCreate` persist seams, `builderOrgId` available) |
| Runtime contract | `lib/integrations/composio/connector.ts:92` `resolveComposioBinding` | Wraps exactly `enabledTools`; empty allowlist ⇒ zero tools. **Must not change** (the Studio editor's explicit clear-all-tools = disable depends on it) |
| Binding schema | `lib/agents/mcp/connectors.ts` | composio binding carries `tools?: McpToolSchema[]` + `discoveredAt?`; bounds `MAX_ENABLED_TOOLS=64`, `MAX_CACHED_TOOLS=128`, `.strict()` |
| Persist shape precedent | `lib/agent-templates/mcp-actions.ts:259` `setTemplateComposioToolkits` | Healthy bindings = `{enabledTools, tools[], discoveredAt}`; minimal permissive schemas are acceptable cached shapes |
| Org client | `lib/integrations/composio/client.ts:61` `composioForOrg` | Returns `null` when org has no key (BYO-else-platform) — the fail-soft gate |
| SDK tool list | `@composio/core@0.13.1` typings | `composio.tools.getRawComposioTools({toolkits:[slug], important?, limit?})` → `Tool[]{slug,name,description?,inputParameters?}`. **No existing caller in the repo** — this slice introduces the composio-side discovery |
| Connected stage | `app/(dashboard)/studio/agents/[id]/page.tsx:351`, `lifecycle/connected-toolkits.ts`, `lifecycle/connected-stage.tsx`, `lib/agent-templates/lifecycle-connect-actions.ts` | `requiredToolkitSlugs` **drops non-catalog slugs** ⇒ a youtube-only agent renders "Nothing to connect" (never-lies violation). `connectLifecycleToolkitAction` rejects non-catalog slugs (deliberate F8-era allowlist). `listConnections`/`mapToolkitConnections` filter to catalog |

## 2. Design

### 2.1 New module — `lib/integrations/composio/discover-tools.ts` (server, DI)

- `discoverToolkitToolsLive(orgId, toolkitSlug)`: real fetch via `composioForOrg(orgId)`
  (null ⇒ `[]`), then **important-first subset**: `getRawComposioTools({toolkits:[slug],
  important:true, limit:TOOLKIT_DISCOVERY_TOOL_CAP})`; empty ⇒ fall back to the full list with
  the same cap. `TOOLKIT_DISCOVERY_TOOL_CAP = 20` (conservative; "or all if small" — a toolkit
  with ≤20 tools returns whole). Map `Tool` → `McpToolSchema` (`name=slug`, description
  fallback `"Composio tool <slug>."`, `inputSchema=inputParameters ?? permissive default`).
  Fail-soft `[]` on any SDK/shape error; never throws; key never logged.
- `fillComposioBindingTools(orgId, connectors, deps?)` → `{connectors, changed}`:
  for each `kind:"composio"` binding, **only when `enabledTools.length === 0 && !discoveredAt`**
  (the never-discovered resting state — `discoveredAt` set + empty allowlist is the editor's
  explicit disable and is untouched):
  1. catalog defaults for its `enabledToolkits` (free, pure);
  2. live discovery (`deps.listToolkitTools`, default = `discoverToolkitToolsLive`) for each
     toolkit with no catalog defaults;
  3. union → dedupe → cap at `MAX_ENABLED_TOOLS`; cached `tools[]` = live schemas capped at
     `MAX_CACHED_TOOLS`; stamp `discoveredAt` iff the binding changed.
  A binding that still resolves to zero tools is returned byte-identical (no `discoveredAt`),
  so the next authoring encounter retries. Never throws. Org-scoped by construction (orgId is
  the caller's authed org at every site).

### 2.2 Pure-layer parity (tiny)

`bindComposioToolkits` seeds `enabledTools: defaultToolsForToolkits([slug])` like its two
siblings (T6 parity — same bug class). Non-catalog slugs still yield `[]` there; the fill
helper is what widens them.

### 2.3 Wire the fill at the four authoring/persist seams (I/O layer)

1. `app/api/v1/recordings/compile-agent/route.ts` — after `flowModelToBundle`, before
   `updateAgentTemplate`.
2. `lib/recordings/continue-interview.ts` — new optional dep `fillConnectors` (default:
   identity), applied to the recompiled bundle; real impl wired in the thin action wrapper.
3. `lib/agents/generate/actions.ts` `defaultCreate` + `app/api/v1/agents/generate/route.ts`
   `defaultCreate` — fill `input.blueprint.connectors` before persisting.
4. Agent page Connected stage (self-heal for existing rows): when the template has an
   undiscovered composio binding, run the fill and persist via `updateAgentTemplate`
   (idempotent — guards in 2.1 make re-renders no-ops), then render from the filled list.

### 2.4 Honest Connected stage for non-catalog toolkits

- `requiredToolkitSlugs`: stop dropping non-catalog slugs (normalize + dedupe only) — a
  youtube-only agent must never render "Nothing to connect".
- `listConnections(orgId, {extraToolkits})` + `mapToolkitConnections(items, extraAllowed?)`:
  request/report status for the template's non-catalog toolkits too (fail-soft: absent ⇒
  not connected).
- `createConnectLink(orgId, toolkit, …)`: include the requested toolkit in the
  `ensureSession` toolkit list (dedupe with catalog slugs).
- `connectLifecycleToolkitAction`: widen the allowlist from catalog-only to
  **catalog ∪ the org-guarded template's own composio `enabledToolkits`** — the operator can
  only connect what their own agent binds; an arbitrary slug still can't be forced through
  authorize (preserves the F8 guard's intent).
- No-key messaging: unchanged card ("add your Composio key → /integrations") now also covers
  non-catalog-required agents because those slugs appear in `requiredToolkits`.

### 2.5 Contracts kept

- `resolveComposioBinding` untouched (empty allowlist = disabled).
- Default-fill happens ONLY at authoring/discovery time, marker-guarded (`enabledTools` empty
  AND no `discoveredAt`).
- All fills fail-soft; no authoring path gains a new failure mode when the org has no key.
- No migration (all jsonb); no new env.

## 3. Testing (TDD, DI — no live API in unit tests)

- `discover-tools.spec.ts`: injected `listToolkitTools`; no-key ⇒ catalog-only fill;
  important-first + fallback subset logic (tested via the exported live-fetch's own DI or by
  factoring the subset picker pure); explicit-disable untouched; already-seeded untouched;
  caps enforced; per-toolkit failure isolation; never throws; `changed` accuracy.
- Site wiring tests: compile route (existing route spec harness), continue-interview core
  (fake `fillConnectors`), generate `defaultCreate` fill (extract or test via run-generate
  deps), page-level derivations (`requiredToolkitSlugs` non-catalog inclusion),
  `mapToolkitConnections` extra-allowlist, `connectLifecycleToolkitAction` widened allowlist
  (extend the F8 spec).
- L-06: live smoke items named at close: (a) `getRawComposioTools` important-filter behavior
  against the real API, (b) `authorize(<non-catalog toolkit>)` on a session — both fail-soft
  if they misbehave.

## 4. Estimate (L-17)

Adapter/composition on external SDK (~1.0-1.3x): discovery module ~180 prod / ~300 test;
wiring ~120 prod / ~250 test; Connected-stage honesty ~100 prod / ~200 test.
**Total ≈ 1,100-1,250 LOC.** Stop-and-reassess at ~1,600.

## 5. Out of scope

Re-discovery/refresh UI for composio bindings · widening `tools[]` schemas for catalog
defaults (runtime already falls back to permissive) · per-deployment entity-scoped discovery ·
trigger discovery for non-catalog toolkits.
