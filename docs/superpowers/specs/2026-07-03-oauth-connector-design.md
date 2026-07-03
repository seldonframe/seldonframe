# OAuth 2.1 + Dynamic Client Registration for SeldonFrame's Remote MCP Endpoint

**Status:** Design spec — no code written, no commits made.
**Author:** Claude (design pass), for Maxime Houle.
**Date:** 2026-07-03.
**Scope:** `https://mcp.seldonframe.com/v1` (the "builder MCP" — bearer-gated, backs the `/build` connect snippet and drives real workspace CRM data), so it qualifies for the claude.ai connector directory.
**Non-goals:** the other two MCP-shaped endpoints in this repo (`/api/chatgpt/mcp` — public ChatGPT Apps surface; `/api/v1/agents/[slug]/mcp` — per-agent marketplace rental surface) are explicitly out of scope. They have different trust models (unauthenticated / rental-key) and are not part of this connector-directory submission.

---

## 0. Executive summary

SeldonFrame's builder MCP currently authenticates with a single mechanism: a long-lived (or admin-minted, 7-day) `wst_…` bearer token, copy-pasted by the user into their MCP client config (`claude mcp add … --header "Authorization: Bearer wst_…"`). This works for Claude Code and any client willing to accept a manually-configured header, but it fails the two things claude.ai's hosted connector UI and directory require:

1. **No interactive OAuth flow.** claude.ai's "Add custom connector" dialog expects to click through a browser-based authorize screen and come back with a token — it has no UI for "paste a bearer token into a header field" for directory-listed connectors (that's the *custom, unlisted* connector path, which is a lower bar than the directory).
2. **No Dynamic Client Registration (or CIMD, or a static Anthropic-issued client id).** claude.ai needs to obtain a `client_id` for itself without a human relaying one — via DCR (`POST /register`), Client ID Metadata Documents (CIMD), or a pre-arranged static client id.

This design adds a **minimal, self-hosted OAuth 2.1 Authorization Server** co-located with the existing app (same Next.js deployment, same Postgres, same session cookie), that:

- Issues the *existing* `wst_`-shaped bearer token under the hood (new `kind: "oauth"`, ~1h expiry) — so `guardApiRequest` / `resolveWorkspaceBearer` need at most a one-line kind/expiry tweak, not a parallel auth system.
- Adds the two spec-required discovery documents (`/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`).
- Adds an open, public-client-only Dynamic Client Registration endpoint (`POST /api/oauth/register`).
- Adds a consent screen (`GET /oauth/authorize`) that reuses the **existing NextAuth session** — no new login system — with a workspace picker for multi-workspace users.
- Adds a token endpoint (`POST /api/oauth/token`) supporting `authorization_code` (PKCE S256-only) and `refresh_token` (rotating) grants.
- Is entirely inert behind a `SF_OAUTH_ENABLED` flag — every new endpoint 404s when the flag is off, and the existing `wst_` bearer flow is untouched and keeps working forever, flag or no flag.

This is additive in every dimension: new tables, new routes, new flag, one new `apiKeys.kind` value, one new `WWW-Authenticate` header on an existing 401, one new proxy matcher block. Nothing existing is removed or behaviorally changed for callers who don't opt into OAuth.

---

## 1. Grounded facts (cite what we found)

### 1.1 MCP Authorization spec (2025-11-25 revision)

Source: `https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization` (fetched directly; this is the current/latest spec revision as of today).

**Important nuance not in the task's framing — the spec changed between revisions.** The 2025-11-25 revision is meaningfully different from the older (2025-06-18) draft this task's phrasing assumes:

| Requirement | 2025-06-18 draft (older, commonly assumed) | **2025-11-25 (current, what we must build against)** |
|---|---|---|
| Protected Resource Metadata (RFC 9728) | MUST | **MUST** (unchanged) |
| AS Metadata (RFC 8414) or OIDC Discovery | MUST have one | **MUST have at least one of the two** (unchanged in effect) |
| PKCE S256 | MUST | **MUST** (unchanged) — "MCP clients MUST use the S256 code challenge method when technically capable" |
| **Dynamic Client Registration (RFC 7591)** | Commonly treated as expected/required in practice | **MAY** — "Authorization servers and MCP clients MAY support the OAuth 2.0 Dynamic Client Registration Protocol… This option is included for backwards compatibility with earlier versions of the MCP authorization spec." |
| **Client ID Metadata Documents (CIMD)** | Did not exist in earlier drafts | **SHOULD** — now the *preferred* zero-prior-relationship mechanism: "Authorization servers and MCP clients SHOULD support OAuth Client ID Metadata Documents." |
| Resource Indicators (RFC 8707) | Recommended | **MUST** on the client side — "MCP clients MUST implement Resource Indicators for OAuth 2.0 as defined in RFC 8707… MUST send this parameter regardless of whether authorization servers support it." Server-side, we just need to not choke on an unrecognized `resource` param and SHOULD validate it if we want the stronger audience-binding guarantee. |

**What this means for the design:** DCR is no longer the load-bearing mechanism the task brief assumes it is — it is one of *three* registration options, and the spec explicitly lists it last in client priority order (pre-registration → CIMD → DCR → manual). However, **Anthropic's own connector-authentication docs (§1.2 below) still explicitly support and describe DCR as a first-class, currently-used mechanism** for claude.ai specifically, and the task's constraint set (open DCR, public clients, redirect_uri allowlist) is exactly what Anthropic's docs describe as one of three supported paths. We implement DCR because (a) it's still spec-legal (MAY, not forbidden), (b) Anthropic's docs describe it as a real, currently-supported option, and (c) it's the lowest-lift mechanism for a from-scratch AS (CIMD requires fetching and validating an arbitrary client-hosted JSON document — SSRF surface — for marginal benefit at our traffic scale). We flag CIMD/static-client-id as a fast-follow if Anthropic's review pushes back (see §7, open questions).

**Exact normative requirements we build against (quoted from the fetched spec):**

- **401 discovery (RFC 9728 §5.1 shape):**
  > "MCP servers MUST implement one of the following discovery mechanisms... 1. WWW-Authenticate Header: Include the resource metadata URL in the WWW-Authenticate HTTP header under `resource_metadata` when returning 401 Unauthorized responses... 2. Well-Known URI: Serve metadata at a well-known URI... At the root: `https://example.com/.well-known/oauth-protected-resource`"

  Example from spec:
  ```http
  HTTP/1.1 401 Unauthorized
  WWW-Authenticate: Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource",
                           scope="files:read"
  ```

- **Protected Resource Metadata `authorization_servers` field is MUST:**
  > "MCP servers MUST implement the OAuth 2.0 Protected Resource Metadata (RFC9728) specification to indicate the locations of authorization servers. The Protected Resource Metadata document returned by the MCP server MUST include the `authorization_servers` field containing at least one authorization server."

- **AS metadata discovery — MUST support at least one of RFC 8414 or OIDC Discovery:**
  > "MCP authorization servers MUST provide at least one of the following discovery mechanisms: OAuth 2.0 Authorization Server Metadata (RFC8414) [or] OpenID Connect Discovery 1.0."
  We implement RFC 8414 (`/.well-known/oauth-authorization-server`) — no OIDC needed, we're not doing identity federation, just token issuance.

