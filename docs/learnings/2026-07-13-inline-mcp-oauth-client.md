# Inline MCP OAuth client — connect ANY official remote MCP server without an SDK

**Context (2026-07-13):** Circle's official MCP (`app.circle.so/api/mcp`) needs
OAuth sign-in, unlike postiz/rube (static bearer). We added the OAuth rail to
the existing vetted-connector system in one slice, no migrations, no new deps.
Branch `feature/circle-mcp-connector`.

## The approach (reusable for the NEXT OAuth MCP server)

1. **Probe before spec (L-35).** Two curl calls settle the whole design:
   `/.well-known/oauth-protected-resource` (Circle: 200 HTML — SPA fallback,
   i.e. NOT implemented; a content-type+shape guard is mandatory) and
   `/.well-known/oauth-authorization-server` (Circle: real RFC 8414 JSON with
   `registration_endpoint` = DCR live, PKCE S256, scopes `read write`). If DCR
   exists, you need ZERO pre-registration and ZERO env vars.
2. **Make OAuth look like a bearer.** All existing consumers (wrap-tool,
   bind-time discovery) already resolve `getSecret(orgId, serviceName) →
   string`. Keep that contract: store a JSON **token envelope**
   (`{v:1, kind:"oauth", access_token, refresh_token?, expires_at, client_id,
   client_secret?, token_endpoint, …}`) in the SAME `workspace_secrets` slot a
   bearer would use, and put ONE resolver in front
   (`resolveConnectorBearer`): plain string → verbatim; envelope → fresh
   access token (60s-skew proactive refresh, single-flight per
   org+service, rotated envelope re-persisted, fail-soft to null). Zero
   changes to any consumer.
3. **Per-workspace DCR, envelope-carried client.** Register an OAuth client
   per workspace at connect time and carry `client_id`/`client_secret` inside the
   envelope — no platform-level client storage question, org-isolated by
   construction, tolerated by every MCP AS (each Claude Desktop install DCRs
   too). Prefer `token_endpoint_auth_method:"none"` (public client + PKCE)
   when advertised.
4. **State via signed cookie, not DB.** The authorize→callback roundtrip
   state (`state`, PKCE verifier, orgId, client, exp≤10min) rides an
   HMAC-signed httpOnly `sameSite=lax` cookie — no table, no migration.
   Callback ladder: params → cookie sig (timing-safe, length-guarded) →
   expiry → state equality → session-org === cookie-org → exchange → store.
   Every failure = fixed same-origin redirect with a reason enum.
5. **Discovery fill = copy the composio marker-guard verbatim.**
   `enabledTools.length===0 && !discoveredAt` is the only fillable state;
   explicit disables pass through by reference; fail-soft everywhere; clamp
   discovered schemas to the zod bounds. A combined `fillAllBindingTools`
   (composio → vetted) swapped in at the persist seams keeps every entry
   point covered without new seams.

## Judgment calls that mattered

- **Store BEFORE probe** (review catch): the post-connect "how many tools"
  probe reads the stored secret — probing first stamped `0 tools` on every
  first connect. Any read-back that goes through storage must run after the
  write it depends on. (Same family as the read-back verification slice.)
- **Reviewer ruling worth keeping:** a DCR'd per-workspace `client_secret`
  inside a signed httpOnly cookie is SHIP — it's the workspace's own
  credential, unreadable by JS, untamperable, 10-min TTL, and usually absent
  (Circle supports "none").
- **Access levels = scopes.** Circle's documented "Read only / Full access"
  maps 1:1 to requested scopes `["read"]` vs `["read","write"]` — surface it
  as a picker at connect time; default Read only (their own rec).
- **Findability is one catalog entry.** `TOOL_CATALOG` + keywords is the
  entire "suggest this connector when the builder's sentence implies it"
  system; the editor chips, generation warnings, and unconnected-integration
  cards all derive from it. Don't build new UX for a new connector kind.

## Rule for next time

For any "connect <SaaS> official MCP" request: probe the two well-known URLs
first; if RFC 8414 + DCR are live, the whole feature is (a) one
`VETTED_CONNECTORS` entry + (b) one `TOOL_CATALOG` entry — the OAuth rail,
resolver, fill, callback, and /integrations card built here are generic.
Budget ~1 day of loop time, not a week. If DCR is absent, STOP and check for
a static-token option (then it's a 30-minute bearer entry) before building
anything.
