# Composio Integration (Core: per-workspace managed OAuth + in-product Connect + triggers) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development for the pure logic. Steps use `- [ ]`. Branch `feature/composio-integration` (off `main`). **No money moves. Likely NO migration** (sessions → `workspace_secrets`, agent binding → blueprint jsonb, triggers → `workflow_event_log`). Adds ONE dependency `@composio/core`. **Max's gate to merge** (new external dep + credential handling + new runtime tool path). Max adds `COMPOSIO_API_KEY` (+ later `COMPOSIO_WEBHOOK_SECRET`) to Vercel (CRM project) himself — NEVER take raw key values.

**Goal:** Give every SeldonFrame workspace a per-workspace Composio session so its agents can act across 1000+ real apps (the operator's actual Gmail, Calendar, Slack, HubSpot, QuickBooks, Notion, Outlook…), with managed OAuth connected **in-product** ("Connect Gmail" button), and inbound app events (new Gmail, etc.) driving the existing event-triggered archetype agents. Decisions (Max): **platform key + BYO override · Core managed-OAuth (Composio-branded consent for now) · triggers in v1.**

**Architecture:** A server-only Composio adapter (`@composio/core`, Node runtime) resolves the key (BYO secret else platform env, mirroring `getAIClient`), ensures/reuses a per-workspace session keyed by `user_id = organizations.id`, and exposes `{ mcpUrl, mcpHeaders }`. A new first-class **`composio` connector kind** on the agent blueprint resolves that live session at runtime and merges its tools through the EXISTING `getToolsForCapabilities` seam — after a one-line extension to the inline MCP client so it forwards `session.mcp.headers` (`{ 'x-api-key': … }`) instead of a hardcoded `Authorization: Bearer`. A `/integrations` dashboard drives Connect Links. A signed webhook bridges Composio triggers → `emitSeldonEvent` → the archetype dispatcher.

**Spike facts (cited, locked):** SDK `@composio/core`, Node runtime only. `const composio = new Composio({ apiKey })`. `composio.create(userId, { toolkits })` → `{ sessionId, mcp:{ type:'http', url, headers } }`; reuse `composio.use(sessionId)` (re-create on 404). **`session.mcp.headers === { 'x-api-key': <key> }`** (NOT Bearer; `require_mcp_api_key` ON by default). `session.authorize(toolkit, { callbackUrl })` → `connectionRequest.redirectUrl`; callback appends `status` + `connected_account_id`. `session.toolkits()` → items `{ slug, name, logo, isNoAuth, connection?:{ isActive, authConfig:{id,mode,isComposioManaged}, connectedAccount?:{id,status} } }`. `composio.connectedAccounts.delete(id)`. Webhook subscribe (one-time REST): `POST https://backend.composio.dev/api/v3.1/webhook_subscriptions` `{ webhook_url, enabled_events:["composio.trigger.message"] }` → returns `secret`. `composio.triggers.create(userId, slug, { triggerConfig })`. Webhook V3 payload: `{ id, type, metadata:{ trigger_slug, trigger_id, connected_account_id, user_id }, data, timestamp }`. Signature: headers `webhook-id`/`webhook-signature`/`webhook-timestamp`; signing string `` `${id}.${ts}.${rawBody}` ``; `HMAC-SHA256` → base64; received = `sig.split(',')[1] ?? sig`; `timingSafeEqual`; tolerance 300s; secret used as-is. The 7 toolkits are all Composio-managed (no per-toolkit OAuth setup). `user_id` = arbitrary string → a uuid is safe; isolation is per `user_id` under one project.

**Recon anchors (verified):** inline MCP client `packages/crm/src/lib/agents/mcp/client.ts` (`createMcpClient({endpoint, bearer, …})`, line 142; sends only `Authorization: Bearer` at 172-176). Connector types `packages/crm/src/lib/agents/mcp/connectors.ts` (`ConnectorBinding` union 35-57; `VETTED_CONNECTORS` 73-93 incl. `rube`). Runtime merge `packages/crm/src/lib/agents/tools.ts` `getToolsForCapabilities` (line 1469; returns `[...native, ...wrapped]` at 1499; `defaultMcpDeps()` 1442; secret read `getSecretValue({workspaceId:orgId, serviceName, skipAccessCheck:true})` 1445-1451). Wrap `packages/crm/src/lib/agents/mcp/wrap-tool.ts` (`ctx.orgId`). Secrets `packages/crm/src/lib/secrets.ts` (`storeSecret`/`getSecretValue` keyed `(workspaceId, scope, serviceName)`; `rotateSecret` DELETES — use `storeSecret` to overwrite). Key fallback pattern `packages/crm/src/lib/ai/client.ts` (`resolveAgentKeyStatusFromInputs` 134-152; platform env `process.env.ANTHROPIC_API_KEY`). Identity `organizations.id` (uuid) via `getOrgId()` (`lib/auth/helpers.ts:56`) / `ctx.orgId` (runtime). Event bus `emitSeldonEvent(type, data, { orgId })` (`lib/events/bus.ts:61`); custom `${string}.${string}` event types allowed (`packages/core/src/events/index.ts`); archetype dispatch `dispatchEventToDeployedAgents` (`lib/agents/dispatcher.ts:79`); listener bridge `lib/events/listeners.ts:54+`. `get_workspace_state` configured probe `app/api/v1/workspace-state/route.ts:67` (store B only).

**Tech:** Next.js 16, `node --import tsx --test`. Tests `cd packages/crm && node --import tsx --test <files>`; tsc 0-new; `bash scripts/check-use-server.sh src`. **Every file that imports `@composio/core` or a route that handles its webhook MUST `export const runtime = 'nodejs'`.**

**Curated toolkit catalog (v1):** `gmail, googlecalendar, googledrive, slack, notion, hubspot, quickbooks, outlook` (all managed-auth). Display names + logos in a constant.

---

## Phase 0 — Composio adapter + key resolver (server-only)

### Task 0.1: Add the dependency + verify the build survives it
- [ ] `cd packages/crm && pnpm add @composio/core`. Then `pnpm -C packages/crm typecheck` and a `pnpm -C packages/crm build` (or `next build`) smoke to PROVE the dep doesn't break the Vercel build (the repo is dep-averse; this is the gate). If the build breaks irrecoverably, STOP and report — fall back to a REST-over-fetch adapter (base `https://backend.composio.dev/api/v3` + `/api/v3.1`, header `x-api-key`).
- [ ] **Commit** `chore(composio): add @composio/core dependency (build verified)`.

### Task 0.2: Pure key resolver (TDD)
**Files:** `packages/crm/src/lib/integrations/composio/keys.ts` + test.
- [ ] Pure `resolveComposioKeyFromInputs(byoKey: string | null, platformKey: string | null): { apiKey: string | null; source: "byo" | "platform" | "none" }` — byo wins, else platform, else none. Mirror `resolveAgentKeyStatusFromInputs`.
- [ ] DB-bound `resolveComposioKey(orgId): Promise<{ apiKey, source }>` = `resolveComposioKeyFromInputs(await getSecretValue({workspaceId:orgId, serviceName:"composio", skipAccessCheck:true}), process.env.COMPOSIO_API_KEY ?? null)`.
- [ ] TDD the pure resolver (byo/platform/none). Run→fail→implement→pass.
- [ ] **Commit** `feat(composio): key resolver — BYO secret else platform env (TDD)`.

### Task 0.3: The adapter (DI, Node runtime)
**Files:** `packages/crm/src/lib/integrations/composio/catalog.ts` (the 8-toolkit catalog: slug, label, logo, the trigger slug(s) per toolkit e.g. `gmail → GMAIL_NEW_GMAIL_MESSAGE`), `packages/crm/src/lib/integrations/composio/client.ts` (`"server-only"` import or a `// node runtime` note — do NOT add `"use server"`; this exports non-async values).
- [ ] `composioForOrg(orgId): Promise<Composio | null>` — `resolveComposioKey` → `new Composio({ apiKey })` or null.
- [ ] `ensureSession(orgId, toolkits): Promise<{ sessionId, mcpUrl, mcpHeaders } | null>`: read stored `composio_session` secret; if present `composio.use(sessionId)` (catch 404/error → recreate); else `composio.create(orgId, { toolkits })`; on (re)create `storeSecret({workspaceId:orgId, serviceName:"composio_session", value:sessionId})`. Return `{ sessionId, mcpUrl: session.mcp.url, mcpHeaders: session.mcp.headers }`. NOTE: if `toolkits` changed vs the stored session you may re-`create` (sessions are cheap; a new session id overwrites the secret).
- [ ] `listConnections(orgId): Promise<ToolkitConnection[]>` — `session.toolkits()` mapped to `{ slug, name, logo, connected: connection?.isActive ?? false, connectedAccountId: connection?.connectedAccount?.id }`, filtered to the catalog.
- [ ] `createConnectLink(orgId, toolkit, callbackUrl): Promise<{ redirectUrl }>` — `session.authorize(toolkit, { callbackUrl })`.
- [ ] `disconnect(orgId, connectedAccountId): Promise<void>` — `composio.connectedAccounts.delete(connectedAccountId)`.
- [ ] `createTrigger(orgId, triggerSlug, triggerConfig?): Promise<{ triggerId }>` — `composio.triggers.create(orgId, triggerSlug, { triggerConfig })`.
- [ ] Keep ALL secret values server-side; never log the key. Make the heavy methods accept an injected client for testability where reasonable (light DI; full network methods can stay untested — note the gap in the report).
- [ ] **Commit** `feat(composio): per-workspace session adapter (ensure/list/connect/disconnect/trigger)`.

## Phase 1 — Inline MCP client headers map + `composio` connector kind at runtime

### Task 1.1: Extend the inline MCP client to forward a headers map (TDD)
**Files:** `packages/crm/src/lib/agents/mcp/client.ts` + its spec.
- [ ] Add optional `headers?: Record<string, string>` to `CreateMcpClientOptions`. In the request header builder (~line 172): start from `{ "content-type": "application/json", accept: "application/json, text/event-stream", ...(options.headers ?? {}) }`; KEEP the existing `Authorization: Bearer ${bearer}` ONLY when `bearer` is non-empty (so existing vetted/byo connectors are byte-for-byte unchanged), and make `bearer` optional. The auto-managed `mcp-session-id` echo stays. Result: Composio passes `headers: { 'x-api-key': … }` + empty bearer; existing connectors pass `bearer` + no headers.
- [ ] TDD: with `headers` set + no bearer, the request carries `x-api-key` and NO `Authorization`; with `bearer` + no headers, unchanged (Authorization present). Run→fail→implement→pass.
- [ ] **Commit** `feat(mcp-client): forward a headers map (enables Composio x-api-key auth; bearer path unchanged, TDD)`.

### Task 1.2: `composio` connector binding + runtime resolution (TDD pure, wire seam)
**Files:** `packages/crm/src/lib/agents/mcp/connectors.ts` (extend the `ConnectorBinding` union), `packages/crm/src/lib/agents/tools.ts` (resolve composio bindings in `getToolsForCapabilities`), a small resolver `packages/crm/src/lib/integrations/composio/connector.ts`.
- [ ] Add to `ConnectorBinding` a third variant: `{ id: string; kind: "composio"; enabledToolkits: string[]; enabledTools: string[]; tools?: McpToolSchema[]; discoveredAt?: string }`. Update `connectorBindingSchema` (zod) + caps. The composio binding carries NO endpoint/secret (resolved live).
- [ ] In `getToolsForCapabilities` (`tools.ts:1469`): preserve the no-connectors fast path EXACTLY. For a `composio` binding, lazy-resolve at runtime: `ensureSession(ctx-orgId, binding.enabledToolkits)` → `createMcpClient({ endpoint: mcpUrl, headers: mcpHeaders, bearer: "" })` → `listTools()` → wrap only `enabledTools` (allowlist), namespaced `composio__<tool>`. Reuse the existing `wrapMcpTool` machinery; the only difference from vetted/byo is the dynamic endpoint+headers (from the session, not the secret store). orgId comes from the same place the existing path gets it (the execute-time `ctx.orgId`; for the discovery/list call use `opts.orgId` if present else defer to execute — match the existing pattern; if the existing path only has orgId at execute time, resolve the session lazily inside the wrapped tool's executor like the others).
- [ ] **Money/safety note in code:** the composio path must hard-fail closed if `resolveComposioKey` returns none (no platform key + no BYO) → the agent simply gets its native tools (no throw, no crash). Preserve the regression invariant.
- [ ] TDD the pure parts: the new binding shape validates; a composio binding with empty enabledTools yields no wrapped tools; the no-connectors invariant still returns the identical native list. (The live session/list call can be DI-stubbed.) Run→fail→implement→pass; tsc 0-new; check-use-server clean.
- [ ] **Commit** `feat(composio): first-class composio connector kind resolved per-workspace at runtime (TDD)`.

## Phase 2 — `/integrations` dashboard (in-product Connect)

**Files:** `packages/crm/src/app/(dashboard)/integrations/page.tsx` (`export const runtime = "nodejs"`), `…/integrations/actions.ts` (`"use server"`), nav entry (`nav-config` + its spec), an `IntegrationsClient` component.
- [ ] Server actions (org-guarded via `getOrgId()`): `listComposioConnectionsAction()` → `listConnections(orgId)`; `connectComposioToolkitAction(toolkit)` → `createConnectLink(orgId, toolkit, callbackUrl="https://app.seldonframe.com/integrations?connected="+toolkit)` → return `{ redirectUrl }`; `disconnectComposioToolkitAction(connectedAccountId)` → `disconnect(orgId, id)`.
- [ ] Page: a grid of the 8 catalog toolkits with logo + name + Connected/Connect/Disconnect. "Connect" → call action → `window.location = redirectUrl`. On return, the `?connected=`/`?status=` params show a success toast and re-fetch. If `resolveComposioKey` is none AND no platform key, show a "BYO Composio key" inline field that `storeSecret(serviceName:"composio")` (an action) — the BYO override UI.
- [ ] **Commit** `feat(composio): /integrations dashboard — connect/disconnect apps via managed OAuth`.

## Phase 3 — Studio per-agent toolkit/tool picker

**Files:** `packages/crm/src/app/(dashboard)/studio/agents/[id]/editor-client.tsx` (extend `ConnectorsCard` ~line 614), the template-scoped bind action (`lib/agent-templates/template-mcp-server.ts`) — add a composio path that writes a `kind:"composio"` binding.
- [ ] Add a "Composio apps" sub-section to the Connectors & Tools card: multiselect the catalog toolkits to enable for THIS agent → persist a single `composio` binding (`enabledToolkits`, and `enabledTools` defaulting to a discovered/allow set). Reuse the existing bind/persist plumbing (it already writes `blueprint.connectors`). Tool-level enable can reuse the existing `ConnectorRow`.
- [ ] Honesty: keep the existing voice-template warning (connectors don't run on calls).
- [ ] **Commit** `feat(composio): Studio per-agent Composio toolkit picker (writes composio binding)`.

## Phase 4 — Triggers → SeldonEvent → archetype dispatch

### Task 4.1: Signed webhook receiver (TDD the pure verify + mapping)
**Files:** `packages/crm/src/app/api/webhooks/composio/route.ts` (`export const runtime = "nodejs"`), pure helpers `packages/crm/src/lib/integrations/composio/webhook.ts` + spec.
- [ ] Pure `verifyComposioSignature({ id, timestamp, rawBody, signatureHeader, secret, now })`: signing string `` `${id}.${timestamp}.${rawBody}` ``; `crypto.createHmac('sha256', secret).update(s).digest('base64')`; `received = signatureHeader.split(',')[1] ?? signatureHeader` (handle space-separated multi-sig — split on space, check each); `timingSafeEqual`; reject if `|now - ts*1000| > 300_000`. Returns boolean.
- [ ] Pure `composioEventToSeldon(payload)`: from V3 `{ metadata:{ user_id, trigger_slug, connected_account_id }, data }` → `{ orgId: metadata.user_id, type: "composio." + slugToType(trigger_slug), data: { ...data, _composio: { triggerSlug, connectedAccountId } } }` where `slugToType("GMAIL_NEW_GMAIL_MESSAGE") = "gmail.new_message"` (lowercased, toolkit-prefixed).
- [ ] Route: read RAW body (`await request.text()`), verify signature (secret = `process.env.COMPOSIO_WEBHOOK_SECRET`; if unset → 503 "not configured" so it fails loud, never silently accepts), parse, map, and `emitSeldonEvent(type, data, { orgId })`. Always 200 on a verified event even if no agent matches (so Composio doesn't retry-storm).
- [ ] TDD verify (valid/tampered/expired/multi-sig) + the mapping (slug→type, user_id→orgId). Run→fail→implement→pass.
- [ ] **Commit** `feat(composio): signed trigger webhook → SeldonEvent (HMAC verify + mapping, TDD)`.

### Task 4.2: Bridge composio events to the archetype dispatcher + trigger registration UI
**Files:** `packages/crm/src/lib/events/listeners.ts` (add a `composio.*` bridge), `/integrations` UI + action for enabling a trigger, one example archetype trigger.
- [ ] In `registerCrmEventListeners`, add a catch-all-ish bridge: `bus.on` for the composio event types the catalog can emit (or a wildcard if the bus supports it; else register each `composio.<toolkit>.<event>` the catalog declares) → `dispatchEventToDeployedAgents({ orgId, triggerEventType, triggerEventId, triggerPayload, matcherPlaceholder, matcherValue })` exactly like the `booking.created` bridge. This makes any deployed agent whose `specTemplate.trigger = { type:"event", event:"composio.gmail.new_message" }` fire.
- [ ] `/integrations` per-connected-app: surface the catalog's available trigger(s) for that toolkit with an Enable toggle → `enableComposioTriggerAction(toolkit, triggerSlug)` → `createTrigger(orgId, triggerSlug)`. (Source of truth = Composio; no new table.)
- [ ] Document (in the report) the ONE-TIME platform setup: Max (or a `scripts/` action) calls `POST /api/v3.1/webhook_subscriptions { webhook_url:"https://app.seldonframe.com/api/webhooks/composio", enabled_events:["composio.trigger.message"] }` once → copies the returned `secret` into Vercel as `COMPOSIO_WEBHOOK_SECRET`.
- [ ] **Commit** `feat(composio): bridge composio.* events to archetype dispatch + trigger-enable UI`.

## Phase 5 — `configured` surfacing + verify + report

- [ ] Add `composio: { configured }` to `get_workspace_state` (`workspace-state/route.ts`): configured = (platform `COMPOSIO_API_KEY` set OR a `composio` BYO secret exists) AND at least one connected account — or simply "a session secret exists". Keep it cheap; document what it means.
- [ ] Verify: all composio specs green; full unit suite no NEW failures; `pnpm -C packages/crm typecheck` 0-new; `check-use-server` clean; `git status` shows NO `.sql` (no migration). Confirm the no-connectors agent path is byte-for-byte unchanged (the regression invariant).
- [ ] **Report:** new files; the per-workspace session + key-resolution flow; the inline-client headers change (quote it); how a composio binding merges at runtime; the /integrations connect flow; the trigger webhook + signature + the SeldonEvent→archetype path; new-test count; typecheck/check-use-server; confirmation of NO migration + NO money; and the **go-live steps for Max** (add `COMPOSIO_API_KEY` to Vercel CRM; subscribe the webhook once + add `COMPOSIO_WEBHOOK_SECRET`; optional white-label = register own OAuth apps per toolkit later). Note deferred: white-label OAuth apps; cost metering/limits UI; per-agent connected-account selection.

## Self-Review
- Platform-key-with-BYO ✓ (resolver mirrors getAIClient). Per-workspace session keyed by org uuid ✓. Reuses the existing connector seam + secret store ✓ (only net-new: headers-map on the client + a composio binding kind). Managed OAuth in-product ✓. Triggers → existing event bus + dispatcher ✓. No migration ✓. No money ✓. One new dep (build-verified in 0.1) ✓.
- Regression invariant (no-connectors → identical native tools) preserved + tested ✓.
- Deferred (documented): white-label OAuth apps (consent says Composio until then); usage/cost UI; multi-account selection; non-curated toolkits (discovery can extend later).
