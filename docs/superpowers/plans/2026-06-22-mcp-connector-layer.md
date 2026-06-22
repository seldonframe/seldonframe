# MCP Connector Layer (v1) — External Tools for Agents — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** An agent's tools become **native tools + per-agent bound MCP tools**. Ship the plumbing + **Postiz** as the first vetted connector (→ a content/social agent) + **BYO-MCP** (paste any hosted MCP endpoint). Auth stored encrypted; the native tool path stays byte-for-byte.

**Architecture:** One seam — `getToolsForCapabilities` (called at `agents/runtime.ts:225`) becomes async and merges, after the native (capability-filtered) tools, the **bound connectors' tools** (wrapped as `AgentTool`s whose `execute()` calls an inline MCP client). The Anthropic tool loop + dispatch (`findTool` → `execute`) is unchanged — native vs MCP is indistinguishable. Connector bindings live on `AgentBlueprint.connectors` (jsonb, no migration); auth lives in the existing encrypted `workspaceSecrets` store.

**Tech Stack:** Next.js 16 / React 19, Drizzle/Neon, `node:test` + `tsx`. Conventions: tests `cd packages/crm && node --import tsx --test <files>`; tsc `…/tsc -p tsconfig.json --noEmit` (0 NEW; ~10 `.next/types` baseline); `bash scripts/check-use-server.sh src`; DI network/DB in unit tests; TDD; commit per task. **`@modelcontextprotocol/sdk` is NOT in the lockfile** and the worktree pnpm blocks new deps → **inline a minimal MCP-over-HTTP client** (per lessons L-17).

## Locked design (from recon + brainstorm)
- **Seam:** `tools.ts` `getToolsForCapabilities(capabilities)` → async `getToolsForCapabilities(capabilities, { orgId, connectors })`; `runtime.ts:225` adds one `await` + passes `blueprint.connectors` + `agent.orgId`. Dispatch loop untouched. Native tools unchanged (rename `ALL_TOOLS`→`NATIVE_TOOLS` only if helpful).
- **`AgentTool` shape:** `{ name, description, inputSchema(zod), jsonSchema(Anthropic), execute(input, ctx) }`. MCP tools are wrapped to match.
- **Auth:** `lib/secrets.ts` `getSecretValue/storeSecret` (AES-GCM `workspaceSecrets`, by `serviceName`) — NOT plaintext `organizations.integrations`.
- **Vetted v1:** Postiz — hosted MCP `https://api.postiz.com/mcp`, `Authorization: Bearer <key>`, no OAuth. **BYO-MCP:** any HTTPS MCP endpoint + bearer.
- **Discovery:** at **bind-time**, cached on `blueprint.connectors[].tools` (refresh action) — NOT live per turn.
- **Security:** HTTPS-only endpoints; per-connector `enabledTools` allowlist; per-call timeout; results flow back as `tool_result` through the same validators. (SSRF hardening for BYO endpoints = noted follow-up.)
- **Scope:** backend + a minimal bind action. The polished Studio tool-picker UI = **#3** (deferred). OAuth connectors (Google/HubSpot via BYO-OAuth-app) = deferred.

---

## Task 1: Inline MCP-over-HTTP client (TDD)

**Files:** Create `packages/crm/src/lib/agents/mcp/client.ts`; Test `packages/crm/tests/unit/agents/mcp/client.spec.ts`.

- [ ] **Step 1: Ground the protocol.** Confirm the current **MCP Streamable HTTP** transport handshake (use context7 / the MCP spec): JSON-RPC 2.0 over HTTPS POST — `initialize` (→ may return an `Mcp-Session-Id` header to echo on later calls + a `notifications/initialized` follow-up), `tools/list` (→ `{tools:[{name, description, inputSchema}]}`), `tools/call` (params `{name, arguments}` → `{content:[{type:"text",text}|…], isError?}`). Accept `application/json` (handle an SSE `text/event-stream` body by parsing `data:` lines).

- [ ] **Step 2: Failing tests** with a DI'd `fetch`:
```
// initialize → captures session id from the response header; sends notifications/initialized
// listTools → parses {tools:[...]} into {name, description, inputSchema}[]
// callTool → returns the content text; isError:true → throws/maps to an error result
// non-2xx / malformed JSON → mapped error (no throw past the boundary)
// rejects a non-https endpoint
```

