# Circle MCP Connector — Design Spec (2026-07-13)

**Feature (Max-approved 2026-07-13):** Circle (circle.so) as a first-class agent
connector via its official remote MCP server (`https://app.circle.so/api/mcp`),
implemented as the OAuth extension of the existing vetted-MCP rail, and
**findable at agent creation exactly like Composio toolkits**.

**Why now:** Corey Ganim's AI-Concierge case (50-member mastermind: Circle
members → never-repeat 1:1 pairing → Sheets grid → 25 Gmail drafts, 2h/mo → one
slash command) is our compiled-agent thesis performed by hand. Circle is the
missing connector; everything else (Composio Sheets/Gmail, Brain, supervised
run, read-back) already exists or is on pending branches.

**Branch:** `feature/circle-mcp-connector`, **stacked on
`feature/composio-live-discovery`** (diff-scout verdict: both features touch the
same 4 persist seams; stacking reuses the marker-guarded fill pattern). Merge
train: composio-live-discovery → this.

---

## 1. Ground truth (verified, not assumed)

Live probe of Circle (2026-07-13, unauthenticated metadata only):

- `POST /api/mcp` → **401** (auth required, as documented).
- `/.well-known/oauth-protected-resource` → HTML SPA fallback (**RFC 9728 NOT
  implemented**).
- `/.well-known/oauth-authorization-server` → **valid RFC 8414 metadata**:
  - `authorization_endpoint: https://app.circle.so/oauth/authorize`
  - `token_endpoint: https://app.circle.so/oauth/token`
  - `registration_endpoint: https://app.circle.so/oauth/register` (**DCR live**)
  - `response_types: ["code"]`, `grant_types: ["authorization_code"]`,
    `code_challenge_methods: ["S256"]`,
    `token_endpoint_auth_methods: ["client_secret_post","none"]`,
    `scopes_supported: ["read","write"]` ← maps 1:1 to Circle's documented
    "Read only vs Full access" connector levels.
  - NOTE: no `refresh_token` grant advertised — treat refresh as OPTIONAL
    (store `refresh_token` if the token response includes one; otherwise
    re-connect on expiry/401. Do not hard-require it.)

Code anchors (read directly, current as of branch tip `02bc7178e`):

- `packages/crm/src/lib/agents/mcp/connectors.ts:40-79` — `ConnectorBinding`
  kinds `vetted | byo | composio`; vetted/byo carry `serviceName`,
  `enabledTools`, cached `tools`, `discoveredAt`.
- `connectors.ts:82-115` — `VettedConnector {id,label,endpoint,authType:"bearer",secretService}`;
  entries `postiz`, `rube`. Comment: "Adding a vetted connector = one entry
  here, no other code (the Studio picker reads this list)."
- `packages/crm/src/lib/agents/mcp/client.ts` — inline dependency-free MCP
  client (Streamable HTTP, initialize/listTools/callTool, bearer + custom
  headers, HTTPS-only, 20s abort).
- `packages/crm/src/lib/agents/mcp/wrap-tool.ts:38-86` — `WrapMcpDeps.getSecret(orgId, serviceName)`
  is the credential seam; `wrapMcpTool` namespaces `${serviceName}__${tool}`.
- `packages/crm/src/lib/agents/tools.ts:1940-2013` — `getToolsForCapabilities`
  merges native + wrapped connector tools; call sites `runtime.ts:277`,
  `stateless-turn.ts:147` (L-30: change BOTH or neither).
- `packages/crm/src/lib/agents/generate/tool-catalog.ts:40-57,81-179` —
  `ToolCatalogEntry {id, connectorKind, toolkitSlug?, label, description,
  keywords[]}`; keyword matcher drives `bindToolsForIntent`
  (`generate/bind-tools.ts:102-121`); editor chips via `toolCatalogForUi()`.
- Bind-time discovery: `lib/agent-templates/template-mcp-server.ts:99`
  (`bindTemplateConnectorAction`) / `mcp-actions.ts:80` — caches `tools` on the
  binding (runtime never does live tools/list).
- Secrets: `workspace_secrets` table, AES-GCM, `storeSecret`/`getSecretValue`
  keyed `(workspaceId, serviceName)`. **No migration needed for this slice.**
