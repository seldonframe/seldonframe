# Circle MCP Connector — Implementer Report (2026-07-13)

Branch: `feature/circle-mcp-connector` (stacked on `feature/composio-live-discovery`)
Worktree: `.claude/worktrees/circle-mcp`

## Files changed

- `packages/crm/src/lib/agents/mcp/oauth.ts` (new)
- `packages/crm/tests/unit/agents/mcp/oauth.spec.ts` (new)
- `packages/crm/src/lib/agents/mcp/resolve-bearer.ts` (new)
- `packages/crm/tests/unit/agents/mcp/resolve-bearer.spec.ts` (new)
- `packages/crm/src/lib/agents/tools.ts` (modified — `defaultMcpDeps` routes through `resolveConnectorBearer`)
- `packages/crm/src/lib/agent-templates/template-mcp-server.ts` (modified — `realTemplateConnectorDeps.getSecret` routes through `resolveConnectorBearer`)
- `packages/crm/src/lib/agents/mcp/connectors.ts` (modified — `authType` widened, Circle entry, `boundMcpToolSchema`)
- `packages/crm/tests/unit/agents/mcp/circle-connector.spec.ts` (new)
- `packages/crm/src/lib/agents/mcp/discover-vetted-tools.ts` (new)
- `packages/crm/tests/unit/agents/mcp/discover-vetted-tools.spec.ts` (new)
- `packages/crm/src/lib/integrations/composio/discover-tools.ts` (modified — 2-line sanctioned swap in `fillBlueprintConnectorsForPersist`)
- `packages/crm/src/app/(dashboard)/studio/agents/[id]/page.tsx` (modified — call-site swap + widened undiscovered-guard + `vettedConnectors` prop gets `authType`)
- `packages/crm/src/lib/agent-templates/interview-actions.ts` (modified — call-site swap)
- `packages/crm/src/app/api/v1/recordings/compile-agent/route.ts` (modified — call-site swap)
- `packages/crm/src/lib/agents/mcp/oauth-state-cookie.ts` (new)
- `packages/crm/src/lib/agents/mcp/oauth-callback.ts` (new)
- `packages/crm/src/app/api/integrations/mcp/callback/route.ts` (new)
- `packages/crm/src/app/(dashboard)/integrations/actions.ts` (modified — `connectMcpConnectorAction` / `disconnectMcpConnectorAction`)
- `packages/crm/tests/unit/agents/mcp/oauth-callback.spec.ts` (new)
- `packages/crm/src/lib/agents/generate/tool-catalog.ts` (modified — Circle catalog entry)
- `packages/crm/tests/unit/agents/generate/tool-catalog.spec.ts` (modified — Circle coverage tests)
- `packages/crm/tests/unit/agents/generate/bind-tools.spec.ts` (modified — Circle binding + figurative-match tests)
- `packages/crm/src/lib/agents/mcp/connector-status.ts` (new)
- `packages/crm/tests/unit/agents/mcp/connector-status.spec.ts` (new)
- `packages/crm/src/app/(dashboard)/integrations/page.tsx` (modified — MCP connector status fetch + `error` param)
- `packages/crm/src/app/(dashboard)/integrations/integrations-client.tsx` (modified — MCP connectors section + toasts)
- `tasks/todo.md` (modified — review section)

## Per-task status

All 8 tasks: **DONE**.