- [ ] **Step 3: Implement** `createMcpClient({ endpoint, bearer, fetchImpl?, timeoutMs? })` → `{ initialize(), listTools(), callTool(name, args) }`. JSON-RPC envelope helper; `Authorization: Bearer`; echo `Mcp-Session-Id`; AbortController timeout (default 20s); reject non-HTTPS; map errors. Keep it ~150–250 LOC, no new deps.

- [ ] **Step 4: Run → pass. Step 5: Commit** `feat(mcp): inline MCP-over-HTTP client (initialize/listTools/callTool)`.

---

## Task 2: Connector registry + types (pure, TDD)

**Files:** Create `packages/crm/src/lib/agents/mcp/connectors.ts`; Test `…/connectors.spec.ts`.

- [ ] **Step 1: Failing tests** — `VETTED_CONNECTORS` contains `postiz` (endpoint `https://api.postiz.com/mcp`, `authType:"bearer"`, `secretService:"postiz"`); `resolveConnectorEndpoint(binding)` returns the vetted endpoint for a vetted id, the BYO endpoint for `kind:"byo"`, and rejects non-HTTPS BYO; `connectorSecretService(binding)` returns the service name for `getSecretValue`.

- [ ] **Step 2: Implement** the registry + types:
```typescript
export type ConnectorBinding =
  | { id: string; kind: "vetted"; serviceName: string; enabledTools: string[]; tools?: McpToolSchema[]; discoveredAt?: string }
  | { id: string; kind: "byo"; serviceName: string; endpoint: string; enabledTools: string[]; tools?: McpToolSchema[]; discoveredAt?: string };
export type McpToolSchema = { name: string; description: string; inputSchema: Record<string, unknown> };
export const VETTED_CONNECTORS = [{ id: "postiz", label: "Postiz (social publishing)", endpoint: "https://api.postiz.com/mcp", authType: "bearer", secretService: "postiz" }] as const;
```
+ `resolveConnectorEndpoint`, `connectorSecretService`, `getVettedConnector(id)`.

- [ ] **Step 3: pass. Commit** `feat(mcp): connector registry (Postiz vetted + BYO-MCP types)`.

---

## Task 3: `blueprint.connectors` field + patch schema

**Files:** Modify `packages/crm/src/db/schema/agents.ts` (`AgentBlueprint`), `packages/crm/src/lib/agents/actions.ts` (`BlueprintPatchSchema`); Test the patch schema.

- [ ] **Step 1:** Add `connectors?: ConnectorBinding[]` to `AgentBlueprint` (import the type). No migration (blueprint is jsonb). Add a `.strict()` zod `ConnectorBindingSchema` to `BlueprintPatchSchema` (validates kind/serviceName/enabledTools; BYO requires an HTTPS `endpoint`; bounds the array length + tool count). **Step 2:** Test the schema accepts a valid vetted + byo binding and rejects a non-HTTPS byo endpoint + over-long arrays. **Step 3: Commit** `feat(agents): blueprint.connectors binding + patch schema`.

---

## Task 4: Runtime extension — merge MCP tools at the seam (TDD)

**Files:** Modify `packages/crm/src/lib/agents/tools.ts` (`getToolsForCapabilities`), `packages/crm/src/lib/agents/runtime.ts:225`; Create `packages/crm/src/lib/agents/mcp/wrap-tool.ts`; Test the merge + dispatch.

- [ ] **Step 1:** `wrapMcpTool(binding, mcpToolSchema, deps)` → `AgentTool`: `name = ${serviceName}__${toolName}` (namespaced to avoid native collisions), `description`, `jsonSchema = mcpToolSchema.inputSchema`, `inputSchema = z.record(z.unknown())` (pass-through; the MCP server validates), `execute = async (input) => { const bearer = await deps.getSecret(orgId, serviceName); const client = deps.makeClient(resolveConnectorEndpoint(binding), bearer); return client.callTool(toolName, input); }`. Only the binding's `enabledTools` are wrapped.

