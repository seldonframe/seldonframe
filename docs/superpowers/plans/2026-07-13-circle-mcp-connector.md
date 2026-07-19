# Circle MCP Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Circle's official MCP server (`https://app.circle.so/api/mcp`) as an OAuth-authenticated vetted connector, findable at agent creation exactly like Composio toolkits.

**Architecture:** Extend the existing vetted-MCP rail (inline MCP client + `workspace_secrets` bearer storage) with an inline OAuth 2.1 client module (RFC 8414 discovery → RFC 7591 DCR → PKCE S256 → token envelope stored as the connector's secret). A credential resolver makes OAuth envelopes look like plain bearers to every existing consumer. Discovery fill for vetted bindings mirrors the stacked branch's marker-guarded composio fill via a combined `fillAllBindingTools` swapped in at the 5 existing call sites.

**Tech Stack:** TypeScript, Next.js App Router (Node runtime), zod, node:crypto, vitest-style specs run via `node scripts/run-unit-tests.js`. NO new npm dependencies (L-17 worktree rule). NO DB migrations.

**Read first:** `docs/superpowers/specs/2026-07-13-circle-mcp-connector-design.md` (the spec; contains the verified Circle probe results and all code anchors).

## Global Constraints

- Branch `feature/circle-mcp-connector` in worktree `.claude/worktrees/circle-mcp` (stacked on `feature/composio-live-discovery`). All paths below are relative to `packages/crm/` in that worktree unless prefixed.
- NO new npm dependencies; NO DB migrations; NO edits to files owned by the stacked branch except the explicitly listed one-line call-site swaps.
- Secrets/tokens: never logged, never sent to the client, never in fixtures with real-looking formats (L-28: use format-breaking fakes like `"fake-access-token-NOT-REAL"`).
- Every jsonb/SQL identifier from input = bound parameter (L-03/L-04) — this slice should need none.
- Route files export HTTP verbs/config ONLY (L-31); logic lives in `lib/`.
- Org scoping: every secret read/write keys on the caller's authed org; the OAuth callback MUST verify the session org equals the cookie's org.
- Fail-soft discovery: a Circle outage must never break agent generation (mirror `fillComposioBindingTools` semantics exactly).
- Unit tests are offline: DI fakes for fetch/secrets/clock; no network, no DB.
- Run tests from repo root of the worktree: `node scripts/run-unit-tests.js <spec-path>` (judge by delta vs baseline, not absolute count — pre-existing failures exist).
- Commit after every task with the exact message given (append the standard `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer).

---

### Task 1: OAuth protocol module — discovery, DCR, PKCE, exchange, refresh, envelope

**Files:**
- Create: `packages/crm/src/lib/agents/mcp/oauth.ts`
- Test: `packages/crm/tests/unit/mcp-oauth.spec.ts` (mirror sibling spec file conventions — check `packages/crm/tests/unit/` for an existing spec that fakes `fetch` and copy its harness idioms)

**Interfaces (Produces — later tasks rely on these exact names):**

```typescript
export type AsMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  code_challenge_methods_supported?: string[];
  scopes_supported?: string[];
};
export type TokenEnvelope = {
  v: 1;
  kind: "oauth";
  access_token: string;
  refresh_token?: string;
  /** Epoch ms when access_token expires (absent = treat as non-expiring). */
  expires_at?: number;
  scope?: string;
  token_endpoint: string;
  client_id: string;
  client_secret?: string;
  obtained_at: number;
  /** Set by the callback's fail-soft tools probe; display-only. */
  discovered_tools_count?: number;
};
export const tokenEnvelopeSchema: z.ZodType<TokenEnvelope>; // zod object, strict on v/kind literals
export function parseTokenEnvelope(raw: string): TokenEnvelope | null; // JSON.parse + safeParse; null on any failure
export function generatePkcePair(): { verifier: string; challenge: string }; // base64url, S256
export function generateStateToken(): string; // 32 random bytes, base64url
export async function discoverAuthServer(mcpEndpoint: string, deps?: { fetchImpl?: typeof fetch }): Promise<AsMetadata>;
export async function registerClient(input: { metadata: AsMetadata; redirectUri: string; clientName: string; fetchImpl?: typeof fetch }): Promise<{ client_id: string; client_secret?: string }>;
export function buildAuthorizeUrl(input: { metadata: AsMetadata; clientId: string; redirectUri: string; scopes: string[]; state: string; codeChallenge: string }): string;
export async function exchangeCode(input: { tokenEndpoint: string; clientId: string; clientSecret?: string; code: string; codeVerifier: string; redirectUri: string; fetchImpl?: typeof fetch; now?: () => number }): Promise<TokenEnvelope>;
export async function refreshTokens(input: { envelope: TokenEnvelope; fetchImpl?: typeof fetch; now?: () => number }): Promise<TokenEnvelope>;
```

**Implementation notes (complete behaviors — transcribe, don't improvise):**

- Header comment: mirror `client.ts`'s WHY-inline style — "inline OAuth 2.1 client (RFC 8414 discovery, RFC 7591 DCR, PKCE S256); SDK not in lockfile (L-17)". Ground with the Circle probe facts from the spec §1.
- `base64url(buf)`: `Buffer.from(buf).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")`.
- `generatePkcePair`: verifier = base64url(`crypto.randomBytes(32)`); challenge = base64url(`crypto.createHash("sha256").update(verifier).digest()`).
- `discoverAuthServer(mcpEndpoint)`:
  1. HTTPS-guard the endpoint (throw on non-https, mirror `assertHttps` in `client.ts:108`).
  2. Try, in order (10s AbortController timeout each, `Accept: application/json`):
     a. RFC 9728: `{origin}/.well-known/oauth-protected-resource{pathname}` then `{origin}/.well-known/oauth-protected-resource` — if a response is HTTP 200 AND `content-type` includes `application/json` AND parses to an object with a non-empty `authorization_servers: string[]`, use `authorization_servers[0]` as the issuer for step b2.
     b. RFC 8414 at the issuer: `{issuer-origin}/.well-known/oauth-authorization-server` (b2 = discovered issuer; b1/default = the MCP endpoint's own origin, which is what Circle uses today).
  3. A response only counts if 200 + JSON content-type + zod-parses to `AsMetadata` (require `issuer`, `authorization_endpoint`, `token_endpoint` as valid https URLs). **Circle's `/.well-known/oauth-protected-resource` returns 200 HTML (SPA fallback) — the content-type + shape guard is what saves us; write an explicit test for it.**
  4. All candidates failed → throw `Error("MCP auth discovery failed for <origin>: no valid OAuth metadata")`.
- `registerClient`: POST `metadata.registration_endpoint` with JSON body `{ client_name: input.clientName, redirect_uris: [input.redirectUri], grant_types: ["authorization_code"], response_types: ["code"], token_endpoint_auth_method: "none", scope: undefined }`. If the AS metadata's `token_endpoint_auth_methods_supported` exists and does NOT include `"none"`, send `"client_secret_post"` instead. Accept 200/201; zod-parse response for `client_id` (string, required) + `client_secret` (optional). No `registration_endpoint` in metadata → throw (Circle has one; other servers may need pre-registered clients — explicit error text tells the operator).
- `buildAuthorizeUrl`: `new URL(metadata.authorization_endpoint)` + searchParams: `response_type=code`, `client_id`, `redirect_uri`, `scope=scopes.join(" ")`, `state`, `code_challenge`, `code_challenge_method=S256`. Return `url.toString()`.
- `exchangeCode` / `refreshTokens`: POST token endpoint, `Content-Type: application/x-www-form-urlencoded`, body via `new URLSearchParams`. exchange: `grant_type=authorization_code, code, redirect_uri, code_verifier, client_id` (+ `client_secret` when present). refresh: `grant_type=refresh_token, refresh_token, client_id` (+ secret). Non-2xx → throw with status + a SANITIZED body note (first 200 chars, and only after stripping anything matching `/[A-Za-z0-9_\-\.]{20,}/g` → `"…"` — never echo tokens). Parse JSON `{access_token (required string), token_type?, expires_in?, refresh_token?, scope?}`; missing access_token → throw. Build envelope: `expires_at = expires_in ? now() + expires_in*1000 : undefined`; refresh keeps the OLD `refresh_token` when the response omits one (rotation-optional per RFC 6749 §6), carries over `client_id/client_secret/token_endpoint`, sets fresh `obtained_at`.

- [ ] **Step 1:** Write `tests/unit/mcp-oauth.spec.ts` covering: PKCE pair shape (verifier 43 chars base64url, challenge = S256 of verifier — recompute in test); state token uniqueness/shape; discovery happy path via fake fetch serving Circle-shaped 8414 JSON; **discovery rejects 200-HTML protected-resource then falls back to issuer-root metadata (the Circle case)**; discovery total-failure throws; DCR happy path + auth-method downgrade when `"none"` unsupported + missing registration_endpoint throws; authorize URL contains all 7 params; exchange happy path builds envelope with computed `expires_at` (inject `now`); exchange non-2xx throws WITHOUT leaking a `fake-secret-value-NOT-REAL` token planted in the fake body; refresh rotates when response has new refresh_token and preserves old one when omitted; `parseTokenEnvelope` round-trip + null on garbage/plain-bearer strings.
- [ ] **Step 2:** Run `node scripts/run-unit-tests.js packages/crm/tests/unit/mcp-oauth.spec.ts` — expect FAIL (module missing).
- [ ] **Step 3:** Implement `lib/agents/mcp/oauth.ts` per the interface + notes above.
- [ ] **Step 4:** Re-run the spec — expect PASS.
- [ ] **Step 5:** Commit: `feat(mcp): inline OAuth client — RFC 8414 discovery, DCR, PKCE, token envelope`

### Task 2: OAuth-aware bearer resolver + wire into runtime deps

**Files:**
- Create: `packages/crm/src/lib/agents/mcp/resolve-bearer.ts`
- Modify: `packages/crm/src/lib/agents/tools.ts` (~1896–1905: the default `WrapMcpDeps` builder — `getSecret` currently returns the raw secret; route it through the resolver)
- Modify: `packages/crm/src/lib/agent-templates/mcp-actions.ts` (`bindTemplateConnector` at :80 — its bind-time `listTools` bearer must resolve through the same function; grep this file for its `getSecretValue` call and swap)
- Test: `packages/crm/tests/unit/mcp-resolve-bearer.spec.ts`

**Interfaces:**
- Consumes: `parseTokenEnvelope`, `refreshTokens`, `TokenEnvelope` (Task 1).
- Produces:

```typescript
export type ResolveBearerDeps = {
  getSecretValue: (input: { workspaceId: string; serviceName: string; skipAccessCheck?: boolean }) => Promise<string | null>;
  storeSecret: (input: { workspaceId: string; serviceName: string; value: string }) => Promise<unknown>;
  fetchImpl?: typeof fetch;
  now?: () => number;
};
/** Resolve the Authorization bearer for a vetted/byo MCP binding's secret.
 *  Plain string secret → returned verbatim (postiz/rube unchanged).
 *  OAuth envelope → access token, proactively refreshed (60s skew) and
 *  re-persisted when a refresh_token exists; single-flight per org+service.
 *  Unusable (expired w/o refresh, refresh fails, malformed envelope) → null. */
export async function resolveConnectorBearer(orgId: string, serviceName: string, deps?: Partial<ResolveBearerDeps>): Promise<string | null>;
```

**Implementation notes:**
- Default deps import the real `getSecretValue`/`storeSecret` from `@/lib/secrets` (signatures verified: object-arg, `skipAccessCheck: true` for runtime reads — copy the existing pattern in `tools.ts`'s current default `getSecret`).
- Raw secret `null` → `null`. Raw not starting with `"{"` → return raw (legacy bearer). Starts with `"{"` but `parseTokenEnvelope` → null → return `null` (malformed envelope = unusable; DO NOT silently pass the raw JSON as a bearer).
- Envelope fresh (`!expires_at || expires_at - now() > 60_000`) → return `access_token`.
- Stale + `refresh_token`: single-flight via module-level `Map<string, Promise<string | null>>` keyed `${orgId}:${serviceName}` (delete entry in `finally`). Inside: `refreshTokens` → `storeSecret` the new envelope (`JSON.stringify`) → return new access token; any throw → return `null` (fail-soft; wrap-tool's existing "no stored credential — re-bind it" error fires).
- Stale + no refresh_token → `null`.
- `tools.ts` wiring: inside the default deps builder replace the direct secret read with `resolveConnectorBearer(orgId, serviceName)` (adapt to however the current closure receives orgId — read the surrounding lines first). **L-30 check:** confirm this default builder is the single source for BOTH `runtime.ts:277` and `stateless-turn.ts:147` call paths (grep `mcpDeps` consumers; if either constructs its own deps, patch it identically).
- `mcp-actions.ts` bind-time swap: same one-line substitution where it fetches the bearer for discovery `listTools`.

- [ ] **Step 1:** Write the spec: plain-bearer passthrough; null secret → null; fresh envelope → token, no store call; stale+refresh → refreshed token AND `storeSecret` called once with rotated envelope (assert persisted JSON parses back, fake fetch, injected now); stale+no-refresh → null, no fetch; malformed `{`-prefixed secret → null; concurrent double-call while refresh in flight → ONE fetch (single-flight); refresh failure → null and no store.
- [ ] **Step 2:** Run it — FAIL.
- [ ] **Step 3:** Implement + wire both modify-targets.
- [ ] **Step 4:** Run the new spec (PASS) **and** the existing wrap-tool/tools connector specs (grep `tests/` for `wrap-tool`/`connector` specs; delta must be zero).
- [ ] **Step 5:** Commit: `feat(mcp): OAuth-aware bearer resolver with single-flight refresh, wired at runtime + bind-time`

### Task 3: Registry — authType widening + Circle entry + shared tool-schema clamp

**Files:**
- Modify: `packages/crm/src/lib/agents/mcp/connectors.ts` (`VettedConnector` type :82-89; `VETTED_CONNECTORS` :95-115)
- Test: extend the existing connectors spec (grep `tests/` for the spec covering `VETTED_CONNECTORS`/`getVettedConnector`; create `tests/unit/mcp-connectors-circle.spec.ts` if none)

**Produces:**

```typescript
export type VettedConnectorAccessLevel = { label: string; scopes: string[] };
export type VettedConnector = {
  id: string;
  label: string;
  endpoint: string;
  authType: "bearer" | "oauth";
  secretService: string;
  /** OAuth connectors: user-pickable consent levels (default = first entry). */
  accessLevels?: VettedConnectorAccessLevel[];
};
/** Clamp one MCP tool schema to the persistable bounds (name ≤128 or drop; description ≤4000 clamp). Shared by composio + vetted discovery. */
export function boundMcpToolSchema(schema: McpToolSchema): McpToolSchema | null;
```

- Circle entry (append to `VETTED_CONNECTORS`, comment style matching postiz/rube):

```typescript
  {
    // Circle.so — official remote MCP (Streamable HTTP + OAuth; verified live
    // 2026-07-13: RFC 8414 metadata at the issuer root, DCR at /oauth/register,
    // PKCE S256, scopes read/write map to Circle's "Read only / Full access").
    // NOTE: every tool call = 1 Circle Admin-API request against the
    // community's monthly quota (5k/mo on Business) — keep agents read-lean.
    id: "circle",
    label: "Circle (community platform)",
    endpoint: "https://app.circle.so/api/mcp",
    authType: "oauth",
    secretService: "circle",
    accessLevels: [
      { label: "Read only", scopes: ["read"] },
      { label: "Full access", scopes: ["read", "write"] },
    ],
  },
```

- `boundMcpToolSchema`: lift the exact body of `boundToolSchema` from `lib/integrations/composio/discover-tools.ts:78-87` (plus its two bound constants) into `connectors.ts` next to the zod schema that owns those bounds; export it. **Do NOT edit discover-tools.ts** (reviewed stacked code keeps its local copy; add one line to ITS comment? No — zero edits there. Note the duplication in `connectors.ts`'s new function comment: "discover-tools.ts carries a pre-existing local twin; unify post-merge").
- `authType: "bearer"` stays the literal for postiz/rube — widening the type must not change their runtime behavior (compile-check only).

- [ ] **Step 1:** Failing test: `getVettedConnector("circle")` returns the entry with `authType:"oauth"` + 2 access levels; `boundMcpToolSchema` drops >128-char names, clamps >4000-char descriptions, passes normal schemas byte-identical.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run new + existing connector specs — PASS/zero-delta. Also `pnpm --filter crm exec tsc --noEmit` (or the repo's typecheck script — grep package.json) to catch `authType` literal fallout.
- [ ] **Step 5:** Commit: `feat(connectors): Circle vetted entry + oauth authType + shared tool-schema clamp`

### Task 4: Vetted MCP discovery fill + combined persist fill at all 5 call sites

**Files:**
- Create: `packages/crm/src/lib/agents/mcp/discover-vetted-tools.ts`
- Modify (one-line call-site swaps ONLY):
  - `packages/crm/src/lib/agents/generate/actions.ts:257` and `app/api/v1/agents/generate/route.ts:186` — keep calling `fillBlueprintConnectorsForPersist` (its internals change instead, see below) → NO EDIT after all. Strike these two from the modify list.
  - `packages/crm/src/lib/agent-templates/interview-actions.ts:114` → `fillAllBindingTools`
  - `packages/crm/src/app/api/v1/recordings/compile-agent/route.ts:119` → `fillAllBindingTools`
  - `packages/crm/src/app/(dashboard)/studio/agents/[id]/page.tsx:364` → `fillAllBindingTools`
- Modify: `packages/crm/src/lib/integrations/composio/discover-tools.ts:296-301` — `fillBlueprintConnectorsForPersist` swaps its internal call from `fillComposioBindingTools` to `fillAllBindingTools` (2-line diff: import + call). This is the ONE sanctioned edit to stacked-branch code; it is additive and its existing tests must stay green.
- Test: `packages/crm/tests/unit/mcp-discover-vetted.spec.ts`

**Interfaces:**
- Consumes: `resolveConnectorBearer` (Task 2), `boundMcpToolSchema` + `getVettedConnector` + `MAX_ENABLED_TOOLS`/`MAX_CACHED_TOOLS` (Task 3 / existing), `createMcpClient` (existing), `fillComposioBindingTools` (existing).
- Produces:

```typescript
export type VettedToolLister = (orgId: string, connectorId: string) => Promise<McpToolSchema[]>;
export async function discoverVettedToolsLive(orgId: string, connectorId: string): Promise<McpToolSchema[]>; // resolve bearer → createMcpClient({endpoint, bearer}).listTools() → map to McpToolSchema via boundMcpToolSchema; no bearer/any error → []
export async function fillVettedMcpBindingTools(orgId: string, connectors: ConnectorBinding[] | undefined | null, deps?: { listVettedTools?: VettedToolLister }): Promise<{ connectors: ConnectorBinding[]; changed: boolean }>;
export async function fillAllBindingTools(orgId: string, connectors: ConnectorBinding[] | undefined | null, deps?: { listToolkitTools?: ToolkitToolLister; listVettedTools?: VettedToolLister }): Promise<{ connectors: ConnectorBinding[]; changed: boolean }>; // composio fill then vetted fill; changed = OR
```

**Implementation notes:**
- Mirror `fillComposioBindingTools`'s structure line-for-line where applicable (module header comment: state that explicitly): same never-discovered marker guard (`enabledTools.length === 0 && !discoveredAt`), same pass-through-byte-identical for non-targets, same never-throws + per-binding isolation, same caps, same "zero tools → original reference, no stamp, retry next encounter".
- Target predicate: `binding.kind === "vetted"` AND `getVettedConnector(binding.id)?.authType === "oauth"`. (Bearer vetted connectors keep today's bind-time-only discovery — don't widen behavior for postiz/rube in this slice.)
- `discoverVettedToolsLive`: `const bearer = await resolveConnectorBearer(orgId, connector.secretService); if (!bearer) return [];` then `createMcpClient({ endpoint: connector.endpoint, bearer }).listTools()` in try/catch → map descriptors (`{name, description, inputSchema}`) through `boundMcpToolSchema`, drop nulls, cap at 20 (reuse the constant name `TOOLKIT_DISCOVERY_TOOL_CAP`? No — define `VETTED_DISCOVERY_TOOL_CAP = 20` locally; keep modules decoupled). Fill BOTH `enabledTools` (names) and cached `tools` (schemas).

- [ ] **Step 1:** Failing spec: undiscovered circle vetted binding + fake lister → filled names+tools+discoveredAt; explicit-disable (discoveredAt set, empty tools) untouched byte-identical; bearer-authType vetted binding untouched; composio binding untouched by the vetted fill; lister throw → original binding, changed:false; empty lister result → no stamp; `fillAllBindingTools` runs both fills and ORs `changed` (fake both listers); cap enforcement at 20/MAX bounds.
- [ ] **Step 2:** FAIL. **Step 3:** Implement + the 3 call-site swaps + the 2-line `fillBlueprintConnectorsForPersist` internal swap.
- [ ] **Step 4:** Run new spec + the stacked branch's discover-tools spec (grep `tests/` for `discover-tools`/`composio-discovery` specs) — PASS / zero delta.
- [ ] **Step 5:** Commit: `feat(mcp): vetted OAuth connector tool discovery — marker-guarded fill at all persist seams`

### Task 5: Connect/disconnect actions + signed-state cookie + OAuth callback route

**Files:**
- Create: `packages/crm/src/lib/agents/mcp/oauth-state-cookie.ts` (sign/verify helpers)
- Create: `packages/crm/src/lib/agents/mcp/oauth-callback.ts` (handler logic, DI'd)
- Create: `packages/crm/src/app/api/integrations/mcp/callback/route.ts` (thin GET — L-31)
- Modify: `packages/crm/src/app/(dashboard)/integrations/actions.ts` (add `connectMcpConnectorAction` + `disconnectMcpConnectorAction` beside `connectComposioToolkitAction` at :77-107 — copy its org-resolution + return-shape idioms exactly)
- Test: `packages/crm/tests/unit/mcp-oauth-callback.spec.ts` (+ cookie helper cases in the same file)

**Interfaces:**
- Consumes: Task 1 (`discoverAuthServer`, `registerClient`, `buildAuthorizeUrl`, `generatePkcePair`, `generateStateToken`, `exchangeCode`, `tokenEnvelopeSchema`), Task 3 (`getVettedConnector`), Task 4 (`discoverVettedToolsLive` for the fail-soft count probe), `storeSecret`/`deleteSecret`-equivalent from `@/lib/secrets` (grep for the delete/remove secret export; if none exists, store `""`? NO — grep `rotate_secret`/`revoke` actions for the house deletion pattern and use it).
- Produces:

```typescript
// oauth-state-cookie.ts
export const MCP_OAUTH_COOKIE = "sf_mcp_oauth";
export type McpOauthState = { v: 1; state: string; verifier: string; connectorId: string; orgId: string; clientId: string; clientSecret?: string; tokenEndpoint: string; scopes: string[]; exp: number };
export function signMcpOauthState(payload: McpOauthState, secret: string): string;   // b64url(json) + "." + b64url(hmacSha256(b64url(json), secret))
export function verifyMcpOauthState(cookieValue: string, secret: string, now?: () => number): McpOauthState | null; // constant-time compare (crypto.timingSafeEqual), exp check, zod shape check
// oauth-callback.ts
export type McpCallbackDeps = { getCookie: (name: string) => string | undefined; resolveSessionOrgId: () => Promise<string | null>; storeSecret: typeof storeSecret; exchange: typeof exchangeCode; probeTools: (orgId: string, connectorId: string) => Promise<number | null>; now?: () => number; authSecret?: string };
export async function handleMcpOauthCallback(params: { code: string | null; state: string | null }, deps: McpCallbackDeps): Promise<{ redirect: string; clearCookie: boolean }>;
```

**Implementation notes:**
- Auth secret: `process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim()` — throw at ACTION time when absent (mirror `lib/auth/magic-link.ts:52-60`). Never mint an unverifiable state.
- `connectMcpConnectorAction({ connectorId, accessLevelIndex })`: resolve authed org (copy the composio action's exact pattern); look up connector, require `authType === "oauth"`; scopes = `accessLevels[accessLevelIndex] ?? accessLevels[0]`; `discoverAuthServer(connector.endpoint)`; `registerClient({ metadata, redirectUri, clientName: "SeldonFrame" })`; redirectUri = `${appOrigin()}/api/integrations/mcp/callback` — find the house origin helper by grepping how the composio action or magic-link builds absolute URLs (`NEXT_PUBLIC_APP_URL` / headers()); mint state+PKCE; `cookies().set(MCP_OAUTH_COOKIE, signed, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 })`; return `{ ok: true, url: authorizeUrl }` (client does `window.location.assign(url)` — same as the composio connect flow's redirect handling).
- `handleMcpOauthCallback` decision ladder (each failure → `{ redirect: "/integrations?error=mcp_oauth_<reason>", clearCookie: true }`, reasons: `missing_params | bad_state | expired | org_mismatch | exchange_failed`):
  1. `code`/`state` params present; 2. cookie present + `verifyMcpOauthState` valid; 3. `payload.state === params.state`; 4. `await resolveSessionOrgId()` non-null AND `=== payload.orgId`; 5. `exchange({...})` → envelope; 6. fail-soft `probeTools` (default: `discoverVettedToolsLive` then `.length`, catch → null) → stamp `discovered_tools_count` when non-null; 7. `storeSecret({ workspaceId: payload.orgId, serviceName: connector.secretService, value: JSON.stringify(envelope) })`; 8. `{ redirect: "/integrations?connected=" + payload.connectorId, clearCookie: true }`. Wrap steps 5-7 so a throw maps to `exchange_failed`. NO user-supplied redirect targets anywhere.
  - Look up the connector via `getVettedConnector(payload.connectorId)` — unknown id → `bad_state`.
- Route file: `export const runtime = "nodejs"` if sibling API routes do; GET handler = parse `request.nextUrl.searchParams`, build real deps (cookie via `request.cookies.get`, org via the house session helper used by other API routes — grep `app/api/**` for the idiom), call handler, `NextResponse.redirect(new URL(result.redirect, request.url))` + `response.cookies.delete(MCP_OAUTH_COOKIE)`.
- `disconnectMcpConnectorAction({ connectorId })`: authed org → delete the secret via the house pattern found above → `{ ok: true }`.

- [ ] **Step 1:** Failing spec: cookie sign→verify round-trip; tampered payload → null; tampered sig → null; expired → null; **timing-safe compare used (assert via code — acceptable to test behaviorally: wrong-length sig → null without throw)**; callback ladder — each of the 5 failure reasons hits its exact redirect; happy path stores envelope JSON (parse it back, assert `discovered_tools_count` stamped when probe returns 7, absent when probe null) and redirects `?connected=circle`; org mismatch does NOT store.
- [ ] **Step 2:** FAIL. **Step 3:** Implement all four files. **Step 4:** PASS + typecheck.
- [ ] **Step 5:** Commit: `feat(integrations): Circle OAuth connect/disconnect + signed-state callback route`

### Task 6: Agent-creation findability — tool-catalog entry

**Files:**
- Modify: `packages/crm/src/lib/agents/generate/tool-catalog.ts` (append entry after the postiz block ~:105; update the grounding comment block :61-75 to note circle → VETTED_CONNECTORS)
- Test: extend the existing tool-catalog/bind-tools spec (grep `tests/` for `tool-catalog` or `bind-tools` specs)

**Complete entry:**

```typescript
  {
    // Vetted connector — VETTED_CONNECTORS[id="circle"] (OAuth; connect on the
    // Integrations page). Binds as { kind:"vetted", id:"circle",
    // serviceName:"circle", enabledTools:[…] }; tools fill via the vetted
    // marker-guarded discovery once the workspace has connected Circle.
    id: "circle",
    connectorKind: "vetted",
    label: "Circle (community platform)",
    description:
      "Read members, spaces, posts, and events in your Circle community — and with full access, create posts, message members, and manage tags. Note: every tool call counts against Circle's monthly Admin-API quota.",
    keywords: [
      "circle",
      "circle.so",
      "community",
      "community platform",
      "community member",
      "community members",
      "mastermind",
      "cohort",
      "membership site",
      "membership community",
      "space",
      "spaces",
    ],
  },
```

- [ ] **Step 1:** Failing test additions: `findToolsByKeywords("pair up active members of my Circle mastermind each month")` includes the circle entry; `bindToolsForIntent` on such an intent emits `{ kind: "vetted", id: "circle", serviceName: "circle", enabledTools: [] }`; a sentence with figurative "circle back next week" — check the matcher's whole-word behavior and assert the ACTUAL result (if it matches, that's accepted-suggestion-noise per spec §D — then instead assert the entry is merely suggested, never auto-erroring; document whichever way it lands in the test name).
- [ ] **Step 2:** FAIL. **Step 3:** Add entry. **Step 4:** PASS + zero delta on sibling catalog tests (the catalog-size assertions may need the count bumped — that IS the delta, update deliberately).
- [ ] **Step 5:** Commit: `feat(generate): Circle findable at agent creation — tool-catalog entry + binding test`

### Task 7: Surfaces — /integrations MCP-connector card + editor OAuth branch

**Files:**
- Modify: `packages/crm/src/app/(dashboard)/integrations/page.tsx` (server component: fetch OAuth-vetted connector statuses — secret existence + parsed envelope's level/count/obtained_at ONLY as plain display fields)
- Modify: `packages/crm/src/app/(dashboard)/integrations/integrations-client.tsx` (new "MCP connectors" section below the Composio grid: per-connector card — status line, access-level `<select>` (default index 0 = Read only, per Circle's own recommendation), Connect button → calls `connectMcpConnectorAction` then `window.location.assign(result.url)`; Disconnect button; handle `?connected=circle` / `?error=mcp_oauth_*` toasts the same way the composio params are handled today)
- Modify: `packages/crm/src/app/(dashboard)/studio/agents/[id]/editor-client.tsx` — find the vetted-connector bind affordance (the paste-a-bearer input near the `bindTemplateConnectorAction` call at :1572): when `getVettedConnector(id)?.authType === "oauth"` (the catalog/UI projection must carry `authType` — extend `toolCatalogForUi()` or the connector chip data source accordingly), replace the key input with a "Connect on the Integrations page" link + connected-state hint. Match existing card/chip styling classes exactly (dark theme).
- Test: `packages/crm/tests/unit/integrations-mcp-card.spec.ts` — pure display-logic helpers only (extract a `describeMcpConnectorStatus(envelopeJson: string | null): { connected: boolean; levelLabel?: string; toolCount?: number }` helper into `lib/agents/mcp/connector-status.ts` and unit-test THAT; do not renderToString the whole dashboard page)

**Notes:** server component passes booleans/labels/counts only — never the envelope. Envelope scope → level label: `scope` containing `"write"` → "Full access", else "Read only".

- [ ] **Step 1:** Failing spec for `describeMcpConnectorStatus`: null → disconnected; plain-bearer string → connected, no level; envelope with scope "read" → Read only + count when present; malformed JSON → disconnected (fail-safe display).
- [ ] **Step 2:** FAIL. **Step 3:** Implement helper + wire both surfaces + editor branch. **Step 4:** PASS + typecheck + `node scripts/run-unit-tests.js` full sweep — judge by delta vs the baseline you record BEFORE this task (`git stash` is FORBIDDEN (L-01); record baseline by running the sweep at task start).
- [ ] **Step 5:** Commit: `feat(integrations): Circle connect card + editor OAuth-connector affordance`

### Task 8: Close-out — leak grep, todo review, full verify sweep

**Files:**
- Modify: `tasks/todo.md` (worktree copy — add the review section per CLAUDE.md §2.7)

- [ ] **Step 1:** Regression greps (all must return ZERO hits in `packages/crm/src`):
  - `grep -rn "access_token" packages/crm/src --include="*.ts*" | grep -iE "console\.|logger|log\("` (token logging)
  - `grep -rn "client_secret" packages/crm/src/app` outside the oauth modules (secret reaching a component)
- [ ] **Step 2:** Full unit sweep + typecheck; record deltas vs pre-branch baseline in `tasks/todo.md` review section (name any pre-existing failures explicitly — L-06 honesty).
- [ ] **Step 3:** Commit: `chore(circle): close-out — leak greps + todo review`

## Self-review (done at authoring)

- Spec §A→Tasks 1-2, §B→Task 3, §C→Task 5, §D→Tasks 4+6 (+Task 2's bind-time swap), §E→Task 7, §F→Tasks 1/2/5/8 (sanitized errors, timing-safe compare, org checks, leak greps), §4 verification→Task 8 + the ship-loop's verify-runner. Non-goals honored: no discover-tools.ts rewrite (one 2-line sanctioned edit), no BYO-OAuth UX, no Skool.
- Type-consistency pass: `TokenEnvelope`/`parseTokenEnvelope`/`resolveConnectorBearer`/`fillAllBindingTools`/`boundMcpToolSchema` names match across tasks. `deleteSecret` intentionally left as "grep the house pattern" (verified to exist in some form via the `rotate_secret`/`revoke_bearer` MCP tools — implementer confirms the internal export name).
- No placeholders: every code step has real code or an exact grep-and-mirror instruction anchored to a verified file:line.
