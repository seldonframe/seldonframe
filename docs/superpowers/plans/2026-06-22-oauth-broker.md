# BYO-OAuth-App Broker (+ Google Business Profile) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`. **Security-sensitive (OAuth) — build focused, not rushed.**

**Goal:** A builder registers their OWN OAuth app (Google first) **once**; SeldonFrame runs the per-client consent flow with it, stores per-client tokens encrypted, and OAuth-based tools use them. Proof connector: **Google Business Profile** review-reply (the #7 review agent's gap). Unlocks the OAuth connector directory (GBP → Google Calendar → HubSpot/Notion/Slack) **and** the two-way calendar — all on one broker so SF never does CASA.

**Architecture (from recon):** Mirror the Stripe-Connect `connect/start` + `connect/return` pattern. Two new tables (builder app config + per-client tokens, encrypted via the existing AES-GCM `encryptValue`/`workspaceSecrets`). A per-provider registry (Google). `configure` action (builder stores app creds) → `/api/oauth/authorize/[provider]` (per-client consent w/ state+PKCE) → `/api/oauth/callback` (code→token→store). A token-resolution seam the consumers call. First consumer = a **native** GBP adapter (GBP has no MCP server) exposing `list_reviews` + `reply_to_review` as `AgentTool`s.

**Tech Stack:** as the other plans. One additive migration. Conventions identical. **Security:** PKCE + `state` CSRF on the flow; `client_secret` + tokens **encrypted** (never plaintext, never logged); HTTPS redirect only; per-provider scope allowlist; the callback validates state before any token exchange.

## Reused (from recon)
`lib/encryption.ts` (`encryptValue`/`decryptValue`, `v1.` prefix); `lib/secrets.ts` (`storeSecret`/`getSecretValue`); the Stripe-Connect route pattern (`api/v1/proposals/connect/{start,return}/route.ts`); the Settings → Integrations UI (`settings/integrations/page.tsx`, `lib/integrations/actions.ts`); the MCP connector token-resolution seam (`lib/agents/mcp/wrap-tool.ts`/`client.ts`) for the later OAuth-MCP swap; the agent tool shape (`lib/agents/tools.ts` `AgentTool`).

---

## Task 1: Schema + additive migration

**Files:** Create `packages/crm/src/db/schema/oauth.ts` (+ export from the schema index); generate `drizzle/00NN_*.sql`.

- [ ] `oauth_provider_configs` — `id, orgId (FK organizations, cascade), provider (text), clientId (text), clientSecretRef (text — the workspaceSecrets serviceName), redirectUri (text), scopes (text[]), createdAt`. Unique `(orgId, provider)`.
- [ ] `oauth_client_tokens` — `id, orgId (FK, the builder), provider (text), workspaceId (FK organizations — the client workspace), accessTokenEnc (text), refreshTokenEnc (text, nullable), expiresAt (timestamptz), scope (text), createdAt, updatedAt`. Index `(orgId, provider)` + `(workspaceId, provider)`.
- [ ] Generate the migration → verify additive (2 `CREATE TABLE` + indexes) + journal append (mirror prior). Paste SQL in the commit. tsc 0 new. **Commit** `feat(oauth): broker schema — provider configs + per-client tokens (additive migration)`.

---

## Task 2: OAuth provider registry + broker core (pure, TDD)

**Files:** Create `packages/crm/src/lib/oauth/providers.ts` + `packages/crm/src/lib/oauth/broker.ts`; Test both.

- [ ] **Registry:** `OAUTH_PROVIDERS = { google: { authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token", defaultScopes: ["https://www.googleapis.com/auth/business.manage"], usesPKCE: true } }`.
- [ ] **Pure core (DI fetch):** `buildConsentUrl({ provider, clientId, redirectUri, scopes, state, codeChallenge })` → string; `exchangeCodeForTokens({ provider, clientId, clientSecret, code, redirectUri, codeVerifier }, fetchImpl)` → `{ accessToken, refreshToken?, expiresIn, scope }`; `refreshAccessToken({ provider, clientId, clientSecret, refreshToken }, fetchImpl)` → tokens; `makePkcePair(randomBytes)` (DI randomness — no `Math.random` in pure code). Map non-2xx → typed errors.
- [ ] **TDD:** consent URL has the right params + scopes; code exchange parses the token response; refresh works; non-2xx mapped; reject non-HTTPS redirect. **Commit** `feat(oauth): provider registry + pure broker core (consent/exchange/refresh, TDD)`.

---

## Task 3: Configure action + Connections UI

**Files:** Create `packages/crm/src/lib/oauth/actions.ts`; modify the Integrations page.

- [ ] `configureOAuthAppAction({ provider, clientId, clientSecret, scopes? })` (`"use server"`): org-guard; HTTPS redirect built from `NEXT_PUBLIC_APP_URL` (`/api/oauth/callback`); store `clientSecret` via `storeSecret({ workspaceId: orgId, serviceName: "oauth_<provider>" })`; upsert `oauth_provider_configs`. `getOAuthConfigStatusAction` (configured? scopes? the redirect URI to copy). DI'd test of the composer.
- [ ] **UI:** a card on Settings → Integrations — "Connect an app (BYO OAuth)" → provider picker (Google) → `clientId` + `clientSecret` fields + **the redirect URI to paste into their Google Cloud app** (copy button) + a short "how to create a Google OAuth app" help link. Keep `"use client"`. **Commit** `feat(oauth): builder registers their OAuth app (configure action + Connections card)`.

---

## Task 4: Authorize + callback routes (mirror Stripe Connect)

**Files:** Create `packages/crm/src/app/api/oauth/authorize/[provider]/route.ts` + `packages/crm/src/app/api/oauth/callback/route.ts`.

- [ ] **authorize:** `GET …/authorize/google?workspaceId=…` — org-guard; load the provider config; mint `state` (+ PKCE verifier) and stash it server-side keyed by state (short-TTL — a signed cookie or a `workspaceSecrets`/cache row; choose per repo pattern); `redirect(buildConsentUrl(...))`.
- [ ] **callback:** `GET /api/oauth/callback?code=…&state=…` — **verify state first** (CSRF); resolve the provider config + decrypt the client secret; `exchangeCodeForTokens(... , codeVerifier)`; store encrypted in `oauth_client_tokens` (orgId+provider+workspaceId); redirect to a small "Connected ✓" confirmation. Never log code/tokens.
- [ ] **Token resolver:** `getClientOAuthToken({ orgId, provider, workspaceId })` in `lib/oauth/broker.ts` — load the row; if `expiresAt` within 5 min → `refreshAccessToken` + persist; return the access token. DI'd test.
- [ ] **Commit** `feat(oauth): per-client consent + callback + token refresh (state/CSRF guarded)`.

---

## Task 5: Google Business Profile review tools (the proof consumer)

**Files:** Create `packages/crm/src/lib/agents/gbp/tools.ts` (+ register in the connector registry as an OAuth connector). GBP has **no MCP server** → these are **native** `AgentTool`s using the broker token + the My Business REST API.

- [ ] `list_reviews({ locationId })` + `reply_to_review({ reviewId, comment })` as `AgentTool`s: `execute` calls `getClientOAuthToken({ orgId, provider:"google", workspaceId: ctx.orgId })` → the My Business API (`https://mybusiness.googleapis.com/v4/...`). DI fetch + token for tests. Add `google-business-profile` to the connector registry as `kind:"oauth"` so the Studio tool-picker can surface it (binding stores `provider:"google"` + `enabledTools`, NOT a key).
- [ ] Thread these into `getToolsForCapabilities` for an OAuth binding (the seam already merges connector tools; OAuth bindings resolve the token via the broker instead of a bearer secret).
- [ ] **TDD:** list/reply call the API with the resolved token (DI'd); no token → graceful skip. **Commit** `feat(gbp): Google Business Profile review tools over the OAuth broker`.

---

## Task 6: Verify
- [ ] Suites green; `tsc` 0 new; `check-use-server` clean; migration journal append + 0 orphans.
- [ ] **Report:** the security review (state/CSRF verified before exchange; secrets+tokens encrypted + never logged; HTTPS-only redirect; scope allowlist), the regression statement (the MCP bearer-key path + existing integrations untouched; OAuth is an additive branch), new-test count, and the honest gap — unit-verified; live gate needs a real Google OAuth app (builder's) + a GBP location: configure app → authorize a client → reply to a review. Next connectors (Calendar, HubSpot, Notion/Slack) reuse this broker by adding a provider entry + a consumer.

## Self-Review
- Coverage: builder app config (T1/T3) ✓; per-client consent+token (T1/T4) ✓; encrypted storage + refresh (T1/T2/T4) ✓; the MCP/native consumer seam (T5) ✓; GBP proof (T5) ✓; security (PKCE/state/encryption/HTTPS) ✓.
- Deferred: Calendar two-way (reuses the broker — own slice); HubSpot/Notion/Slack (provider entries); token revocation UI; consent audit log.