- [ ] **Step 2: Failing tests:**
```
// getToolsForCapabilities(caps, {connectors: undefined}) → IDENTICAL to today (native only) — regression guard
// getToolsForCapabilities(caps, {connectors:[postiz binding with 2 enabled cached tools]}) → native + 2 wrapped tools (namespaced)
// a wrapped tool's execute() → getSecret + makeClient(endpoint,bearer).callTool(name,input) called (DI'd), returns the result
// disabled tools (not in enabledTools) are NOT wrapped
```

- [ ] **Step 3:** Make `getToolsForCapabilities` async: keep the native filter, then for each `connectors[]` binding map its enabled cached `tools` through `wrapMcpTool`. DI `getSecret` + `makeClient` (default = real `getSecretValue` + `createMcpClient`). At `runtime.ts:225`: `const tools = await getToolsForCapabilities(blueprint.capabilities, { orgId: agent.orgId, connectors: blueprint.connectors });`. **Dispatch loop UNCHANGED** (`findTool` resolves by name across the returned list). Wrap each MCP `execute` in try/catch → an error `tool_result` (never throws the loop).

- [ ] **Step 4: Run → pass** (native + full agents/voice suites green — no-connectors path proven identical). **Step 5: Commit** `feat(agents): executeTurn tool set = native + bound MCP tools (native path unchanged)`.

---

## Task 5: Bind action + tool discovery (minimal)

**Files:** Modify `packages/crm/src/lib/agents/actions.ts` (or a new `lib/agents/mcp/actions.ts`); Test the bind logic (DI'd discover + secret store).

- [ ] **Step 1:** `bindMcpConnectorAction({ agentId, connector: { kind, id?, endpoint?, serviceName }, apiKey, enabledTools? })` (`"use server"`): org-guard; resolve the endpoint (vetted id → registry; byo → require HTTPS); **store `apiKey` encrypted** via `storeSecret({workspaceId: orgId, serviceName, value: apiKey})`; **discover** via `createMcpClient(endpoint, apiKey).listTools()`; cache the schemas + default-enable all (or the passed `enabledTools`) onto the agent's `blueprint.connectors` (append/replace by id) via the existing blueprint-update path. Plus `unbindMcpConnectorAction({agentId, connectorId})` (remove binding; optionally delete the secret) and `refreshMcpConnectorAction` (re-discover). DI the discover + secret calls for the test.

- [ ] **Step 2: Test** the bind composition (pure/DI layer, per repo convention): vetted Postiz → endpoint resolved, secret stored (DI'd), tools discovered + cached on the binding; byo non-HTTPS → rejected; the thin `"use server"` wrapper is covered structurally (as prior builds did — note it).

- [ ] **Step 3: Commit** `feat(mcp): bind/unbind/refresh connector actions (encrypted key + discovery + cache)`.

---

## Task 6: Verify
- [ ] Suites: `cd packages/crm && node --import tsx --test tests/unit/agents/**/*.spec.ts` → green.
- [ ] `tsc` 0 new; `check-use-server` clean; **no migration** (blueprint jsonb) — journal unchanged.
- [ ] **Report:** the regression statement (the no-connectors path through `getToolsForCapabilities` + the dispatch loop + every native tool are unchanged — proven by the regression test), the new-test count, whether the MCP client is inline vs SDK + why, and the honest gap — unit-verified; the live gate = bind a real Postiz API key to an agent → ask it to "schedule a post" → confirm the `postiz__schedulePostTool` call hits Postiz. The polished Studio bind/tool-picker UI is **#3**.

## Self-Review
- Coverage: inline MCP client (T1) ✓; vetted Postiz + BYO-MCP registry (T2) ✓; per-agent binding (T3) ✓; the one async seam + native-unchanged (T4) ✓; encrypted auth + discovery + bind (T5) ✓; security (HTTPS-only, enabledTools allowlist, timeout, namespaced names) ✓.
- Deferred (noted): Studio tool-picker UI (#3); OAuth connectors via BYO-OAuth-app; SSRF hardening for BYO endpoints; per-client (deployment) connector binding.
- Type consistency: `ConnectorBinding`/`McpToolSchema` defined once (T2), reused (T3/T4/T5); `createMcpClient` (T1) used by T4/T5.
