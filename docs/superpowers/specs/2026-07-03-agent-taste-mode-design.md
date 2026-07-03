# Taste Mode — Design Spec
## N free anonymous calls on per-agent MCP rental endpoints, instant business-grounding, three-door conversion

**Date:** 2026-07-03
**Status:** Design (documents only — nothing implemented)
**Repo ground truth:** `.claude/worktrees/jolly-kare-28ade1` (current with `origin/main` at time of reading)
**Companion plan:** `2026-07-03-agent-taste-mode-plan.md` (same directory)

---

## 1. What this is

Today an anonymous MCP client hitting `POST /api/v1/agents/<slug>/mcp` can `initialize` and `ping`, and nothing else: `tools/list`, `tools/call`, `prompts/*` all return JSON-RPC `-32000` `"Missing rental key. Send \`Authorization: Bearer <key>\`."` (agent-mcp-handler.ts:480-487). Rental keys (`rk_…`) are minted only by logged-in orgs (rental.ts `generateAgentRentalKeyAction`, org-guarded via `getOrgId`).

**Taste mode** opens a bounded free lane on that same endpoint:

1. Anonymous `tools/list` works and returns a **read-only tool subset** plus one new tool, `ground_on_my_business(url)`.
2. `ground_on_my_business` fetches the visitor's website (SSRF-guarded), runs the existing soul-extraction pipeline on the cheap model tier, and returns a compact grounding for **their** business plus an opaque session token. Subsequent `ask` calls carry that token — the agent now demos *as if it were deployed for the visitor's business*. That is the magic moment.
3. After N calls (seller-configured, platform-capped) — or on any non-allowlisted tool — the caller gets a **warm, structured conversion response with three doors** (real URLs), never a bare error.
4. Everything is inert unless `SF_AGENT_TASTE_MODE` is set; anonymous behavior is **byte-identical** to today when unset.

### 1.1 Economics: seller-pays, seller-controls (founder ruling, final)

The seller earns 95% of listing revenue (2%-seller-only marketplace fee rail), so the seller has the greatest incentive to promote their listing. **Taste traffic is the seller's customer-acquisition cost, and the seller decides it:**

- Taste turns resolve the LLM **exactly like paid rentals do today** — `getAIClient({ orgId: creatorOrgId })`, BYOK-first (agent-rental-run.ts:137).
- **Hard guard:** if the creator org resolves to the **platform fallback** (`resolution.provider === "platform"`, ai/client.ts:232) and the creator org is **not** in `SF_FLAGSHIP_ORG_IDS`, taste is automatically OFF for that listing. Anonymous strangers must never burn the platform key for a third-party seller.
- **Flagship exception:** listings whose `creatorOrgId` is in `SF_FLAGSHIP_ORG_IDS` (comma-separated env var — a config list, never a hardcoded uuid) are SF-owned; there the platform *is* the seller, so platform-key taste is correct and intended.
- Regardless of whose key: taste turns are pinned to the **cheap haiku tier** with a **per-call output-token ceiling** — the seller pays, so we protect their spend by default.
- The seller sets their taste budget in `sellerPreferences` (per-visitor calls and daily cap) inside platform-enforced hard ceilings (§6.2).
- Taste usage is visible to the seller: funnel events land under the seller's own `creatorOrgId` in `seldonframe_events` — the same stream their `agent_rental_call` earnings events already live in. (P1 visibility = the events themselves; a per-listing taste counter card on the seller dashboard is a noted follow-on.)

---

## 2. Grounded current state (verified by direct reads)

All paths relative to `packages/crm` in the worktree unless noted.