### Task 1 — OAuth protocol module
Implemented exactly per the interface contract in the plan: `discoverAuthServer` (RFC 9728 → RFC 8414 fallback, rejects Circle's 200-HTML protected-resource response via content-type + shape guard), `registerClient` (DCR, `none`→`client_secret_post` downgrade), `buildAuthorizeUrl`, `exchangeCode`/`refreshTokens` (sanitized error bodies, rotation-optional refresh_token), `parseTokenEnvelope`/`tokenEnvelopeSchema`, PKCE/state generators. 23/23 tests pass.

### Task 2 — OAuth-aware bearer resolver
`resolveConnectorBearer` in `resolve-bearer.ts`: legacy plain-bearer passthrough, envelope parse, 60s-skew freshness check, single-flight refresh keyed `${orgId}:${serviceName}`, re-persist rotated envelope, fail-soft to `null` on any failure. Wired into `tools.ts`'s `defaultMcpDeps` (single default builder — covers both `runtime.ts:277` and `stateless-turn.ts:197` call paths without touching either file, since they share this one builder) and into `template-mcp-server.ts`'s `realTemplateConnectorDeps.getSecret` (used by `refreshTemplateConnector`). 9/9 new tests + 49/49 regression (wrap-tool, connectors, connector-schema, template-mcp) all pass.

**Deviation from plan:** the plan named `lib/agent-templates/mcp-actions.ts` as the bind-time swap target. That file only holds the `TemplateConnectorDeps` *type* and pure composers — the actual `getSecretValue` wiring is in `template-mcp-server.ts`'s `realTemplateConnectorDeps`. Swapped there instead.

**Note:** initial single-flight test was flaky because `resolveConnectorBearer` unconditionally called a real `defaultDeps()` (dynamic `import("@/lib/secrets")`) even when the caller supplied both `getSecretValue` and `storeSecret` fakes — the extra async tick broke lockstep ordering between two concurrent test calls. Fixed by only resolving the real module for whichever deps the caller didn't supply (`resolveMissingDeps`), which also means the real DB-touching `@/lib/secrets` module never loads in unit tests.

### Task 3 — Registry
`VettedConnector.authType` widened to `"bearer" | "oauth"`, added `accessLevels?`, appended the Circle entry, added `boundMcpToolSchema` (name ≤128 drop / description ≤4000 clamp — the same bounds as `mcpToolSchemaSchema`). Did NOT edit `discover-tools.ts`'s local `boundToolSchema` twin (documented duplication, noted for post-merge unification). 21/21 tests pass. tsc clean (only the pre-existing unrelated error).

### Task 4 — Vetted discovery fill
`discover-vetted-tools.ts`: `discoverVettedToolsLive` (resolve bearer → MCP client → `listTools` → clamp+cap 20), `fillVettedMcpBindingTools` (marker-guarded, mirrors `fillComposioBindingTools` structure), `fillAllBindingTools` (composio fill then vetted fill, ORs `changed`). Swapped in at all 3 direct call sites (`interview-actions.ts`, `compile-agent/route.ts`, `page.tsx`) plus the 2-line sanctioned internal swap in `discover-tools.ts`'s `fillBlueprintConnectorsForPersist` (covers `generate/actions.ts` and `generate/route.ts` without editing either). 9/9 new + 36/36 regression pass.

**Deviations:**
- `page.tsx`'s pre-existing `hasUndiscoveredComposioBinding` guard gated the fill call; swapping only the *call* (`fillComposioBindingTools`→`fillAllBindingTools`) without widening the guard would mean a Circle-only undiscovered binding never triggers the fill on that page. Widened the guard to also check for an undiscovered vetted-OAuth binding (imports `getVettedConnector`).
- `fillBlueprintConnectorsForPersist`'s internal call uses a dynamic `import()` of `discover-vetted-tools.ts` rather than a static import, because `discover-vetted-tools.ts` already statically imports `fillComposioBindingTools` from `discover-tools.ts` — a static import back would be circular at module-eval time.

### Task 5 — Connect/disconnect + callback
`oauth-state-cookie.ts` (HMAC-signed, timing-safe verify, expiry check), `oauth-callback.ts` (`handleMcpOauthCallback` — the 5-reason failure ladder + happy path with fail-soft tools-count probe), `app/api/integrations/mcp/callback/route.ts` (thin GET, `runtime="nodejs"`), `connectMcpConnectorAction`/`disconnectMcpConnectorAction` added to `integrations/actions.ts` mirroring `connectComposioToolkitAction`'s shape. 18/18 tests pass. `check:use-server` clean.

**Note:** the plan's `McpOauthState` type (copied verbatim from the plan) does not include a `redirectUri` field, but the OAuth token exchange requires the *exact* redirect_uri used at authorize time. Rather than adding it to the signed cookie payload, `McpCallbackDeps.redirectUri` is injected directly (the real route wiring recomputes the same fixed, non-secret, server-config-derived value used by `connectMcpConnectorAction`) — simpler than round-tripping a constant through the cookie.

### Task 6 — Tool-catalog findability
Added the Circle entry to `TOOL_CATALOG` (keywords include "circle", "mastermind", "cohort", "community", etc.). Added tests to `tool-catalog.spec.ts` (entry shape + `findToolsByKeywords` match) and `bind-tools.spec.ts` (valid vetted binding produced; the figurative "circle back next week" sentence intentionally asserted as A MATCH — the whole-word matcher has no semantic disambiguation, which the design explicitly accepts as suggestion noise, never an error).

Confirmed 2 pre-existing failures in `bind-tools.spec.ts` ("log to Notion" / "log to a Google Sheet" — stale `enabledTools: []` expectations vs the current composio catalog's non-empty defaults) are unrelated: reproduced by running the parent commit's (`d5c14040e`, before this task) copy of the spec file standalone — same 2 failures, same messages.

### Task 7 — Surfaces
`connector-status.ts`'s `describeMcpConnectorStatus` (pure: null→disconnected, plain-bearer→connected/no-level, envelope→level label from scope + tool count, malformed→disconnected fail-safe) — 6/6 tests. Wired into `integrations/page.tsx` (server-side secret read → status projection, booleans/labels/counts only — no envelope or bearer crosses into client props) and `integrations-client.tsx` (new "MCP connectors" section: access-level `<select>`, Connect/Disconnect, toast handling for both `?connected=<id>` and `?error=mcp_oauth_*`). `editor-client.tsx`'s "Add connector" form now renders a "Connect on the Integrations page" link instead of the paste-a-bearer field when the selected vetted connector's `authType === "oauth"` (Connect button hidden in that branch — OAuth connectors aren't bound through this form's apiKey flow in this slice, matching the design's stated scope). Both `page.tsx` call sites that build the `vettedConnectors` prop now include `authType`.

### Task 8 — Close-out
- Leak greps: `access_token` — zero hits in any log/console/logger call. `client_secret` — one hit in new code (`integrations/actions.ts`), which is the OAuth client_secret riding inside the HMAC-signed httpOnly state cookie payload (by design, per spec §C) — never returned to the client, never logged; plus unrelated pre-existing Stripe `client_secret` code elsewhere.
- Full unit sweep (`node scripts/run-unit-tests.js`, repo root): **9606 tests / 9515 pass / 78 fail** vs the pre-Task-1 baseline **9531 / 9440 / 78** — delta is +75 tests / +75 pass, fail count unchanged (the 78 are pre-existing DB-connection (`ECONNREFUSED`) failures in unrelated workflow specs, present before this branch existed).
- `npx tsc --noEmit -p tsconfig.json`: one error, `src/app/api/copilot/turn/route.ts(315,9)`, unrelated to any file this slice touched — present identically at every checkpoint (Tasks 3/5/7/8), confirmed pre-existing.
- `pnpm check:use-server` (`bash scripts/check-use-server.sh src`): PASS.
- No DB migrations added. No new npm dependencies added.

## Test results (verbatim tail, final full sweep)

```
ℹ tests 9606
ℹ suites 1962
ℹ pass 9515
ℹ fail 78
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

## Review fixes (opus SHIP-WITH-NITS, applied post-report)

- **SHOULD-FIX — first-connect tool count was always 0**: `oauth-callback.ts`'s happy path ran `probeTools` before `storeSecret`, but the default probe (`discoverVettedToolsLive` → `resolveConnectorBearer`) reads the STORED secret — on first connect the envelope wasn't persisted yet, so the probe always saw nothing and stamped `discovered_tools_count: 0`. Fixed by reordering: (1) `storeSecret(envelope)` first, (2) fail-soft `probeTools`, (3) when the probe returns a non-null count, a second fail-soft `storeSecret` persists the count-stamped envelope (a throw on this second write no longer fails the connect — the connection already works from step 1). Updated the happy-path test to exercise the REAL ordering via a shared `Map` standing in for the persisted secret (`storeSecret` writes to it, `probeTools` reads from it) and assert the call order (`["store", "probe", "store"]`); added a new test asserting a probe throw after a successful store still redirects to `?connected=circle` with the unstamped envelope intact.
- **NIT**: added a one-line comment in `resolve-bearer.ts` at the `{`-prefix envelope-detection branch noting a legacy plain bearer that happens to start with `{` would be (mis)treated as a failed envelope parse and return `null` — accepted, since real API tokens are never JSON.
- Specs re-run: `oauth-callback.spec.ts` (13/13) + `resolve-bearer.spec.ts` (9/9), both pass. `tsc --noEmit`: same single pre-existing unrelated error only.

## Open risks / follow-ups (not done, out of this slice's scope per the design's §3 non-goals)

- Live smoke (real Circle account, real OAuth round-trip, real agent-turn tool call) is explicitly deferred to post-deploy per the design's §4 — nothing in this slice can be verified against the real Circle API offline.
- `discover-tools.ts`'s `boundToolSchema` and `connectors.ts`'s new `boundMcpToolSchema` are duplicate implementations of the same bounds (documented in both files' comments) — unify post-merge, not touched here per the plan's zero-edit constraint on `discover-tools.ts` beyond the 2-line sanctioned swap.
- The manual "Add connector" editor form has no bind pathway for an OAuth vetted connector without an apiKey — Circle bindings reach an agent's blueprint either via the generator's keyword-suggestion path (`bindToolsForIntent`, Task 6) or by connecting via `/integrations` and then re-visiting the template editor (existing `ConnectToolsBanner`/undiscovered-fill flow surfaces it). No manual "just attach this OAuth connector with no key" button was requested or built.
- Circle's revocation endpoint is not advertised — `disconnectMcpConnectorAction` only deletes the local stored secret (documented in the action's comment); the operator can also revoke from within Circle itself.