- **PKCE — S256 MUST, and its absence from AS metadata is a hard client-side abort signal:**
  > "MCP clients MUST implement PKCE... MCP clients MUST use the S256 code challenge method when technically capable... If `code_challenge_methods_supported` is absent, the authorization server does not support PKCE and MCP clients MUST refuse to proceed."
  → our AS metadata MUST include `"code_challenge_methods_supported": ["S256"]` or claude.ai will refuse to connect at all.

- **Resource parameter (RFC 8707) — client MUST send, server validates own audience:**
  > "MCP clients MUST implement Resource Indicators for OAuth 2.0 as defined in RFC 8707... MUST send this parameter regardless of whether authorization servers support it." And separately: "MCP servers MUST validate that tokens presented to them were specifically issued for their use" and "MCP servers MUST NOT accept or transit any other tokens."
  Practically: since our AS only ever issues tokens for our own resource server (we don't federate), "audience validation" collapses to "the token resolves via `validateRawWorkspaceToken` against our own `apiKeys` table" — which is already true today. We record the `resource` param on the authorization code (for correctness/defense-in-depth) but do not need a JWT `aud` claim scheme, because our tokens are opaque `wst_` bearer strings validated by DB lookup, not self-describing JWTs.

- **Redirect URI / open-redirect protections:**
  > "MCP clients MUST have redirect URIs registered with the authorization server. Authorization servers MUST validate exact redirect URIs against pre-registered values to prevent redirection attacks." And: "Authorization servers MUST take precautions to prevent redirecting user agents to untrusted URI's... SHOULD only automatically redirect the user agent if it trusts the redirection URI."

- **Refresh token rotation is MUST for public clients:**
  > "For public clients, authorization servers MUST rotate refresh tokens as described in OAuth 2.1 Section 4.3.1."
  DCR-registered clients are *always* public clients (no client secret) per spec — this directly justifies the task's "refresh rotation with reuse detection" requirement; it's not optional hardening, it's the spec floor.

- **Error handling status codes (exact table from spec):**
  | Status | Meaning | Usage |
  |---|---|---|
  | 401 | Unauthorized | Authorization required or token invalid |
  | 403 | Forbidden | Invalid scopes or insufficient permissions |
  | 400 | Bad Request | Malformed authorization request |

- **Communication security:**
  > "All authorization server endpoints MUST be served over HTTPS. All redirect URIs MUST be either `localhost` or use HTTPS."

### 1.2 Anthropic's connector-directory requirements

Sources (all fetched directly today):
- `https://claude.com/docs/connectors/building` (top-level hub page — confirmed real, redirects/links resolved from the stale `support.claude.com` articles the task brief named, which have moved)
- `https://claude.com/docs/connectors/building/authentication` (the authentication reference — this is the single most load-bearing page for this design)
- `https://claude.com/docs/connectors/building/submission` (the directory submission checklist / 11-step form)
- `https://claude.com/docs/connectors/building/review-criteria` (the pre-submission review checklist)

**Note on stale URLs:** the task brief's suggested URLs (`support.claude.com/en/articles/11724452-...` and `.../11503834-...`) both now redirect to a one-line stub: *"The guide to building custom connectors has moved to the Claude developer docs"* → `claude.com/docs/connectors/building`. The content below is from the live destination, not the old support-article shells (which returned only a boilerplate move-notice when fetched directly).

**OAuth spec version support (directly contradicts an unstated assumption — worth flagging):**
> "Supports the 2025-03-26, 2025-06-18, and 2025-11-25 auth specifications" with "Dynamic Client Registration (DCR) enabled"

claude.ai supports all three MCP auth spec revisions, not just the latest — so building strictly against 2025-11-25 (§1.1) is safe and forward-compatible; we're not over-targeting.

**DCR is explicitly optional on Anthropic's side too, with a traffic-based recommendation AGAINST it:**
> "If your authorization server does not expose a `registration_endpoint` (i.e., does not support DCR), you have several options" — expose a registration endpoint, support CIMD, or switch to `oauth_anthropic_creds`.
>
> "For servers expecting high traffic from the directory, prefer CIMD or `oauth_anthropic_creds` over DCR" because **"DCR causes Claude to register a new client on every fresh connection."**

This is an important operational fact for our design: **every single claude.ai user who adds our connector will trigger a fresh `POST /register` call**, not a one-time registration Anthropic reuses across all its users. Our `oauth_clients` table will grow roughly 1:1 with claude.ai connector installs (not 1:1 with claude.ai users globally). This is bounded and fine at SeldonFrame's current scale, but it's the reason Anthropic's own docs steer high-traffic connectors elsewhere — noted as a fast-follow candidate in §7, not a blocker today.

**Exact OAuth callback URLs (load-bearing for our redirect_uri allowlist):**
> Hosted claude.ai / Desktop / mobile / Cowork: `https://claude.ai/api/mcp/auth_callback`
> Claude Code (RFC 8252 native loopback): *"Claude Code declares `http://localhost/callback` and `http://127.0.0.1/callback` in its Client ID Metadata Document, so your authorization server must accept both with the port component ignored."* Example: `http://localhost:3118/callback` (port varies per session).

**PKCE:**
> "Claude includes a PKCE `code_challenge` with `code_challenge_method=S256` on every authorization request, regardless of which registration mechanism it uses... Your authorization server must support S256 PKCE, and the MCP authorization spec requires it to advertise `"code_challenge_methods_supported": ["S256"]`"

**Protected resource metadata validation claude.ai performs on us (two things we must get exactly right or the connection silently fails):**
> "The protected resource metadata document's `resource` field must match your MCP server URL exactly as the user enters it in Claude, including any path component."
> "The metadata's `authorization_servers` field must list your authorization server's issuer URL. If you list more than one, Claude uses the first entry and does not fall back to later entries — list your primary issuer first."

→ our `resource` value must be the literal string `https://mcp.seldonframe.com/v1` (matching exactly what a user types into claude.ai's "Add custom connector" URL field), and `authorization_servers` must be a single-entry array (we only have one AS anyway).

**Token endpoint requirements:**
> "Claude refreshes tokens reactively on a 401 response, with a proactive refresh up to five minutes before the stored expiry."
> "Rotate refresh tokens for public-client connections. DCR and CIMD register Claude as a public client, and the MCP authorization spec adopts OAuth 2.1's requirement to rotate or sender-constrain refresh tokens for public clients. If you rotate, return the new refresh token in the same response that invalidates the old one."
> "Return RFC 6749-compliant error codes (`invalid_grant`, not `invalid_request` or a custom code) when a refresh token is no longer valid."
> "Your `/token` endpoint must accept `Content-Type: application/x-www-form-urlencoded` per RFC 6749 section 4.1.3. Claude sends both the initial token exchange and refresh requests with this content type."
> "Dynamic client registration (`/register`) uses `application/json` per RFC 7591 section 3.1, so don't assume the same parser works for both [as `/token`]."

**Loopback redirect matching + consent-screen display requirement:**
> "RFC 8252 section 7.3 requires this for the IP-literal form (127.0.0.1); apply the same port-agnostic match to `localhost` so Claude Code works."
> "The MCP authorization spec requires authorization servers to display the redirect URI hostname clearly on the consent screen and recommends an extra warning when the only registered redirect URIs are loopback addresses."

**Latency SLA (informs our timeout budgets — no code here, just a design constraint to note):**
> "Claude waits up to 10 seconds for a response from your OAuth discovery, registration, and token endpoints, and up to 30 seconds for refresh token requests." Anthropic's outbound IP range: `160.79.104.0/21`.

**The directory submission checklist (from `/connectors/building/submission`):**

Access: only Team/Enterprise plan Owners (or delegated Enterprise custom roles) can submit — this is an account-level gate on Max's Anthropic org, not a technical one; noted for the checklist in §6 but not something this design can affect.

Technical requirements verbatim:
- "Use OAuth 2.0 for authenticated services" — support DCR, CIMD, or a static client id "managed by Anthropic"
- "All tools must include a `title` and the applicable `readOnlyHint` or `destructiveHint`"
- "Meet Anthropic's security standards", "Respond to security issues promptly"
- HTTPS-only server URL, Streamable HTTP or SSE transport
- Any declared external link URIs "must be owned by you"

Non-technical requirements (documentation/assets/process) — captured in full in §6's submission checklist.

**Pre-submission review criteria (from `/connectors/building/review-criteria`)** — most relevant to our *existing* three MCP tools (discover/inspect/run), not to the OAuth layer itself, but blocking for directory listing regardless:
- Read tools and write tools must be *separate* tools — "A single tool that accepts both safe HTTP methods (GET, HEAD, OPTIONS) and unsafe methods (POST, PUT, PATCH, DELETE) is rejected." **This needs a follow-up check against our existing `run` tool** (see §7 open question — out of scope for this OAuth design doc, but a hard submission blocker independent of OAuth).
- Tool names ≤ 64 characters, every tool needs `title` + `readOnlyHint`/`destructiveHint` annotations.
- "Every tool description should state precisely what the tool does... The description must match the tool's actual behavior — reviewers call every tool and verify."
- No prompt-injection patterns in descriptions (no "call external software the user didn't request", no "pull behavioral instructions from external sources").
- "Servers must call first-party APIs only" — we're fine here, everything routes through our own `/api/v1/build/*`.
- Test credentials required (a fully populated account) as part of submission.

---

## 2. Repo grounding (exact files, exact current behavior)

All paths below are absolute, in the read-only reference worktree `C:\Users\maxim\CascadeProjects\Seldon Frame\.claude\worktrees\virality\packages\crm\`. (Note: this repo is a monorepo — `packages/{cli,core,crm,payments}` — there is no top-level `src/`; everything web-facing lives under `packages/crm/src/`.)

### 2.1 `src/app/api/mcp/v1/route.ts` — the endpoint we're adding OAuth to

Full current behavior (112 lines, read in full):
- `OPTIONS` → 204 + permissive CORS (`Access-Control-Allow-Origin: *` — safe because every POST still needs a valid bearer regardless of origin).
- `GET` → 405 with `Allow: POST` (deliberate — no SSE channel in v1; this is what lets a client fall back cleanly instead of seeing a broken 404).
- `POST` → `guardApiRequest(request)` runs **before any JSON-RPC body parsing**. On `guard.error` or missing `guard.orgId`, returns `NextResponse.json(unauthorizedRpcBody(), { status: 401, headers: CORS_HEADERS })` — a JSON-RPC-shaped error envelope carried in a real HTTP 401, so a strict JSON-RPC client still gets a parseable body.
- Tool calls are bridged via same-origin `fetch()` to `/api/v1/build/<tool>` (discover/inspect/run), **forwarding the caller's own `Authorization` header verbatim** — the bridged route re-runs its own `guardApiRequest`, so there's no privilege escalation and no second source of truth for auth.

**This is the file where the new `WWW-Authenticate` header gets added** — on the existing 401 response, with the existing JSON-RPC error body byte-for-byte unchanged (task requirement: "with the existing error body unchanged").

### 2.2 `src/lib/auth/workspace-token.ts` — the token rail we build on top of, not around

Full file read (148 lines). Exact current contract:

```ts
const TOKEN_PREFIX = "wst_";
const TOKEN_BYTES = 32;

export type MintedWorkspaceToken = { token: string; prefix: string; tokenId: string; expiresAt: Date | null };
export interface MintWorkspaceTokenOptions { name?: string; expiresInDays?: number; }

export async function mintWorkspaceToken(orgId: string, opts?: MintWorkspaceTokenOptions): Promise<MintedWorkspaceToken>
```
Mints `wst_<32 random bytes base64url>`, stores SHA-256 hash + 8-char prefix in `apiKeys`, `kind: "workspace"`. `expiresAt` is `null` (never expires) unless `expiresInDays` is passed.

```ts
export type ResolvedWorkspaceBearer = { orgId: string; tokenId: string };
export async function validateRawWorkspaceToken(raw: string): Promise<ResolvedWorkspaceBearer | null>
```
Looks up by `(kind = "workspace", keyPrefix, keyHash)` triple. Returns `null` uniformly for not-found OR expired (deliberate anti-probing choice — the doc comment says so explicitly). Best-effort, non-blocking `lastUsedAt` touch on success.

```ts
export function extractWorkspaceToken(auth: string): string | null
```
Accepts **both** `Bearer wst_…` and a **bare** `wst_…` value with no scheme — this exists because some MCP gateway proxies (Smithery's run.tools, some directory health-checkers) forward the configured key as the raw header value. **This bare-token tolerance is directly relevant**: our new OAuth-minted tokens are still `wst_`-prefixed, so they get this same tolerance for free — no new parsing logic needed anywhere downstream of the token kind check.

```ts
export async function resolveWorkspaceBearer(headers: Headers): Promise<ResolvedWorkspaceBearer | null>
```
The single top-level resolver `guardApiRequest` calls.

### 2.3 `src/lib/api/guard.ts` — `guardApiRequest`, the one gate every route (including MCP) shares

Full file read (103 lines). Three-mode contract, in order:
1. **Demo-readonly check** (blocks writes regardless of auth — runs first, unconditionally).
2. **Mode 1 — workspace bearer.** `resolveWorkspaceBearer(request.headers)`. On hit: optional `x-org-id` header must match the bearer's org (403 if not); rate-limited via `checkRateLimit(`${bearer.orgId}:${x-forwarded-for}`)`; returns `{ orgId: bearer.orgId }`.
3. **A `wst_`-shaped-but-unresolvable bearer gets an explicit 401** (not a silent fall-through to mode 2) — this is a deliberate anti-confusion fix already shipped: *"A caller that PRESENTED a workspace bearer... that did NOT resolve must get a clear 401 — never fall through to the legacy x-org-id path."*
4. **Mode 2 — legacy `x-api-key` + `x-org-id`** (kind `"user"`), unchanged, not relevant to OAuth work.

**Design implication:** because `guardApiRequest` dispatches purely on `kind = "workspace"` inside `validateRawWorkspaceToken`'s WHERE clause, and OAuth-minted tokens will carry a **different** kind (`"oauth"`, per the task's design constraint), **`validateRawWorkspaceToken`'s query needs to accept BOTH kinds** (or we add a sibling function) — this is the one real code change on the validation side, and it is exactly the "at most a kind/expiry tweak" the task anticipates. No new auth path, one broadened `WHERE kind IN (...)` (or `OR`) clause.

### 2.4 `src/proxy.ts` — the matcher gotcha, confirmed and quoted verbatim

Full file read (918 lines). **This is a whitelist matcher** — the file's own comments say so repeatedly, e.g. on the `/services/:path*` entry: *"WITHOUT this entry those requests never reach the proxy at all (this matcher is a whitelist)."*

The exact current `config.matcher` array (verbatim, lines 848–917):
```ts
export const config = {
  matcher: [
    "/",
    "/login",
    "/signup",
    "/pricing",
    "/build",
    "/services/:path*",
    "/l/:path*",
    "/book/:path*",
    "/forms/:path*",
    "/intake",
    "/intake/:path*",
    "/clients/new",
    "/welcome",
    "/orgs/:path*",
    "/hub/:path*",
    "/dashboard/:path*",
    "/contacts/:path*",
    "/deals/:path*",
    "/activities/:path*",
    "/forms/:path*",
    "/settings/:path*",
    "/api/v1/:path*",
    "/marketplace",
    "/marketplace/:path*",
    "/ai-agents",
    "/ai-agents/:path*",
    "/v1",
  ],
};
```

**Critical nuance the task brief slightly understates:** it's not just that a new public path needs adding to the matcher "or the middleware never sees it" — it's the **opposite direction that matters more here**. Two precedents already in this exact repo (`src/app/api/ap2/.well-known/route.ts` and `src/app/.well-known/openai-apps-challenge/route.ts`) are **fully public, unauthenticated, static routes that are deliberately NOT in the matcher** — and that's correct, because being outside the matcher means `proxy()`/`authProxy` (session lookup, plan-gate, onboarding redirects, org-cookie logic) never runs for them at all. For our new `.well-known/oauth-*` and `/oauth/*` paths:

- **`/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`** should follow the **same "leave them out of the matcher" pattern** as the two existing `.well-known` routes — they're static, public, unauthenticated JSON documents. Adding them to the matcher would be actively wrong (it would run the onboarding/plan-gate pipeline against an anonymous OAuth-discovery GET for no reason, and risk drive-by breakage if `authProxy`'s session-lookup throws).
- **`POST /api/oauth/register`** lives under `/api/v1/…`? **No** — check: the existing matcher only admits `/api/v1/:path*`, and our new route is `/api/oauth/register`, a sibling path, NOT under `/api/v1/`. So it is **also outside the matcher today**, and needs **no matcher change at all** if we want it fully public (which DCR must be, by definition — a client with no prior relationship can't have a session). Confirmed: `/api/oauth/*` does not match any existing matcher entry.
- **`GET /oauth/authorize`** is the one exception: it **requires the existing NextAuth session** to render the consent screen (task constraint: "requires existing app session via NextAuth"). This means it's the one new path that plausibly *should* go through some of `authProxy`'s logic (or at minimum needs `auth()` invoked). Two options: (a) add `/oauth/authorize` to the matcher so `authProxy` runs and populates `request.auth`, redirecting to `/login?callbackUrl=/oauth/authorize?...` on `isProtectedPath` if unauthenticated (mirroring the existing `isProtectedPath`/`isAuthenticated` redirect at line 619 exactly) — but this requires threading it through the full query-string-preserving redirect, which the existing pattern doesn't quite do (it redirects to `/login`, not `/login?callbackUrl=…`, today); or (b) have the `/oauth/authorize` route handler call `auth()` directly itself (same helper `proxy.ts` imports as `import { auth } from "@/auth"`) and handle the redirect-to-login-with-return-url logic locally, bypassing `authProxy` entirely. **We choose (b)** — it's simpler, avoids extending `authProxy`'s onboarding/plan-gate logic (soul-completed checks, welcome-shown checks, plan-gate) onto a page that has nothing to do with any of those concerns, and matches the "thin route handler calls `auth()` directly" pattern already used in the codebase's page-layer `requireAuth` (referenced in `proxy.ts`'s own comments about admin-token validation happening "at the page layer"). **This means `/oauth/authorize` also needs NO new matcher entry** — it's a plain authenticated page route that resolves its own session.
- **`POST /api/oauth/token`** is public/unauthenticated by definition (a fresh client with a code has no session) and, like `/api/oauth/register`, needs no matcher entry.

**Net result: THIS DESIGN NEEDS ZERO CHANGES TO `proxy.ts`'s `config.matcher` ARRAY.** This is a deliberate, load-bearing design decision, not an oversight — every new route is either (a) a static public JSON document mirroring the two existing unmatched `.well-known` precedents, or (b) already falls under an existing catch-all's *complement* (nothing under `/api/oauth/*` or `/oauth/*` is matched today, and we want it to stay that way for the two public ones), or (c) a page route that resolves its own auth directly rather than relying on `authProxy`. The plan in the companion document still includes an **explicit verification task** ("confirm no matcher change is needed, with a negative-space test") precisely because this is the repo's single most-cited gotcha and deserves a proof, not just an assertion — see Task 14 in the plan.

One more nuance from `proxy.ts` worth carrying into the plan: `handleBuilderMcpHost` (the function that rewrites `mcp.seldonframe.com/v1` → `/api/mcp/v1`) is scoped to `builderMcpHosts = new Set(["mcp.seldonframe.com"])` and **only rewrites the literal path `/v1`** — everything else on that host passes through untouched (`return NextResponse.next()`). This means `/.well-known/oauth-protected-resource` **on the `mcp.seldonframe.com` host** is NOT rewritten by `handleBuilderMcpHost` and falls through to Next's normal router on that host — which is fine, since we intend to serve that document as a real Next route reachable on that host directly (no rewrite needed, since it isn't `/v1`). We must verify (Task 6 in the plan) that a plain `packages/crm/src/app/.well-known/oauth-protected-resource/route.ts` responds correctly when the `Host` header is `mcp.seldonframe.com`, i.e. that nothing about `handleBuilderMcpHost`'s early-return for non-`/v1` paths on that host accidentally 404s it. Reading the function again: it returns `NextResponse.next()` for any path ≠ `/v1` on that host, which lets Next's own file-based router serve whatever's actually there — so this should just work, but it's exactly the kind of assumption Task 6 must prove with a live/dev-server curl, not just static code reading.

### 2.5 `src/lib/auth/config.ts` — the existing NextAuth session, reused as-is

Full file read (416 lines). Key facts for our consent screen:
- `session: { strategy: "jwt" }` — no custom cookie config, so NextAuth v5/Auth.js default cookie names apply.
- Providers: Google OAuth (conditional on env) + Resend magic-link (conditional on env).
- The `jwt` callback enriches the token with `orgId`, `role`, `planId`, `subscriptionStatus`, etc., by querying `users` then `organizations`.
- The `session` callback copies all of these onto `session.user` — in particular `session.user.id` (from `token.sub`) and `session.user.orgId`.
- `proxy.ts` itself demonstrates the exact call pattern our `/oauth/authorize` route will reuse: `import { auth } from "@/auth";` then `request.auth?.user` (or, in a route handler rather than middleware, `await auth()` returning the same session shape).

**For the multi-workspace picker:** `session.user.orgId` is the user's *single* "active" org (set via the `sf_active_org_id` cookie or the JWT default), but a user can belong to multiple orgs via the `org_members` join table:

```ts
// src/db/schema/org-members.ts (full file read)
export const orgMembers = pgTable("org_members", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  createdAt: timestamp(...).notNull().defaultNow(),
  updatedAt: timestamp(...).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("org_members_org_user_unique_idx").on(table.orgId, table.userId),
  index("org_members_user_id_idx").on(table.userId),
  index("org_members_org_id_idx").on(table.orgId),
]);
```

The consent screen's workspace picker queries `orgMembers` joined to `organizations` filtered by `userId = session.user.id`, and lets the user pick which `orgId` the minted token should be scoped to (defaulting to `session.user.orgId`, the currently-active one, pre-selected).

### 2.6 `src/db/schema/api-keys.ts` — the table we extend, not replace

Full file read (30 lines). **Important correction to a task assumption:** `kind` is a plain Postgres `text` column with a TypeScript-level union type, **not a Postgres enum**:

```ts
export type ApiKeyKind = "user" | "workspace";

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  kind: text("kind").$type<ApiKeyKind>().notNull().default("user"),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("api_keys_org_idx").on(table.orgId),
  index("api_keys_kind_prefix_idx").on(table.kind, table.keyPrefix),
]);
```

This means adding `"oauth"` as a third kind is a **pure TypeScript type-union edit** (`export type ApiKeyKind = "user" | "workspace" | "oauth";`) — **no `ALTER TYPE ... ADD VALUE` migration needed**, since there's no DB-level enum or CHECK constraint to widen. This meaningfully simplifies migration 0063 versus what the task brief's phrasing implies ("kind 'oauth'" sounded like it might need a schema-level enum change — it does not). The existing composite index `api_keys_kind_prefix_idx (kind, keyPrefix)` already covers the new kind's lookup pattern for free.

Exported from `src/db/schema/index.ts` via `export * from "./api-keys";`.

### 2.7 `src/lib/utils/rate-limit.ts` — reused as-is for the new endpoints

Full file read (115 lines). Signature:
```ts
export async function checkRateLimit(key: string, limit = 120, windowMs = 60_000): Promise<boolean>
```
Upstash Redis (fixed-window INCR+EXPIRE NX) when configured, else in-process `Map` fallback; any Redis error falls back to in-memory rather than failing the request. Returns `true` = allowed. Directly reusable with new keys like `` `oauth:register:${ip}` ``, `` `oauth:token:${clientId}` ``, `` `oauth:authorize:${userId}` ``.

### 2.8 Migrations — journal-verified, correcting the task's own assumption

Directory: `packages/crm/drizzle/` (SQL files directly in this folder; metadata in `drizzle/meta/_journal.json`).

**Confirmed by reading `_journal.json` directly (not assumed):** the latest journaled entry is
```json
{ "idx": 39, "version": "7", "when": 1783097600935, "tag": "0062_wallet_rls", "breakpoints": true }
```
`0062_wallet_rls.sql` exists on disk, is registered in the journal, and is an unrelated Postgres RLS migration for wallet tables (adds `seldonframe_app`/`seldonframe_service` roles and row-level-security policies — nothing to do with OAuth). **The task's assumption that 0063 is the next free index is CORRECT** (0062 is indeed the current latest — this was verified directly against the journal, not taken on faith from the task brief). Naming convention confirmed: `NNNN_snake_case_description.sql`, zero-padded to 4 digits. New migration: **`0063_oauth_clients.sql`** (or similar descriptive name — exact name decided in the plan).

### 2.9 Existing `.well-known` precedents (style to mirror)

Two static, unauthenticated, matcher-excluded routes already exist:
1. `src/app/api/ap2/.well-known/route.ts` — `GET /api/ap2/.well-known`, `export const runtime = "nodejs";`, plain `NextResponse.json({...})`, no auth, no DB.
2. `src/app/.well-known/openai-apps-challenge/route.ts` — `GET /.well-known/openai-apps-challenge`, `export const dynamic = "force-static";`, returns a hardcoded plaintext token.

Our two new `.well-known` routes (`oauth-protected-resource`, `oauth-authorization-server`) follow pattern (1)'s shape most closely (JSON body, `runtime = "nodejs"` since the AS metadata needs `process.env` reads for the exact production URL, not fully static).

There's also a pre-existing **unrelated** `public/.well-known/mcp/server-card.json` static asset (an MCP server-card, not OAuth metadata) — confirmed no path collision with our new `/.well-known/oauth-*` routes.

### 2.10 Test style precedent

`packages/crm/tests/unit/auth/workspace-token-parse.spec.ts` (full file read, 45 lines) is the exact style template for our new pure-module specs: `node:test` (`describe`/`it`) + `node:assert/strict`, importing via the `@/` path alias, one `describe` block per function, each `it` a single behavior assertion with a one-line comment explaining the "why" when non-obvious. New specs for PKCE verification, code hashing, redirect validation, and metadata builders follow this exact shape.

Test runner: `scripts/run-unit-tests.js` (top-level, NOT inside `packages/crm`) — globs `tests/unit/**/*.spec.ts` and `**/*.spec.tsx` under `packages/crm`, then runs `node --import tsx --test <files>` with `cwd: packages/crm`. Invoked via `pnpm test:unit` at the repo root (confirmed indirectly; the glob-form command in the plan's verify gate mirrors this exact invocation).

---

## 3. Architecture

### 3.1 Component diagram (textual — see companion plan for the exact task-by-task build order)

```
claude.ai (or Claude Code)
   │
   │ 1. POST /api/mcp/v1 (no token)
   ▼
mcp.seldonframe.com/v1  ──────► rewritten to /api/mcp/v1 (existing handleBuilderMcpHost)
   │
   │ 2. 401 + WWW-Authenticate: Bearer resource_metadata="https://mcp.seldonframe.com/.well-known/oauth-protected-resource"
   │    (existing JSON-RPC error body UNCHANGED; header is new)
   ▼
GET https://mcp.seldonframe.com/.well-known/oauth-protected-resource
   │  { "resource": "https://mcp.seldonframe.com/v1",
   │    "authorization_servers": ["https://app.seldonframe.com"] }
   ▼
GET https://app.seldonframe.com/.well-known/oauth-authorization-server
   │  { issuer, authorization_endpoint, token_endpoint, registration_endpoint,
   │    code_challenge_methods_supported: ["S256"], ... }
   ▼
POST https://app.seldonframe.com/api/oauth/register   (DCR, open, public client)
   │  → { client_id, redirect_uris echoed back, token_endpoint_auth_method: "none" }
   ▼
GET https://app.seldonframe.com/oauth/authorize?client_id=...&code_challenge=...&code_challenge_method=S256&redirect_uri=...&resource=https://mcp.seldonframe.com/v1&state=...
   │  → requires existing NextAuth session (redirects to /login?... if absent, returns to /oauth/authorize after)
   │  → consent screen: "Claude wants to access <workspace picker>" + redirect URI hostname shown clearly
   ▼
User approves → 302 to redirect_uri?code=...&state=...   (code TTL ≤60s, single-use, hashed at rest)
   ▼
POST https://app.seldonframe.com/api/oauth/token   (grant_type=authorization_code, code_verifier, resource)
   │  → validates PKCE S256, exact client_id+redirect_uri match, mints wst_ token (kind="oauth", ~1h expiry) + refresh token
   ▼
claude.ai stores { access_token, refresh_token, expires_at }
   ▼
POST https://mcp.seldonframe.com/v1  Authorization: Bearer wst_...
   │  → guardApiRequest / resolveWorkspaceBearer / validateRawWorkspaceToken — UNCHANGED CODE PATH,
   │    just now also matches kind="oauth" rows, same as it always matched kind="workspace"
   ▼
200 OK (existing discover/inspect/run dispatch, completely untouched)
```

### 3.2 New database tables (migration 0063, additive only)

```sql
-- oauth_clients: one row per DCR-registered client (or manually pre-registered, for
-- future non-DCR paths). Public clients only for v1 (task constraint) — no client
-- secret column, no confidential-client support. token_endpoint_auth_method is
-- always "none".
CREATE TABLE oauth_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL UNIQUE,           -- opaque, returned to the registrant
  client_name text,                          -- from DCR request, display-only (consent screen)
  redirect_uris jsonb NOT NULL,              -- text[] serialized; exact-match allowlist per client
  created_at timestamptz NOT NULL DEFAULT now(),
  -- No client_secret_hash column: public clients only, by design constraint.
  -- No updated_at: clients are immutable after registration in v1 (no PATCH /register/:id).
);
CREATE INDEX oauth_clients_client_id_idx ON oauth_clients (client_id);

-- oauth_authorization_codes: single-use, short-TTL, hashed at rest.
CREATE TABLE oauth_authorization_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,             -- SHA-256 of the raw code; raw code NEVER stored
  client_id text NOT NULL REFERENCES oauth_clients (client_id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,                 -- bound at issuance; token exchange must match exactly
  org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,  -- who consented (audit trail)
  code_challenge text NOT NULL,               -- PKCE, base64url(S256(verifier)) — S256 ONLY, no "plain"
  resource text,                              -- RFC 8707 resource param, if the client sent one
  scope text,                                 -- reserved for future scoping; unused in v1 (single implicit scope)
  expires_at timestamptz NOT NULL,            -- issued_at + 60s, enforced server-side regardless of client TTL asks
  consumed_at timestamptz,                    -- set on first (and only allowed) redemption; NULL = still valid
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX oauth_auth_codes_code_hash_idx ON oauth_authorization_codes (code_hash);
CREATE INDEX oauth_auth_codes_client_id_idx ON oauth_authorization_codes (client_id);

-- oauth_refresh_tokens: rotating, hashed, family-linked for reuse detection.
CREATE TABLE oauth_refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,            -- SHA-256 of the raw refresh token
  family_id uuid NOT NULL,                    -- shared across a rotation chain; NEW row each rotation, same family_id
  client_id text NOT NULL REFERENCES oauth_clients (client_id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  api_key_id uuid REFERENCES api_keys (id) ON DELETE CASCADE,  -- the currently-live wst_ token this refresh chain mints
  resource text,
  revoked_at timestamptz,                     -- set on rotation (old token) OR on reuse-detected family revocation
  expires_at timestamptz NOT NULL,            -- refresh tokens are long-lived but not infinite (30d, task-decided in plan)
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX oauth_refresh_tokens_token_hash_idx ON oauth_refresh_tokens (token_hash);
CREATE INDEX oauth_refresh_tokens_family_id_idx ON oauth_refresh_tokens (family_id);
```

**Reuse-detection mechanics (the "revoke family" requirement):** on every refresh grant, the presented `refresh_token` must resolve to a row with `revoked_at IS NULL`. On successful rotation: mark the presented row `revoked_at = now()`, insert a **new** row with the **same `family_id`**. If a caller ever presents an **already-revoked** token (i.e., `revoked_at IS NOT NULL` but the hash still matches a real row) — that's the signature of a stolen-and-replayed refresh token (the legitimate client already rotated past it) — **revoke every row in that `family_id`** and force the client back through a full `/oauth/authorize` consent flow next time. This is the standard OAuth 2.1 refresh-token-rotation-with-reuse-detection pattern; `api_key_id` lets us also immediately revoke the currently-live `wst_` access token tied to a compromised family, not just future refreshes.

**No RLS on these tables in v1** — they're never queried by arbitrary org-scoped app code (only by the OAuth route handlers, which already have `org_id`/`client_id` in hand from the request context), so the RLS concern that motivated `0062_wallet_rls` doesn't apply here. Noted explicitly so a future auditor doesn't wonder why these three tables lack it while `wallet_accounts` has it.

### 3.3 Token kind extension

```ts
// src/db/schema/api-keys.ts — ONE line changed, no migration needed for this part
export type ApiKeyKind = "user" | "workspace" | "oauth";
```

`validateRawWorkspaceToken` in `workspace-token.ts` changes its WHERE clause from `eq(apiKeys.kind, "workspace")` to `inArray(apiKeys.kind, ["workspace", "oauth"])` (or two `eq(...)` joined with `or(...)` — drizzle-orm supports both; the plan picks `inArray` for readability). This is the **entire** blast radius on the existing validation function — everything else (prefix/hash lookup, expiry check, `lastUsedAt` touch, the anti-probing null-for-both-failure-modes behavior) is untouched. `mintWorkspaceToken` itself needs a new optional `kind` parameter (defaulting to `"workspace"` to preserve every existing call site's behavior byte-for-byte) so the OAuth token endpoint can mint `kind: "oauth"` rows.

**Prefix decision:** OAuth-minted tokens keep the **exact same `wst_` prefix** — no new prefix like `wsto_` or `oat_`. Rationale: (a) `extractWorkspaceToken`'s bare-token tolerance and every downstream `startsWith(TOKEN_PREFIX)` check already works for free; (b) the task's own framing ("mint a workspace-scoped token... so guardApiRequest/resolveWorkspaceBearer validate them with at most a kind/expiry tweak") implies reusing the prefix; (c) there's no user-facing reason to distinguish an OAuth-minted token from a manually-copied one — both are "a workspace bearer," just minted via a different ceremony. The **only** distinguishing signal is the `kind` column, which is exactly the column DB queries already discriminate on. Documented explicitly in the plan (Task 8) since this is a one-way door worth a deliberate sentence, not silent convention.

**Expiry:** `~1h` per the task constraint, via the existing `expiresInDays` mechanism generalized slightly (or a new `expiresInSeconds`/`expiresInMinutes` option, since `expiresInDays` as currently typed can't express "1 hour" — `expiresInDays: 0.0417` would technically work arithmetically but reads terribly; the plan adds a sibling `expiresInMinutes` option to `MintWorkspaceTokenOptions` rather than abusing the days field).

### 3.4 Endpoint surface (all behind `SF_OAUTH_ENABLED`)

| Method | Path | Host | Auth | Notes |
|---|---|---|---|---|
| GET | `/.well-known/oauth-protected-resource` | `mcp.seldonframe.com` | none | RFC 9728. Static-ish JSON, `resource` = exact literal `https://mcp.seldonframe.com/v1`. |
| GET | `/.well-known/oauth-authorization-server` | `app.seldonframe.com` | none | RFC 8414. `issuer` = `https://app.seldonframe.com`, advertises all 3 OAuth endpoints + `code_challenge_methods_supported: ["S256"]`. |
| POST | `/api/oauth/register` | `app.seldonframe.com` | none (open DCR) | RFC 7591. `Content-Type: application/json`. Public clients only (`token_endpoint_auth_method: "none"` forced). Redirect URI allowlist rules enforced at registration time (loopback + the claude.ai callback are always acceptable; arbitrary HTTPS URLs accepted per open-DCR spirit but exact-matched later). |
| GET | `/oauth/authorize` | `app.seldonframe.com` | NextAuth session (redirects to login, returns here) | Renders consent screen with workspace picker. PKCE S256 required in the request or immediate `error=invalid_request`. |
| POST | `/oauth/authorize` (form submit) | `app.seldonframe.com` | NextAuth session | The "Approve" button's target — issues the code, 302s to `redirect_uri`. |
| POST | `/api/oauth/token` | `app.seldonframe.com` | none (client presents code/refresh_token as the credential) | RFC 6749 §4.1.3 form-urlencoded. `grant_type=authorization_code` or `grant_type=refresh_token`. |

All six 404 (not 501, not a JSON error body — a bare 404, matching "off" meaning "doesn't exist") when `SF_OAUTH_ENABLED` is unset/false. The existing `wst_` bearer flow (manual token paste) is **completely unaffected** by the flag either way — it has never depended on any of this.

### 3.5 The 401 change on the existing MCP route

**Exact diff shape** (illustrative, not final code — final code lives in the plan):
```ts
// src/app/api/mcp/v1/route.ts
const guard = await guardApiRequest(request);
if (guard.error) {
  const headers = SF_OAUTH_ENABLED
    ? { ...CORS_HEADERS, "WWW-Authenticate": `Bearer resource_metadata="https://mcp.seldonframe.com/.well-known/oauth-protected-resource"` }
    : CORS_HEADERS;
  return NextResponse.json(unauthorizedRpcBody(), { status: 401, headers });
}
```
`unauthorizedRpcBody()` — the JSON-RPC error envelope — is **byte-for-byte unchanged**; only a response header is conditionally added. When the flag is off, behavior is pixel-identical to today (no header at all, exactly as now).

---

## 4. Security analysis (against the task's explicit constraints + spec MUSTs)

| Requirement | Mechanism |
|---|---|
| Exact `redirect_uri` match | `oauth_clients.redirect_uris` is the allowlist set at registration; `/oauth/authorize` and `/api/oauth/token` both re-check the presented `redirect_uri` against that exact array (string equality, no prefix/wildcard matching) — except the documented RFC 8252 port-agnostic loopback exception for `localhost`/`127.0.0.1`. |
| `state` passthrough | `/oauth/authorize` echoes the client's `state` param verbatim on the final redirect; never generated or interpreted server-side (it's the client's CSRF token, not ours). |
| Code bound to `client_id` + `redirect_uri` + PKCE | All three stored on `oauth_authorization_codes` at issuance; `/api/oauth/token` re-validates all three before minting anything. |
| Refresh rotation + reuse detection | §3.2's `family_id` mechanism — old token marked `revoked_at`, new row same family; presenting an already-revoked hash nukes the whole family. |
| Rate limits via `checkRateLimit` | `/api/oauth/register` limited per-IP (open DCR is the most abuse-prone endpoint — no auth at all); `/oauth/authorize` limited per-user; `/api/oauth/token` limited per-`client_id`. Reuses the exact existing function signature, no new rate-limit infra. |
| No open redirects | `/oauth/authorize`'s consent-approval 302 target is **always** one of `oauth_clients.redirect_uris` for that exact `client_id` — never an arbitrary URL from the request. Malformed/unregistered `redirect_uri` at the `/oauth/authorize` GET step returns an **in-page error**, not a redirect (per spec: "Authorization servers SHOULD only automatically redirect the user agent if it trusts the redirection URI"). |
| CORS only where required | The MCP endpoint (`/api/mcp/v1`) already has permissive CORS (pre-existing, unrelated to this design — the endpoint is bearer-gated so a permissive Origin doesn't loosen anything). The new `/api/oauth/*` endpoints do **not** need browser CORS at all — DCR, token exchange, and the authorize redirect are all either server-to-server or full-page browser navigations (not `fetch()` from a foreign origin), so no `Access-Control-Allow-Origin` header is added to any of them. This satisfies "CORS only where the MCP spec requires" by adding none where the spec doesn't. |
| PKCE S256 only | `code_challenge_method` other than `S256` (including legacy `plain`) is rejected at `/oauth/authorize` with `error=invalid_request` — never silently downgraded. AS metadata advertises only `["S256"]`. |
| Code TTL ≤ 60s, single-use | `expires_at = issued_at + 60s` enforced server-side (a client can't ask for longer); `consumed_at` set atomically on first redemption (a DB-level `UPDATE ... WHERE consumed_at IS NULL RETURNING *` — a second concurrent redemption attempt sees zero rows updated and 400s with `invalid_grant`). |
| Hash everything at rest | `code_hash` (SHA-256), `token_hash` (SHA-256) on refresh tokens — mirrors the exact `keyHash`/SHA-256 pattern already used by `mintWorkspaceToken`/`validateRawWorkspaceToken`. Raw values exist only in-memory for the single response that returns them, never logged, never persisted. |
| Money-safe / inert | `SF_OAUTH_ENABLED` gate — see §3.4. Additive migration, additive schema field, additive route files. Zero existing behavior changes when off. |
| Audience / token-passthrough (spec MUST) | We never forward a token we didn't mint ourselves to any upstream API (no confused-deputy surface — this AS only ever issues tokens for our own resource server, never proxies a third-party token). `validateRawWorkspaceToken` already only accepts tokens it minted (DB lookup, not a decoded/trusted external JWT), so "audience validation" is structurally guaranteed by the lookup itself. |

---

## 5. Money-safety / inertness check

- `SF_OAUTH_ENABLED` unset or `"false"` → all six new routes 404. Zero DB writes possible (they never execute). Zero new env vars required elsewhere.
- The existing `wst_` manual-paste flow (mint via admin UI or CLI, paste into `claude mcp add --header`) is **not** deprecated, **not** changed, and has no dependency on this feature whatsoever — it is a permanently-supported, independent auth path per the task's explicit requirement ("Bearer wst_ auth keeps working unchanged forever (additive)").
- No billing/wallet/Stripe touchpoints anywhere in this design — OAuth token minting has zero cost implications; it's purely an auth ceremony wrapping the existing free-to-mint `wst_` token rail.
- Migration 0063 is pure `CREATE TABLE` (additive) plus one non-breaking TS union widening — no `ALTER TABLE ... DROP`, no data migration, no backfill.

---

## 6. Claude.ai directory submission checklist (grounded in §1.2)

What **Max submits** (from the 11-step submission form at `/connectors/building/submission`):

1. **Introduction** — acknowledge directory-inclusion overview (no input).
2. **Connection** — server URL (`https://mcp.seldonframe.com/v1`), transport type (Streamable HTTP — confirmed our route already implements this, with a spec-legal 405-not-404 on GET for the no-SSE-in-v1 case), connection model.
3. **Tools** — Anthropic auto-syncs our tool list (discover/inspect/run) and flags any missing `title`/`readOnlyHint`/`destructiveHint` annotations. **Action item independent of OAuth:** verify our existing three tools already carry these annotations, and specifically verify `run` doesn't conflate safe+unsafe HTTP semantics in one tool (the review-criteria page's explicit rejection reason) — flagged as an open question in §7, not solved by this OAuth design.
4. **Listing** — name (≤100 chars), tagline (≤55 chars), description (≤2000 chars), 1–5 categories, documentation URL, support contact, icon/logo, slug.
5. **Use Cases** — primary scenarios, required user setup (a SeldonFrame workspace + `wst_`/OAuth-minted token), read/write/both data-handling scope (both — discover=read, run=write-capable depending on tool).
6. **Company** — company name, website, primary review-contact.
7. **Authentication** — method selection: **OAuth** (this design). Anthropic's form will likely ask which registration mechanism (DCR / CIMD / static) — answer: **DCR**, per this design's choice in §1.1.
8. **Data Handling** — confirm API ownership (first-party only — true, everything routes through our own `/api/v1/build/*`), health-data flag (no), sponsored-content flag (no).
9. **Test & Launch** — provide a **fully populated test account** (a real SeldonFrame workspace with sample contacts/deals/bookings) + working OAuth credentials Anthropic's reviewer can complete a live authorize→token→tool-call flow with. This is a hard submission requirement ("Test credentials required (fully populated account)") — the plan's smoke-script deliverable (§ below) doubles as the reviewer's own manual test path, since it exercises the identical flow a human reviewer clicking through claude.ai's UI would.
10. **Compliance** — seven policy acknowledgments (Anthropic Software Directory Terms, accurate-description obligation, etc.) — legal/business sign-off, not engineering.
11. **Review** — final submit.

What **Anthropic reviews** (from `/connectors/building/review-criteria`, the explicit pre-submission checklist):
- Every tool succeeds with valid parameters ("generic errors fail review") — reviewer calls each tool live.
- Tool descriptions match actual behavior — "reviewers call every tool and verify."
- No prompt-injection patterns in any tool description.
- Response sizes are "appropriately sized" (no page-dumping).
- HTTPS-only, first-party-API-only, no financial-transfer / AI-media tools (we have neither).
- `claude plugin validate` + MCP Inspector testing (mentioned as pre-submission developer-side checks, not something Anthropic runs *for* us — Max should run both locally before submitting).
- Security: "meet Anthropic's security standards," "respond to security issues promptly" (an ongoing operational commitment, not a one-time gate).

**Common stated disqualifiers:** missing/incomplete privacy policy (immediate rejection — **note:** this applies primarily to local/plugin connectors per the fetched text; still worth having a real, linked privacy policy URL ready in the Listing step regardless, since the form asks for one), unannotated tools, non-HTTPS URLs, un-owned declared link origins, missing compliance acknowledgments.

**Timeline:** "Review times vary with queue volume" — no fixed SLA stated. Escalation contact: `mcp-review@anthropic.com`.

### Smoke-script outline (grounded in the flow diagram of §3.1)

A dev-deploy smoke script (full implementation in the companion plan, Task 15) that:
1. `curl -s https://mcp.seldonframe.com/.well-known/oauth-protected-resource | jq .` — assert `resource` == exact literal `https://mcp.seldonframe.com/v1` and `authorization_servers` is a single-entry array.
2. `curl -s https://app.seldonframe.com/.well-known/oauth-authorization-server | jq .` — assert `code_challenge_methods_supported == ["S256"]`, `registration_endpoint` present, `issuer == "https://app.seldonframe.com"`.
3. `curl -s -X POST .../api/oauth/register -H 'Content-Type: application/json' -d '{"redirect_uris": ["http://127.0.0.1:PORT/callback"], "client_name": "smoke-test"}'` — capture the returned `client_id`.
4. Generate a PKCE pair (`code_verifier` random, `code_challenge = base64url(SHA256(code_verifier))`) in the script itself (Node one-liner, no new deps).
5. Print the full `/oauth/authorize?...` URL for a human to open in a browser (this step **cannot** be scripted end-to-end — it requires a real logged-in session and a human clicking "Approve" — the script pauses and waits for the human to paste back the `code` from the redirected URL).
6. `curl -s -X POST .../api/oauth/token -H 'Content-Type: application/x-www-form-urlencoded' --data-urlencode grant_type=authorization_code --data-urlencode "code=$CODE" --data-urlencode "code_verifier=$VERIFIER" --data-urlencode "client_id=$CLIENT_ID" --data-urlencode "redirect_uri=$REDIRECT_URI"` — assert `access_token` starts with `wst_` and `refresh_token` is present.
7. `curl -s -X POST https://mcp.seldonframe.com/v1 -H "Authorization: Bearer $ACCESS_TOKEN" -d '{"jsonrpc":"2.0","id":1,"method":"initialize", ...}'` — assert 200, not 401.
8. Refresh-grant round-trip: `grant_type=refresh_token` with the captured `refresh_token` — assert a **new** `refresh_token` comes back (rotation) and the **old** one now 400s with `error=invalid_grant` if replayed (reuse detection, exercised deliberately).

---

## 7. Open questions / potential hard blockers

None of the below block *this* design from being buildable — they're flagged because they could affect timeline or require a follow-up decision, not because OAuth itself is infeasible to self-host.

1. **DCR-per-connection traffic growth is real, per Anthropic's own docs** (§1.2): "DCR causes Claude to register a new client on every fresh connection." At SeldonFrame's current scale this is a non-issue (bounded by connector-install count, not global claude.ai user count), but if the marketplace/agent-rental MCPs (out of scope here) ever needed the same treatment at higher volume, CIMD or a static Anthropic-issued client id would be the documented lighter-weight alternative. **Not a blocker — noted as a fast-follow, not required for initial submission.**
2. **Tool-annotation compliance is a separate, OAuth-independent submission gate.** The review-criteria page's rejection of "a single tool that accepts both safe and unsafe HTTP methods" needs a direct look at our existing `run` tool (in `src/lib/build/mcp/build-mcp-rpc.ts`, not read in this pass — out of scope for an OAuth design doc, but **will block directory submission regardless of how good the OAuth layer is**). Recommend a follow-up audit pass before Max submits, independent of this OAuth build.
3. **Privacy policy URL.** The submission form has a Listing-step field for a documentation/support URL and the compliance step references policy acknowledgments; confirm SeldonFrame has a public, linked privacy policy page ready (not verified in this pass — outside a codebase-groundable fact, it's a business/legal asset check).
4. **No hard blocker found where Anthropic requires something we structurally cannot self-host.** OAuth 2.1 + DCR + the two well-knowns are all self-hostable with the existing NextAuth session + `apiKeys` rail — nothing in Anthropic's docs mandates a third-party IdP, a specific cloud provider, or functionality SeldonFrame's stack can't produce.