| Fact | Where |
|---|---|
| Route is a thin wrapper: `POST` → `handleAgentRentalRpc(slug, rawBody, bearer, REAL_DEPS, headers)`; maps `{status, body}` onto `NextResponse` | `src/app/api/v1/agents/[slug]/mcp/route.ts:161-178` |
| CORS allows `Mcp-Session-Id` as a **request** header but nothing server-side ever reads or emits it | route.ts:88; no other occurrence in route/handler/rpc |
| Handler is fully stateless per-request; `RpcOutcome = { status: number; body: Record<string,unknown> \| null }` — **no response-header channel** | `src/lib/marketplace/agent-mcp-handler.ts:121-125` |
| Anonymous methods today: `initialize`, `ping`, notifications (202). Gated: `tools/list`, `prompts/list`, `prompts/get`, `tools/call` via `authorize()` | agent-mcp-handler.ts:161-263 |
| Auth-failure envelope (the byte-identical baseline): HTTP 200, `-32000` (`JSONRPC_UNAUTHORIZED`), `"Missing rental key. Send \`Authorization: Bearer <key>\`."`; expired → `"Rental key has expired. Generate a new one."`; wrong agent → `"Rental key is for a different agent."`; junk → `"Invalid rental key."` | agent-mcp-handler.ts:480-524 |
| Rental key = `rk_<b64url(payload)>.<b64url(hmac-sha256)>`, payload `{v:1, s:slug, o:renterOrgId, n:nonce, x:expMs}`; constant-time verify; verdicts `valid/slug_mismatch/expired/invalid` | `src/lib/marketplace/rental-token.ts` |
| Keys minted only by logged-in orgs (`getOrgId` guard) for published `kind:'agent'` listings | `src/lib/marketplace/rental.ts` (`generateAgentRentalKeyAction`) |
| Rental tool surface: `get_quote_range` + `provide_faq_answer` (deterministic, **zero-LLM**, pure lookups over `blueprint.quoteRanges`/`blueprint.faq`) + `ask` (owner-compute agent turn). Workspace-stateful tools (`book_appointment`, `look_up_availability`, `take_message`, CRM writes) are **deliberately not exposed** on the rental surface | `src/lib/marketplace/agent-mcp-rpc.ts:14-32, 320-375` |
| Cross-call state precedent **on this exact endpoint**: `conversation_id` round-trips as a tool argument / tool-result field (`(result as {conversationId?}).conversationId = turn.conversationId`) | agent-mcp-handler.ts:463-465; agent-mcp-rpc.ts:139-166 |
| Our own inline MCP client *does* capture/echo `Mcp-Session-Id` — but the server never emits one | `src/lib/agents/mcp/client.ts:42,197,223` |
| Paid rental turn: `resolveRentalAgent` (listings ⋈ organizations, published, kind agent) → `getAIClient({orgId: creatorOrgId})` → `runStatelessAgentTurn(..., testMode: false)` | `src/lib/marketplace/agent-rental-run.ts:72-165` |
| `getAIClient` resolution: Anthropic BYOK → `{client, mode:"byok", provider:"anthropic"}`; OpenAI BYOK → `client:null, provider:"openai"`; else platform: `{client: ANTHROPIC_API_KEY ? new Anthropic(...) : null, mode:"metered"\|"included", provider:"platform"}` — **`provider === "platform"` is the platform-fallback signal** | `src/lib/ai/client.ts:189-233` |
| `resolveAgentKeyStatus(orgId)` → `{hasKey, mode:"byok"\|"platform"\|"none", provider}` — key predicate **without instantiating a client** (for list-time checks) | ai/client.ts:120-167 |
| `runStatelessAgentTurn`: input `{orgId, orgSlug, orgName, soul, timezone, blueprint, messages, testMode, client, now?}`; `MODEL = ANTHROPIC_AGENT_MODEL \|\| "claude-sonnet-4-5-20250929"` chosen internally via `resolveTurnModel`; `MAX_TOKENS = 1024`, `MAX_TURN_ITERATIONS = 6` hardcoded — **no per-call model/token override today**; `testMode:true` short-circuits every write tool (book_appointment, escalate_to_human, take_message) with no DB write; read-only tools still run against `orgId` | `src/lib/agents/stateless-turn.ts:40-120,152-179` |
| Cheap model tier constant: `DEFAULT_TERTIARY_MODEL = "claude-3-5-haiku-20241022"` (personality-generator.ts:359); hardcoded-haiku precedent in `ai/soul-conversation.ts:143` | coordinator-verified |
| Rate limiter: `checkRateLimit(key, limit=120, windowMs=60_000): Promise<boolean>` — Upstash INCR+EXPIRE(NX) when `UPSTASH_REDIS_REST_URL/TOKEN` set, else in-process Map (**under-counts across multiple function instances**); never throws (falls back in-memory) | `src/lib/utils/rate-limit.ts:54-100` |
| SSRF guard: `assertPublicHttpUrl(rawUrl, opts?): Promise<{url: URL; ip: string}>` — **throws `SsrfBlockedError`**; blocks non-http(s), credentials, ports outside {80,443,8080,8443}, localhost/metadata/`.internal`/`.local`, literal + DNS-resolved private/link-local/CGN IPv4+IPv6 | `src/lib/security/ssrf-guard.ts:298-340` |
| Anonymous URL→grounding precedent (the pipeline taste reuses): `assertPublicHttpUrl` → `fetch` (UA `"SeldonFrame/1.0 (Business Analysis)"`, `AbortSignal.timeout(10_000)`) → `htmlToMarkdown` → `.slice(0, MAX_MARKDOWN_CHARS=50_000)` → `extractBusinessData` (one `messages.create`, `max_tokens: 2048`, no-LLM `fallbackBusinessData` on failure) → `previewSessions` row `{token: randomUUID(), …, expiresAt: +24h}` | `src/app/api/v1/public/analyze-url/route.ts:305-420` |
| `ExtractedBusinessData` (~16 fields: businessName, industry, tagline, description, services[], testimonials[], contactInfo, voiceTone, idealClient, suggestedFramework…) — compact, well under 8KB without raw markdown | analyze-url/route.ts:305-335 |
| Listings schema: `marketplaceListings` (schema/marketplace.ts:122) has **no generic metadata column**; typed-jsonb precedent: `trustStats: jsonb("trust_stats").$type<ListingTrustStats \| null>()` (line 175) | `src/db/schema/marketplace.ts` |
| Event rail used **by this route today**: `trackEvent(name, props, { orgId })` → `seldonframe_events`; `countRenterCallsThisMonth` already queries those rows | route.ts:114-142; agent-rental-run.ts:179-207 |
| Bus alternative `emitSeldonEvent(type, data, {orgId})` — `orgId` **required**, no anonymous emission path | `src/lib/events/bus.ts:61` (coordinator-verified) |
| Migrations journal tail **in this worktree** = idx 39 / `0062_wallet_rls` (the OAuth wave's `0063_oauth_clients`/idx 40 exists only on an unpushed branch) | `packages/crm/drizzle/meta/_journal.json` (coordinator-verified) |
| Fork rail (shipped): `POST /api/marketplace/fork` — keyless, IP-limited 3/hr + 10/day, free+published+agent-kind only, 303 → tokenized admin URL; the Fork button lives on the listing page `app.seldonframe.com/marketplace/<slug>` | coordinator-verified |
| Signup/device flow: `app.seldonframe.com/signup`, device approval `/auth?atok=…`; public build pitch: `https://seldonframe.com/build` | coordinator-verified |
| Cron inventory: `src/app/api/cron/` contains `orphan-workspace-ttl` (TTL-cleanup semantics) among 14 crons wired in `packages/crm/vercel.json` | directory listing + vercel.json |
| Test harness: `pnpm test:unit` = `node scripts/run-unit-tests.js` (repo root) globbing `tests/unit/**/*.spec.ts`; DI/fake style precedent `packages/crm/tests/unit/marketplace/fork-listing.spec.ts` (makeHarness + injected rate-limit counter); ~75-failure baseline exists — judge by delta | coordinator-verified + memory |

---

## 3. Design decisions

### D1 — Session state: signed opaque taste-session token as a tool argument (not `Mcp-Session-Id`)

**Chosen:** `ground_on_my_business` returns a signed opaque token — `tst_<b64url(payload)>.<b64url(hmac)>`, payload `{v:1, s:<slug>, sid:<uuid>, x:<expMs>}`, exact `rental-token.ts` house pattern with a different prefix and a ≤1h TTL — **in the tool result text**, and every taste tool that benefits from grounding accepts an optional `taste_session` string argument. The grounding blob itself lives in a short-TTL DB row (`agent_taste_sessions`, keyed by `sid`), never inside the token.

**Why, honestly, against the handler's statelessness:**

1. **There is no response-header channel.** `RpcOutcome = { status, body }` (agent-mcp-handler.ts:121-125). Emitting `Mcp-Session-Id` would mean changing the handler↔route contract and every existing outcome assertion — for a header that arbitrary clients most often drop.
2. **This endpoint's own precedent is arg round-trip.** The `ask` tool already threads `conversation_id` through tool results and back in as an argument (handler:463-465, rpc:158-161). LLM-driven renters demonstrably handle this today; taste reuses the proven pattern rather than introducing a second, weaker one.
3. **Bounded anonymous writes by construction.** `Mcp-Session-Id` is assigned at `initialize` — an unauthenticated, uncapped moment; backing it with rows invites drive-by row spam. The taste token is minted only inside `ground_on_my_business`, which sits behind per-IP creation caps and the visitor call budget. One grounding = one row.
4. **Session-per-business, not session-per-connection.** A visitor who reconnects tomorrow (within TTL) can pass the same token and stay grounded; transport-level session ids die with the connection.
5. **Considered and rejected:** header-based sessions *would* work for spec-compliant clients — our own client echoes `mcp-session-id` (client.ts:197,223) — but taste explicitly targets arbitrary external clients, the least-capable of which is exactly who the funnel exists to convert.

**Why sign it at all (vs a bare `randomUUID` like `previewSessions.token`):** the HMAC check rejects junk before any DB read (cheap DoS shield on an anonymous endpoint), binds the token to the listing slug (a token minted on agent A can never resolve a session against agent B — same property the `rk_` slug-binding provides), and carries expiry without a DB read. It reuses a module pattern the repo already trusts.

**Why the blob is not in the token:** an 8KB payload would transit the renter's LLM context on every call (cost + corruption risk when an LLM copies it imperfectly) and would appear in client logs. The token stays ~200 bytes; the blob stays server-side.

**Anonymous DB writes are bounded:** TTL ≤ 1h (`expires_at` + token `x` agree), blob ≤ 8192 bytes serialized (enforced at write by field-wise truncation), per-IP creation caps (§6.3), and cleanup piggybacks on the existing `orphan-workspace-ttl` cron (D9).

### D2 — The read-only tool allowlist (enumerated from the real surface)

The rental surface today is already three tools (rpc.ts:185-195). Taste mode's anonymous `tools/list` returns exactly:

| Tool | Class | Why it's safe anonymously |
|---|---|---|
| `get_quote_range` | deterministic, zero-LLM | Pure lookup over `blueprint.quoteRanges` (rpc.ts:447-467). No LLM, no workspace I/O, no cost to anyone. |
| `provide_faq_answer` | deterministic, zero-LLM | Pure keyword match over `blueprint.faq` (rpc.ts:469-475). Same. |
| `ask` | LLM turn — **taste variant** | Runs via `runTasteTurn` (D3): seller's key (flagship exception), haiku pin, output ceiling, `testMode: true`, capability intersection below. Accepts optional `taste_session`. |
| `ground_on_my_business` | **new**, LLM extraction | SSRF-guarded fetch + capped extraction on the same key policy (D3); creation-capped (§6.3). |

**Never exposed anonymously** (and mostly not exposed to paid renters either): `book_appointment`, `take_message`, `escalate_to_human` (side-effect / human-notifying), `look_up_availability`, `find_my_existing_appointment` (read the **creator's** real calendar/CRM — wrong business for a grounded taste session, and a data leak). The rental layer already excludes these from `tools/list` (rpc.ts:27-32); taste additionally intersects the turn's capability list so the agent loop can't reach them either:

```
TASTE_CAPABILITY_ALLOWLIST = ["provide_faq_answer", "get_quote_range"]
```

The taste turn runs `getToolsForCapabilities(blueprint.capabilities ∩ TASTE_CAPABILITY_ALLOWLIST)` **and** `testMode: true` (which independently short-circuits every write tool with no DB write — stateless-turn.ts:21-27). Two independent fences.

`prompts/list` / `prompts/get` **stay rk_-gated** in taste mode: the skill prompt is the seller's playbook IP — the paid rental's core deliverable — not a free sample.

**MCP instructions:** in taste mode, `initialize` adds the optional `instructions` field (absent today — rpc.ts:170-179): what this agent does (from `agentName` + `summarizeCapabilities`), "You have N free calls — try `ground_on_my_business` with your website URL first, then `ask`." N is the listing's effective per-visitor budget. When the flag is off the field is absent — byte-identical.

### D3 — Whose key, which model (founder ruling, final)

- **Key resolution = today's paid-rental path:** `getAIClient({ orgId: creatorOrgId })` (agent-rental-run.ts:137). Seller pays; taste is their CAC.
- **Hard platform-key guard:** after resolution, if `resolution.provider === "platform"` and `creatorOrgId ∉ SF_FLAGSHIP_ORG_IDS` → the taste turn/grounding **refuses** (friendly "taste isn't available for this agent right now" text result + the doors). List-time, the same predicate via `resolveAgentKeyStatus(creatorOrgId)` (no client instantiation) decides whether taste is advertised at all — a listing whose seller has no BYOK key (and isn't flagship) simply behaves exactly as today for anonymous callers.
  - Note: an OpenAI-only BYOK seller also gets taste OFF — `getAIClient` returns `client: null` for that branch (ai/client.ts:210-218), so there is no Anthropic client to run the turn; the list-time predicate is `(mode === "byok" && provider === "anthropic") || (flagship && hasKey)`.
- **Model pin regardless of whose key:** `TASTE_MODEL = "claude-3-5-haiku-20241022"` (the repo's cheap tier — the literal value of `DEFAULT_TERTIARY_MODEL`, personality-generator.ts:359). Requires a small additive change: `runStatelessAgentTurn` gains optional `modelOverride` / `maxTokensOverride` inputs (default = today's behavior, zero change for existing callers). The override bypasses `resolveTurnModel` entirely — taste turns must never adaptively escalate to the premium model, including recovery turns.
- **Output ceiling:** `TASTE_MAX_TOKENS = 400` per turn; grounding extraction `max_tokens: 1200` with input truncated to 20 000 chars (vs analyze-url's 50 000 — haiku + seller-paid → tighter).
- **Existing validators/quote-guard still run:** the taste turn goes through the same `runStatelessAgentTurn` loop — same `composeSystemPrompt`, same tool registry, same iteration cap (6) — so every hard-rule the runtime enforces applies unchanged.

**Spend arithmetic (worst case, haiku pricing ~$0.80/M in, $4/M out):** one turn ≈ ≤8K in + ≤400 out ≈ $0.008. At the platform hard ceiling (500 calls/listing/day) that is ≈ **$4/listing/day absolute worst**; at defaults (50/day) ≈ $0.40/day — and the seller chose both numbers.

### D4 — Seller opt-out & budget: `sellerPreferences` jsonb on `marketplaceListings`

`marketplaceListings` has no reusable metadata column (verified — schema/marketplace.ts:122-186), so per the coordinator-accepted design: one new typed jsonb column, following the `trustStats` precedent (line 175):

```ts
sellerPreferences: jsonb("seller_preferences").$type<ListingSellerPreferences | null>(),

type ListingSellerPreferences = {
  /** 0 disables taste for this listing. Absent → default 3. Clamped to [0, 10]. */
  tasteCallsPerVisitor?: number;
  /** Per-listing daily taste budget. Absent → default 50. Clamped to [0, 500]. */
  tasteDailyCap?: number;
};
```

Default is **taste ON** (absent column/field ⇒ defaults apply) — sellers opt out by setting `tasteCallsPerVisitor: 0`. Write path: a minimal `"use server"` action beside the existing seller actions (seller-actions.ts update precedent), org-guarded to the listing's creator.

### D5 — Caps (platform-enforced ceilings; seller chooses within)

All via `checkRateLimit` (rate-limit.ts:54) with 24h fixed windows (`86_400_000` ms):

| Cap | Key | Limit |
|---|---|---|
| Per-visitor taste calls (every anonymous taste `tools/call`, **including** `ground_on_my_business`) | `taste:calls:<listingId>:<ipHash>` | `clamp(prefs.tasteCallsPerVisitor ?? 3, 0, 10)` |
| Per-listing daily budget | `taste:daily:<listingId>` | `clamp(prefs.tasteDailyCap ?? 50, 0, 500)` |
| Grounding creations per visitor+listing | `taste:ground:<listingId>:<ipHash>` | 2/day |
| Grounding creations per IP (all listings) | `taste:ground:ip:<ipHash>` | 6/day |
| `taste_session_started` emission dedupe | `taste:started:<listingId>:<ipHash>` | 1/day |

`ipHash = sha256(clientIp + "|" + rentalSigningSecret).hex.slice(0,32)` — raw IPs are never stored or logged. Client IP from `x-forwarded-for` (first hop), `"unknown"` fallback.

**Honesty note:** without Upstash env, `checkRateLimit` falls back to a per-instance in-memory Map and under-counts across Vercel instances (rate-limit.ts:1-5). Taste caps are therefore *cost-control best-effort, not a security boundary* — the real spend bound is haiku + the token ceilings + the seller's own key. Production should have Upstash configured (it already should for the other five call sites).

### D6 — The three doors (conversion response, never a bare error)

Returned as a **successful** tool result (`jsonRpcResult(id, toolTextResult(text))`, HTTP 200, `isError` unset — an error flag would push renter LLMs into retry loops instead of relaying the offer). Fired on: visitor cap reached, listing daily cap reached, or `tools/call` on a non-allowlisted tool name. Copy (URLs are real, verified above):

```
You've used your N free taste calls with <AgentName> — thanks for kicking the tires!

Three doors from here:

1. KEEP TALKING — get your own free workspace + API key (first workspace free
   forever): https://seldonframe.com/build
2. FORK THIS AGENT — make it yours in one click, free, no signup:
   https://app.seldonframe.com/marketplace/<slug>
3. SELL AGENTS LIKE THIS — build and sell your own on SeldonFrame:
   https://seldonframe.com/build

(Relay these links to the human you're working for.)
```

- Door 2 points at the **listing page** (the Fork button lives there; we do not deep-link the keyless `POST /api/marketplace/fork` — founder ruling). Base URL built like `resourceUrl` does: `NEXT_PUBLIC_APP_URL || "https://app.seldonframe.com"` (route.ts:105-108).
- Doors 1 and 3 both land on `https://seldonframe.com/build` with different framing lines (founder ruling; the `/build` page pitches the one-sentence IDE install, behind which sit `app.seldonframe.com/signup` and the `/auth?atok=…` device flow).
- The non-allowlisted-tool variant swaps the first line for: *"That tool needs a real rental key — it does live work in a real workspace."*

### D7 — Global flag inertness (byte-identical when off)

`SF_AGENT_TASTE_MODE` (env). The route builds the optional `taste` dep object **only when** `process.env.SF_AGENT_TASTE_MODE?.trim() === "1"`. The handler's taste branch is reachable only when `deps.taste` is present **and** the request carries **no bearer at all** — any presented bearer (valid, expired, junk) flows through today's `authorize()` verbatim, so paying renters and key-holding callers never see taste behavior. With the flag unset, `deps.taste` is `undefined` and every code path — envelopes, strings, status codes — is the same object shape today's tests assert. The plan's Task 8 spec proves this by deep-equal comparison of outcomes with `taste: undefined` for every method × auth state.

### D8 — Migration numbering (both cases, house rule)

**House rule: never run `drizzle-kit generate` in this repo** (journal-idx/filename desync + phantom-CREATE drift). The migration is a **hand-written SQL file plus a hand-appended `_journal.json` entry**.

- **Case A (state of this worktree, verified):** disk tail `0062_wallet_rls`, journal tail idx 39 → new file **`0063_agent_taste_sessions.sql`**, journal entry **idx 40**.
- **Case B (if the OAuth wave has landed by implementation time):** disk tail `0063_oauth_clients`, journal tail idx 40 → new file **`0064_agent_taste_sessions.sql`**, journal entry **idx 41**.

The rule generalized: *next filename number on disk, next journal idx; check both at implementation time, not plan time.* One migration carries both changes (table + column):

```sql
CREATE TABLE "agent_taste_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "listing_id" uuid NOT NULL REFERENCES "marketplace_listings"("id") ON DELETE CASCADE,
  "slug" text NOT NULL,
  "source_url" text NOT NULL,
  "grounding" jsonb NOT NULL,
  "ip_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
CREATE INDEX "idx_agent_taste_sessions_expires_at" ON "agent_taste_sessions" ("expires_at");
ALTER TABLE "marketplace_listings" ADD COLUMN "seller_preferences" jsonb;
```

(No RLS statement is included by default; if `0062_wallet_rls` establishes an RLS convention for new tables, mirror it at implementation time — the table holds no org-owned data, only anonymous, TTL'd grounding blobs.)

### D9 — Cleanup: piggyback on `orphan-workspace-ttl`

Expired-row deletion (`DELETE FROM agent_taste_sessions WHERE expires_at < now()`) is appended to the existing **`/api/cron/orphan-workspace-ttl`** cron (`src/app/api/cron/orphan-workspace-ttl/route.ts`) — it already has TTL-cleanup semantics and a schedule in `packages/crm/vercel.json`. No new cron entry. The 1h TTL means rows also self-invalidate long before cleanup runs; cleanup is hygiene, not correctness.

### D10 — Events (P1 = tracking only)

Emitted through the rail **this endpoint already uses**: `trackEvent(name, props, { orgId: creatorOrgId })` (route.ts:114-132 precedent; lands in `seldonframe_events`, the same table `countRenterCallsThisMonth` queries — so taste funnel analytics are immediately SQL-able alongside rental revenue events). The bus (`emitSeldonEvent`, bus.ts:61) also requires an orgId and adds agent-firing semantics we don't want for passive telemetry. Attribution to `creatorOrgId` is the coordinator ruling: sellers see taste demand in their own stream — itself a retention hook.

| Event | When | Props |
|---|---|---|
| `taste_session_started` | first anonymous taste `tools/call` per (ipHash, listing, day) — deduped via the 1/day rate key | `slug, listing_id` |
| `taste_grounded` | successful `ground_on_my_business` | `slug, listing_id, has_grounding: true` (never the URL's content; `source_domain` only) |
| `taste_limit_hit` | doors served | `slug, listing_id, reason: "visitor_cap" \| "daily_cap" \| "locked_tool" \| "no_taste_key"` |
| `taste_door_clicked` | **omitted in P1** — not detectable in-protocol (doors are text relayed by the renter's LLM; no click transits our servers). Future: a `/t/<listing>/<door>` redirect makes it real. | — |

**No money-flow changes in P1.** Seller commission on taste-conversions is explicitly out of scope (future phase). No new billing reads/writes; `agent_rental_call` accrual is untouched (taste calls never emit it — they are not rentals).

### D11 — Wire behavior matrix

Anonymous caller = request with **no** `Authorization` header. `TASTE ACTIVE` = flag on ∧ listing published ∧ effective visitor budget > 0 ∧ key predicate passes (D3).

| Method | Today / flag off (byte-identical) | Taste active |
|---|---|---|
| `initialize` | protocol/serverInfo result (rpc:170-179) | same + `instructions` field (D2) |
| `ping` | `{}` | unchanged |
| notifications | 202, no body | unchanged |
| `tools/list` | `-32000` missing-key | taste descriptor set (D2), including per-tool `taste_session` hints and remaining-call framing |
| `tools/call` (allowlisted) | `-32000` | caps → route: `ground_on_my_business` / deterministic / taste-`ask`; doors on cap |
| `tools/call` (anything else) | `-32000` | doors (`locked_tool`) |
| `prompts/list`, `prompts/get` | `-32000` | **unchanged — still `-32000`** (seller IP) |
| any method, bearer present (valid or not) | today's authorize() verdicts | **identical — taste lane requires bearer === null** |

`ask` without a `taste_session` still runs (ungrounded, on the listing's own soul/persona) — zero-friction first touch; the instructions steer toward grounding first. Invalid/expired `taste_session` → gentle in-band note to re-ground (text result), not an error.

### D12 — Grounding content mapping

`ground_on_my_business` reuses the analyze-url pipeline shape (assert → fetch/timeout/UA → `htmlToMarkdown` → cap → one extraction call → compact struct). The stored blob is the `ExtractedBusinessData`-shaped struct (≤8192 bytes serialized; field-wise truncation: services ≤ 8 entries, testimonials ≤ 3, each string ≤ 400 chars). At taste-turn time the blob maps into the turn as the **visitor's** business identity — `orgName` = grounded businessName and a minimal `OrgSoul`-shaped grounding (industry/services/voice) — while the **blueprint** (skill, FAQ, quote ranges, persona) stays the listing's. The taste pitch in one line: *the seller's agent, wearing your business.* Deterministic tools keep answering from the listing's blueprint (they demonstrate the agent's own knowledge rail).

---

## 4. Money-safety non-negotiables (Global Constraints, restated)

1. **A taste call never spends the platform key unless the listing's creator org is in `SF_FLAGSHIP_ORG_IDS`** — the `provider === "platform"` branch refuses taste for non-flagship sellers, with a unit test proving refusal (and proving `messages.create` was never invoked on that branch).
2. Seller spend is protected by default even on their own key: haiku pin + `TASTE_MAX_TOKENS = 400` + extraction `max_tokens 1200` / 20K-char input + platform hard ceilings (10/visitor/day, 500/listing/day) that seller preferences cannot exceed.
3. No side-effect tools anonymously: rental surface already excludes them; taste additionally intersects capabilities to `["provide_faq_answer","get_quote_range"]` and forces `testMode: true`.
4. Flag-inert: `SF_AGENT_TASTE_MODE` unset ⇒ anonymous callers get today's exact behavior, byte-identical, proven by test. Any presented bearer bypasses taste entirely.
5. No key/secret/token logging: log `sid` (session uuid) only — never the `tst_` token, never any API key, never raw IPs (hash only).
6. Anonymous DB writes bounded: rows only from `ground_on_my_business`, TTL ≤ 1h, blob ≤ 8KB, creation caps 2/visitor+listing/day and 6/IP/day, cleanup on `orphan-workspace-ttl`.
7. P1 is tracking-only: no billing, no accrual, no commission changes.

---

## 5. Out of scope (explicit)

- Seller commission on taste-originated conversions (future phase; the P1 events make it measurable first).
- `taste_door_clicked` (needs a redirect hop).
- Seller dashboard taste-counter card (P1 visibility = events under their org).
- Cross-turn taste conversation memory (each `ask` is single-turn, mirroring the paid rail's v1).
- Reusing `previewSessions`/claim-token so door 1 lands with the grounding pre-seeded into a workspace preview — a beautiful convergence, but it couples two rails; noted for the founder (§6).

## 6. Founder-level open questions

1. **Grounding hand-off across the door (the big one):** `ground_on_my_business` produces exactly what `analyze-url` produces for the preview-builder. Should door 1 carry the taste session's grounding into a `previewSessions` claim token (so "keep talking" lands in a workspace that already knows their business)? It roughly doubles door-1 conversion odds but couples the taste rail to the preview rail — P2 candidate needing your call on the coupling.
2. **Flagship bench contents:** which org ids seed `SF_FLAGSHIP_ORG_IDS` at launch (canonical Seldon Studio org `e1b16f47…`? the SF house org already referenced by `SELDONFRAME_HOUSE_ORG_ID`, route.ts:153)? Should flagship taste get a *higher* default daily cap than 50?
3. **Default budget:** per-visitor default 3 (your ruling) — but should the *platform* eat the first grounding call's cost on non-flagship listings as a growth subsidy, or is seller-pays absolute from call one? (Design as written: seller pays from call one.)