- Stacked-branch seams (from `feature/composio-live-discovery`): discovery fill
  at 4 persist seams — `lib/agents/generate/actions.ts`,
  `app/api/v1/agents/generate/route.ts`,
  `lib/agent-templates/interview-actions.ts`,
  `app/api/v1/recordings/compile-agent/route.ts` — marker-guarded
  (`enabledTools.length === 0 && !discoveredAt`), fail-soft, schema-clamped.
- Composio has NO Circle toolkit (checked 2026-07-13) — vetted-MCP is the only
  rail for Circle.

## 2. Design

### A. MCP OAuth client module — `lib/agents/mcp/oauth.ts` (new; the novel core)

Pure functions + one injectable-deps orchestrator (DI for offline tests):

1. `discoverAuthServer(mcpEndpoint)` — try RFC 9728
   (`/.well-known/oauth-protected-resource{,/api/mcp}` with JSON guard), fall
   back to issuer-root RFC 8414 (`/.well-known/oauth-authorization-server`).
   HTTPS-only, 10s timeout, reject non-JSON (Circle's SPA returns HTML —
   MUST NOT parse as success; explicit content-type + shape check).
2. `registerClient(asMetadata, redirectUri)` — RFC 7591 DCR, **per-workspace**
   (isolated, stateless, no platform-storage question; every Claude Desktop
   install does the same). `token_endpoint_auth_method: "none"` (public client
   + PKCE) when supported, else `client_secret_post`.
3. `buildAuthorizeUrl({asMetadata, clientId, scopes, state, codeChallenge, redirectUri})` — S256.
4. `exchangeCode` / `refreshTokens` — token endpoint; refresh optional (§1).
5. Token envelope (JSON, stored via `storeSecret` under the connector's
   `secretService`, e.g. `circle`):
   `{v:1, kind:"oauth", access_token, refresh_token?, expires_at?, scope?,
   token_endpoint, client_id, client_secret?, obtained_at}`.
6. `resolveConnectorBearer(orgId, serviceName, deps)` — the ONE runtime entry:
   reads secret; legacy plain string → return as-is (postiz/rube unchanged);
   OAuth envelope → return access token, proactively refreshing when
   `expires_at` within 60s AND refresh_token present; on refresh, persist
   rotated envelope. Failure → throw the existing "re-bind it" error shape.
   Wire into `wrap-tool.ts` by swapping the default `getSecret` dep for this
   resolver — `wrapMcpTool` body/callers unchanged (L-30 satisfied: the seam
   change is inside the default deps, both runtime paths inherit it).

### B. Connector registry

- Widen `VettedConnector.authType: "bearer" | "oauth"`; optional
  `scopes?: string[]`, `accessLevels?: {label, scopes[]}[]`.
- Add entry: `{id:"circle", label:"Circle (community platform)",
  endpoint:"https://app.circle.so/api/mcp", authType:"oauth",
  secretService:"circle", accessLevels:[{label:"Read only",scopes:["read"]},
  {label:"Full access",scopes:["read","write"]}]}`. Description copy carries
  the honesty note: every tool call = 1 Circle Admin-API request against the
  community's monthly quota (5k/mo Business plan).

### C. Connect flow (mirrors `connectComposioToolkitAction` shape)

- Server action `connectMcpConnectorAction({connectorId, accessLevel})`:
  discovery → DCR → mint state (32B random) + PKCE verifier → set **signed,
  httpOnly, 10-min cookie** `sf_mcp_oauth` = HMAC(AUTH_SECRET) over
  `{state, verifier, connectorId, orgId, clientId, clientSecret?, tokenEndpoint, exp}`
  → return authorize URL (client redirects).
- Callback route `app/api/integrations/mcp/callback/route.ts` (route file
  exports HTTP verbs ONLY — L-31; logic in `lib/agents/mcp/oauth-callback.ts`):
  validate cookie sig + expiry + `state` equality + org matches session org →
  exchange code → store envelope → **immediate `listTools` discovery** and
  cache on workspace-level connector status → clear cookie → redirect
  `/integrations?connected=circle` (fixed same-origin path, no user-supplied
  returnTo → no open-redirect surface). Errors land
  `/integrations?error=circle_oauth_<reason>` (reason enum, never raw provider
  text).
- `disconnectMcpConnectorAction` — delete secret (revocation endpoint optional,
  not advertised by Circle; document that the user can also revoke in Circle).

### D. Findability at agent creation (the Max requirement)

