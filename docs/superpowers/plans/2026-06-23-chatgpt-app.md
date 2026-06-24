# ChatGPT App (Apps SDK = MCP-over-HTTP) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development for the pure logic. Steps use `- [ ]`. **No migration. No live money.** Branch `feature/chatgpt-app` (off `main`). Max's gate to merge.

**Goal:** Ship a public, keyless **MCP-over-HTTP server** that ChatGPT (Apps SDK) connects to, exposing three tools — `build_workspace`, `browse_marketplace`, `deploy_agent` — so a ChatGPT user can stand up a SeldonFrame front office and add agents without leaving the chat. This is the #1 distribution lever (~800M users), and SeldonFrame is already MCP-native, so it's mostly wiring existing functions to a new transport.

**Architecture:** Copy the proven rental-MCP transport (`agent-mcp-rpc.ts` pure envelope builders + `agent-mcp-handler.ts` DI handler + the `[slug]/mcp/route.ts` plain-POST JSON-RPC route). New parallel trio scoped to ChatGPT. **Keyless by design** (matches the magic-first-run vision): `build_workspace` uses the existing anonymous workspace path (no SF account), which returns a workspace bearer; that bearer threads `deploy_agent` later in the same conversation. **No OAuth 2.1 server in v1** — public tools + ephemeral anonymous workspace. OAuth (connecting an *existing* SF account) is a documented follow-on.

**Tech Stack:** Next.js 16 App Router, `node --import tsx --test`, TDD the pure layer. Conventions: tests `cd packages/crm && node --import tsx --test <files>`; tsc 0-new; `bash scripts/check-use-server.sh src`.

**Reuse map (verified by recon — call these, don't reinvent):**
- Transport envelopes (IMPORT, don't copy): `packages/crm/src/lib/marketplace/agent-mcp-rpc.ts` → `parseJsonRpcRequest(body)`, `jsonRpcResult(id,result)`, `jsonRpcError(id,code,msg,data?)`, `toolTextResult(text,isError?)`, `buildInitializeResult({agentName})`, `MCP_PROTOCOL_VERSION`, JSON-RPC error-code constants.
- `build_workspace` → `createAnonymousWorkspace({ name, source }): Promise<AnonymousCreateResult>` in `packages/crm/src/lib/billing/anonymous-workspace.ts`. Returns `{ ok, workspace:{ id, name, slug, tier, created_at }, bearer_token, urls, installed, next }`. Seeds Soul from `name`/`source` (no LLM call). `source` accepts a URL or a free-form description.
- `browse_marketplace` → `listMarketplaceAgentsFromDb(filters?: { niche?; q?; featured? }): Promise<MarketplaceAgentRow[]>` in `packages/crm/src/lib/marketplace/agent-listings.ts`. Row: `{ id, slug, name, description, niche, tags, price /*cents*/, agentType, installCount, rating, reviewCount, isFeatured, previewImageUrl }`.
- `deploy_agent` → pure `buildInstalledAgentTemplate(listing: AgentListingForBuyer, buyerOrgId): InstalledAgentTemplateArgs` + `createAgentTemplate(args)` (both in `agent-listings.ts` / `agent-templates`); resolve the published listing by slug; **free agents only** instantiate inline, paid agents return a claim URL (no Stripe from this path). Resolve the target org from the workspace bearer (the bearer encodes orgId — see `packages/crm/src/lib/api/guard.ts` `resolveWorkspaceBearer`).
- IP rate-limit helper used by the anonymous route: reuse whatever `packages/crm/src/app/api/v1/workspace/create/route.ts` uses (3/hr, 10/day) for `build_workspace`.

---

## Task 1: Pure ChatGPT-MCP wire layer (TDD)

**Files:** Create `packages/crm/src/lib/chatgpt-app/chatgpt-mcp-rpc.ts`. Test `packages/crm/tests/unit/chatgpt-app/chatgpt-mcp-rpc.spec.ts`.

Pure, no I/O. Reuse the envelope builders from `agent-mcp-rpc.ts` (import them). Implement:
- `buildChatGptToolsList(): { tools: [...] }` — three MCP tool descriptors with real `inputSchema`:
  - `build_workspace` — `{ business_name (req), description?, website_url?, city?, state?, phone? }`. Description: "Create a complete SeldonFrame front office (website + booking + CRM + chatbot) for a local service business. USE-WHEN the user asks to build/set up a website or business system."
  - `browse_marketplace` — `{ query?, niche? }`. "List AI agents available to add to a workspace (receptionist, review-requester, booking concierge, …)."
  - `deploy_agent` — `{ workspace_token (req), agent_slug (req) }`. "Install a marketplace agent into a workspace you built earlier in this chat."
- Arg parsers/validators (return `{ ok, value } | { ok:false, error }`): `parseBuildWorkspaceArgs(p)`, `parseBrowseArgs(p)`, `parseDeployArgs(p)`. Validate required strings; trim; cap lengths (business_name ≤ 120, description ≤ 2000).
- Formatters: `assembleWorkspaceSource({ description, website_url, city, state, phone })` → a single `source` string for `createAnonymousWorkspace`. `formatMarketplaceList(rows): string` → readable list (name — niche · price label · `slug`), price label via cents (0 → "Free"). `formatBuildResult({ url, claimUrl })` and `formatDeployResult({ name, url, paid, claimUrl })`.

- [ ] Write failing tests: tools/list has exactly the 3 tools with required fields; each parser accepts a good payload and rejects a bad one (missing required, wrong type); `formatMarketplaceList` renders a 2-row list with "Free" and "$X" labels; `assembleWorkspaceSource` merges fields; deploy/build formatters render URLs.
- [ ] Run → fail. Implement minimal. Run → pass. tsc 0-new.
- [ ] **Commit** `feat(chatgpt): pure MCP wire layer for the ChatGPT App (tools/list, parsers, formatters, TDD)`.

## Task 2: DI handler (TDD)

**Files:** Create `packages/crm/src/lib/chatgpt-app/chatgpt-mcp-handler.ts`. Test `.../chatgpt-mcp-handler.spec.ts`.

- `export type ChatGptMcpDeps = { buildWorkspace(args): Promise<{ url; claimUrl; workspaceToken }>; browse(filters): Promise<MarketplaceAgentRow[]>; deploy(args:{ workspaceToken; slug }): Promise<{ ok; name?; url?; paid?; claimUrl?; error? }>; now(): Date }`.
- `export async function handleChatGptRpc(rawBody: string, deps: ChatGptMcpDeps): Promise<{ status: number; body: Record<string,unknown> | null }>`. Mirror `agent-mcp-handler.ts`:
  - parse → on parse error, JSON-RPC parse error.
  - `initialize` → `buildInitializeResult({ agentName: "SeldonFrame" })` (serverInfo name "SeldonFrame").
  - `ping` → `{}`.
  - `tools/list` → `buildChatGptToolsList()`. (NO auth gate — public.)
  - `tools/call` → validate `name` ∈ the 3; parse args via the Task-1 parsers; dispatch to the matching dep; wrap success in `toolTextResult(formatted)` + include `structuredContent` (the raw `{url, claimUrl, workspaceToken}` / rows / deploy result) for Apps-SDK clients; on validation error → `jsonRpcError(... -32602 ...)`; on dep throw → `toolTextResult(message, true)` (tool-level error, not transport).
  - notifications (no `id`) → `{ status: 202, body: null }`.
  - unknown method → `-32601`.
- [ ] TDD with stub deps: initialize returns serverInfo; tools/list returns 3; `build_workspace` call routes to `deps.buildWorkspace` and returns its URL in text + structuredContent; `browse_marketplace` formats rows; `deploy_agent` success + the paid-agent "claim" branch; bad tool name → error; bad args → -32602; a dep that throws → isError text result (status 200, not a 500). 
- [ ] Run → fail → implement → pass. tsc 0-new.
- [ ] **Commit** `feat(chatgpt): DI JSON-RPC handler for the ChatGPT App MCP server (TDD)`.

## Task 3: Route + real deps (wires to existing functions)

**Files:** Create `packages/crm/src/app/api/chatgpt/mcp/route.ts` (mirror `app/api/v1/agents/[slug]/mcp/route.ts`). Possibly a small `packages/crm/src/lib/chatgpt-app/deps.ts` for the real-deps factory.

- `POST(request)`: `const raw = await request.text()`; build `REAL_DEPS`:
  - `buildWorkspace(args)` → assemble `source` (Task 1) → apply the **same IP rate-limit** the anonymous route uses (3/hr,10/day; on limit throw a friendly Error → surfaces as tool isError) → `createAnonymousWorkspace({ name: args.business_name, source })` → map to `{ url: urls.home ?? urls.primary, claimUrl: <signup/claim url for the slug>, workspaceToken: bearer_token }`.
  - `browse(filters)` → `listMarketplaceAgentsFromDb(filters)`.
  - `deploy({ workspaceToken, slug })` → resolve orgId from the bearer (`resolveWorkspaceBearer`); if invalid → `{ ok:false, error:"That workspace link expired — build one first." }`; resolve published listing by slug; **paid** (`price>0`) → `{ ok:true, paid:true, name, claimUrl: <marketplace/<slug> or workspace claim> }` (NO charge); **free** → `buildInstalledAgentTemplate(listing, orgId)` + `createAgentTemplate(...)` → `{ ok:true, name, url }`.
  - `now: () => new Date()`.
  - → `handleChatGptRpc(raw, REAL_DEPS)` → `NextResponse.json(body, { status })` (body null → `new NextResponse(null,{status})`).
- `OPTIONS` → 204 with CORS (`Access-Control-Allow-Origin: *`, allow `Content-Type, Accept, Authorization, Mcp-Session-Id`). Add the same CORS headers on POST.
- Keep all secret/key access server-side. Money-safety assertion: grep the route for any Stripe charge call — there must be NONE (paid agents return a claim URL only).
- [ ] Manual: `curl -s -XPOST localhost:3000/api/chatgpt/mcp -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` lists 3 tools (document this in the report; do not require a running server in CI).
- [ ] **Commit** `feat(chatgpt): public MCP route wiring build/browse/deploy to existing functions (no migration, no live money)`.

## Task 4: Verify + report
- [ ] `cd packages/crm && node --import tsx --test tests/unit/chatgpt-app/*.spec.ts` green; full unit suite shows no NEW failures vs the ~baseline; `pnpm -C packages/crm typecheck` 0-new; `bash packages/crm/scripts/check-use-server.sh packages/crm/src` clean; `git status` shows no migration file.
- [ ] **Report:** the new files (path:line), the 3 tools' final schemas, confirmation deploy_agent NEVER charges (paid → claim URL), the keyless flow (build → token → deploy), the exact `curl` to connect/test, new-test count, and the **publish steps for Max** (connect the MCP URL `https://app.seldonframe.com/api/chatgpt/mcp` in ChatGPT dev mode → since it's public/no-auth, no OAuth needed for v1 → submit for review), plus the documented follow-ons (OAuth-AS to connect existing accounts; Apps-SDK UI widgets for inline cards).

## Self-Review
- Keyless (anonymous ws) ✓ no OAuth in v1 ✓ no migration ✓ no live money (free-only inline; paid→claim) ✓ reuses existing fns ✓ transport copied from proven rental MCP ✓.
- Deferred (documented, not built): OAuth 2.1 AS for existing-account connect; Apps-SDK UI widgets; richer URL→facts extraction in build_workspace (uses anonymous Soul-seed today).