- `TOOL_CATALOG` += `{id:"circle", connectorKind:"vetted", label:"Circle
  (community platform)", description:"Read members, spaces, posts, events —
  and with full access, post, message, and manage — in your Circle
  community.", keywords:["circle","community","member","members","mastermind",
  "cohort","space","spaces","membership site","community platform"]}`.
  (`"circle"` keyword risk: whole-word matcher; accept the rare figurative
  false positive — suggestion, not auto-bind.)
- `bindToolsForIntent` → existing `bindingForEntry` already emits
  `{kind:"vetted", id:"circle", serviceName:"circle", enabledTools:[]}` — no
  logic change, verify by test.
- Discovery fill: extend the stacked branch's fill seam with
  `fillVettedMcpBindingTools` (same marker guard + fail-soft + clamp), applied
  at the SAME 4 persist seams, only for vetted bindings whose workspace secret
  exists. No secret → binding persists empty + existing warning string parity
  ("No integration found yet for: Circle — connect it in Integrations")
  + editor's unconnected-card already links to integrations
  (`editor-client.tsx:1817-1850`).
- Editor bind branch: `authType:"oauth"` vetted connectors render
  "Connect via OAuth on the Integrations page" (link) instead of the
  paste-a-bearer field. Chips auto-appear via `toolCatalogForUi()`.

### E. /integrations surface

New "MCP connectors" section (below Composio toolkits): card per
OAuth-vetted connector — status (Connected as of <discoveredAt> · N tools ·
access level from stored scope), access-level picker (default Read only, per
Circle's own rec), Connect / Disconnect / Refresh tools. Server component reads
secret existence + cached tool count only (booleans/counts — never token
material to the client).

### F. Security invariants

Org-scope every query (house invariant #1); tokens only in `workspace_secrets`
(AES-GCM) and never logged (add a regression grep for `access_token` in log
statements); state cookie HMAC-verified + single-use (cleared on callback);
HTTPS enforced by existing `assertHttpsEndpoint`; callback redirects are fixed
same-origin paths; DCR response treated as untrusted input (zod-parse); test
fixtures use format-breaking fake tokens (L-28). Reviewer tier: **opus**
(auth path).

## 3. Non-goals (explicit)

Skool (no official API; cookie-scraper MCP fails never-lies — parked);
generic "paste any MCP URL + OAuth" UX (BYO stays bearer-only this slice;
Circle proves the rail first); per-deployment credentials; MCP tool-annotation
UI (readOnlyHint/destructiveHint — follow-up); API-quota metering (copy note
only); Circle webhooks/triggers (poll/push follow-up).

## 4. Verification & honesty line (L-06)

- Unit: oauth module (discovery fallback incl. HTML-not-JSON rejection, DCR,
  PKCE, exchange, refresh+rotation, envelope round-trip, legacy-string
  passthrough), callback (state mismatch, expired cookie, org mismatch, happy
  path), resolver-on-401, fill parity, catalog/binding, all via DI fakes — no
  network.
- `/verify-build` six checks in this worktree (verify-runner, maker ≠ checker).
- Whole-branch review: opus.
- **Offline result = code-correct.** Live smoke (post-deploy, needs Max's
  Circle account): (1) Connect read-only from /integrations on a real
  community; (2) create agent from "answer questions about my Circle community
  members" → Circle chip suggested → tools discovered; (3) agent turn lists
  real members; (4) full-access level: supervised test-write parity with the
  Corey flow. Until then the card ships dark-safe (absent secret = feature
  invisible in agent output; no flag needed — but see §6 open question).

## 5. Estimates (L-17 calibrated)

oauth.ts ~350 prod / ~600 tests (sequential-flow branches, 1.6-2x band);
resolver + wrap default-deps ~80/150; action + callback ~150/150 (logic in
lib); registry + catalog ~60/60; vetted fill at 4 seams ~80/120 (adapted
pattern); /integrations section + editor oauth branch ~200/200 (composition
0.94x + narrow state machine). **Total ≈ 920 prod + 1,280 test ≈ 2,200 LOC;
stop-trigger 2,600.** No migrations. No new deps (inline OAuth per L-17
blocked-dep rule; MCP client already inline).

## 6. Open question for Max (non-blocking, defaulted)

Ship visible-by-default on /integrations (recommended — connect is explicit
user action; agents can't use it until someone OAuths) vs. behind a
`SF_MCP_OAUTH` flag. Building **visible-by-default**; trivial to flag at
merge if you prefer.
