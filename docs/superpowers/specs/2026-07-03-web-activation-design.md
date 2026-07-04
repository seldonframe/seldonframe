# Web Activation — Ungated Build + Google One-Click + Step Funnel

**Design spec — 2026-07-03**

**One-liner:** Make the landing page's promise true — a stranger pastes a URL and *watches a real, live workspace (website + booking + CRM + a chatbot they can talk to) build in ~60s, before signing up* — then restore Google one-click signup, and instrument the true signup→build funnel.

---

## 1. Context & problem

The measured **external** activation funnel (Max's own 4 accounts + agency clients + MCP test orgs excluded): **~22 real signups → 2 ever built an agent → 0 active in 30 days → 0 paying → 0 ever connected via IDE/MCP.** The bottleneck is a **web activation wall at step one**, not retention or distribution.

Root cause, confirmed on `origin/main`:
- The hero (`marketing-hero.tsx:155`) promises *"Paste your URL and watch it build — live in 60 seconds,"* but submitting the paste box runs `router.push('/signup?...')` — **nothing builds**. The magic moment is withheld behind an email wall.
- Signup is **magic-link only** (Google was dropped from the UI though still wired), lands on a **billing step** before any value, then a jargon **Soul `/setup` framework wizard**, and the web flow **never produces the AI chatbot** the landing sells (agents are MCP-only).

Audit artifact: `https://claude.ai/code/artifact/43b2b9e0-8d97-475d-88d6-cfa2f07ead52`

## 2. Goal & success criteria

A cold visitor to `seldonframe.com` can, **without signing up**:
1. Paste a URL (or describe a business) and watch a **real workspace build** on a live `<slug>.app.seldonframe.com` subdomain.
2. See the built site **and talk to a working AI receptionist** seeded from that business.
3. Click "Save," sign up (**Google one-click** or magic-link), and land **in that same workspace** — no re-build, no billing step.

Plus: the super-admin dashboard shows a true **signup → workspace → agent built → agent tested** funnel with internal accounts excluded by default.

**Success = the promise→delivery gap is closed and measurable.** Definition of done per part is in each part's section; the whole is verified by the standard gate (§10) and a manual cold-visitor smoke on a preview URL.

## 3. Scope

Three **independently-shippable** parts, one spec:
- **P1** — Ungated paste → build → reveal (with live chatbot) → invisible claim. *(audit fixes #1 + #2)*
- **P2** — Google one-click on signup. *(audit fix #3)*
- **P3** — Step-level activation funnel + internal-account exclusion.

**Out of scope (YAGNI):** the Soul `/setup` wizard rewrite, marketing copy/jargon changes, any new Stripe/billing code.

**Deferred — the NEXT batch after this (audit fixes #4/#5/#6), see §12:** move billing out of onboarding, kill the jargon/framework picker, add above-the-fold proof.

## 4. Global constraints (bind every task)

Copy these verbatim into the implementation plan's Global Constraints:

- **Money-safe:** No new Stripe calls anywhere in this work. The only new spend is platform Anthropic tokens on the extraction call, bounded by an IP rate limit **and** a URL-keyed result cache (§9). No charge path is reachable.
- **Flag-gated & dark until flipped:** The entire P1 public build surface is gated behind `SF_WEB_UNGATED_BUILD` (value `"1"`). With the flag off, the public route returns 404 and the landing hero keeps its current `router.push('/signup')` behavior — **byte-identical to today**. Prove flag-off inertness with a test.
- **Secrets are Max's:** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (P2), `CRON_SECRET` (GC cron), `UPSTASH_*` (rate-limit prod) are set by Max in Vercel. Never hard-code or echo secret values.
- **Extraction model is pinned:** keep `claude-sonnet-4-20250514` for `extractBusinessData` (do **not** swap to Haiku). Add `cache_control` prompt caching only.
- **Reuse, don't rebuild:** every rail in §6 already exists — wire to it, don't reimplement.
- **Verify gate per part** (§10): `node --test` on new/changed specs, `npx tsc --noEmit`, `pnpm check:use-server`, `pnpm -C packages/crm build`.
- **Migrations are hand-numbered** per the house rule (next filename number + hand-appended `_journal.json` idx; no `drizzle-kit generate`, no snapshot files).

## 5. Architecture overview

P1 is **wiring existing rails into a public, unauthenticated flow**, plus three genuinely new pieces (a public build page, an extraction cache, a GC cron). P2 is a button + env. P3 is a query rewrite.

```
LANDING (marketing-hero)                       [flag SF_WEB_UNGATED_BUILD]
   paste URL/description
        │  (flag on) POST /api/v1/web/build/stream  ── SSE ──►  BuildAnimation (reused, public)
        ▼
   PUBLIC BUILD  (new route /build)
     1. checkRateLimit(ip, 3, 24h)          ── guardrail
     2. scrape (fetchPublicUrlSafe) + extractBusinessData
          └─ URL-keyed cache lookup  →  hit: skip scrape+LLM (~$0)
          └─ miss: Sonnet-4 + cache_control (prompt-cached) → store
     3. createFullWorkspace(...)  → real org + live subdomain + blocks
     4. auto-create + publish website-chatbot  (create-full route logic)
     5. return { public_urls, chatbot_embed, claimToken=bearerToken }
        ▼
   REVEAL  (new route /build/[slug] or reveal state)
     live site preview + EMBEDDED working chatbot (talk to it)
     CTA "Save your workspace" → /signup?redirectTo=/api/claim-build&token=…
        ▼
   SIGNUP  (Google one-click | magic-link)          [P2]
        ▼
   INVISIBLE CLAIM: on first auth, link-owner(token) → organizations.ownerId = user
     → land in the workspace dashboard (NOT /signup/billing)

   GC CRON (daily): delete anonymous, owner-less, unclaimed orgs older than 7d

SUPER-ADMIN  getActivationFunnel() → signup→workspace→built→tested (+ exclude-internal)   [P3]
```

**Reused rails (exact, from code):**

| Rail | Signature / location |
|---|---|
| Public scrape+extract | `POST /api/v1/public/analyze-url` → `extractBusinessData(markdown, url)` (`claude-sonnet-4-20250514`, `max_tokens: 2048`, **no cache today**) |
| Real workspace build | `createFullWorkspace(input: CreateFullWorkspaceInput): Promise<CreateFullWorkspaceResult>` (`lib/workspace/create-full.ts:187`) |
| Streaming build + animation | authed `ClientsNewForm` → `POST /api/v1/web/workspaces/create-from-url` (SSE) → `BuildAnimation({active, input, eventSource, revealLinks})` (`"use client"`, session-free, **reusable**) |
| Chatbot auto-seed | create-full route: `createAgent({orgId, archetype:"website-chatbot", channel:"web_chat", faq, pricingFacts, greeting})` + `publishAgent` (eval-gated); v2/complete: same with `status:"live"` + `setPublicChatbotEmbed` |
| Anonymous build (low-level) | `createAnonymousWorkspace(input): Promise<{orgId, slug, name, bearerToken, bearerTokenExpiresAt, installedBlocks}>` |
| Owner transfer | `POST /api/v1/workspace/[id]/link-owner` (LOCATE: confirm token→ownerId contract) |
| Rate limit | `checkRateLimit(key, limit=120, windowMs=60_000): Promise<boolean>` — Upstash-backed, in-memory fallback |
| Prompt-cache pattern | `enhance-blocks.ts:722` — `system: [{type:"text", text, cache_control:{type:"ephemeral"}}, …]` |
| Cron pattern | `/api/cron/expire-proposals` — auth `Authorization: Bearer ${CRON_SECRET}`; `vercel.json` `crons` entry |
| Signup redirect | `signup-form.tsx` embeds `redirectTo` hidden input; `sendMagicLinkAction` sanitizes via `isSafeInternalRedirect` (fallback `/clients/new`) |
| Google provider | `auth/config.ts:28` — `if (googleClientId && googleClientSecret) authProviders.push(Google({… allowDangerousEmailAccountLinking:true}))` — **already conditional; just needs the UI button + env** |
| Funnel base | `getActivationFunnel(): Promise<ActivationSummary>` (`super-admin/activation.ts`) |

## 6. P1 — Ungated build → reveal → claim (fixes #1 + #2)

### 6.1 Components

1. **Landing hero wiring** (`marketing-hero.tsx`): when `SF_WEB_UNGATED_BUILD` is on, the paste submit navigates to the new **`/build`** route carrying the pasted URL/description (query param), instead of `router.push('/signup')`. Flag off → unchanged.

2. **Public build page `/build`** (new, unauthenticated, `(public)` route group): renders the paste field (pre-filled from query) + the reused `BuildAnimation`. On submit, opens an `EventSource` to the new streaming endpoint and drives the animation. No session, no dashboard chrome.

3. **Public streaming build endpoint** `POST /api/v1/web/build/stream` (new; model on the existing authed `/api/v1/web/workspaces/create-from-url`):
   - **Guardrail:** `checkRateLimit('web-build:'+ip, 3, 24h)` → 429 with a friendly SSE error on exceed.
   - **Extract (cached):** normalize URL → `getCachedExtraction(urlHash)`; on hit, skip scrape + LLM; on miss, `fetchPublicUrlSafe` + `extractBusinessData` (now prompt-cached, §9) → `putCachedExtraction`.
   - **Build:** `createFullWorkspace(mapExtractionToCreateFullInput(business))` → real org + live subdomain + blocks. `source: "web_ungated"`.
   - **Chatbot:** run the create-full route's chatbot-seed (`createAgent` website-chatbot from mapped FAQ + `publishAgent`) so the workspace has a **published, answering** chatbot.
   - **Stream** phase events shaped for `BuildAnimation`; final event carries `{ public_urls, chatbot_embed_snippet, chatbot_agent_id, claimToken }` where `claimToken` = the org's `bearerToken`.
   - Anonymous orgs are created **`noindex`** (LOCATE: confirm the workspace `noindex`/robots flag; if none, add one gated on unclaimed).

4. **Reveal** (`/build` post-build state, or `/build/[slug]`): shows the **live site** (iframe/preview of the public subdomain) and an **embedded, working chatbot** (the published website-chatbot) the visitor can talk to about their own business. Primary CTA **"Save your workspace"** → `/signup?redirectTo=<claim-return>&token=<claimToken>`. Secondary: "Start over."

5. **Invisible claim:** signup's `redirectTo` points at a small server handler (`/api/v1/web/claim-build` or a `/claim-build` page) that, on the newly-authenticated session, calls **`link-owner`** with the `token` to set `organizations.ownerId = session.user.id`, then redirects into the workspace dashboard. **No visible "claim" step** (matches the "no claim step" vision). If the token is missing/expired, fall through to normal signup landing.

6. **GC cron** `GET /api/cron/gc-unclaimed-workspaces` (new; mirror `expire-proposals`): auth `Authorization: Bearer ${CRON_SECRET}`; deletes orgs where `source = "web_ungated"` AND `ownerId IS NULL` AND `createdAt < now() - 7d` (never touches a claimed/owned org). Add a `vercel.json` `crons` entry (daily, e.g. `"0 4 * * *"`). Log the count reclaimed (no silent cap).

### 6.2 Data flow & interfaces

- `mapExtractionToCreateFullInput(business: ExtractedBusinessData): CreateFullWorkspaceInput` — pure mapper (TDD). Maps businessName→business_name, contactInfo→phone/email/address, services, testimonials, review_count/rating, etc.
- Extraction cache (§9): `getCachedExtraction(urlHash): Promise<ExtractedBusinessData | null>` / `putCachedExtraction(urlHash, url, data)`.
- The claim token IS the org `bearerToken` returned by the build (a workspace-admin capability — proves the holder may claim). It is passed once through signup and consumed by `link-owner`.

### 6.3 Error handling

- Scrape/SSRF failure → friendly SSE error, offer the "describe the business" text path (no URL).
- Extraction LLM failure → `fallbackBusinessData(markdown)` (already exists) so a build still completes.
- Build failure mid-stream → error event; the animation shows a graceful "couldn't finish — try again"; no partial org left un-GC'd (it still has `ownerId IS NULL` so GC reclaims it).
- Rate-limit exceeded → SSE error "you've built a few already today — sign up to keep going" (turns the limit into a signup nudge).

### 6.4 Definition of done (P1)

Flag on: cold visitor pastes a URL → watches the build → sees a live workspace + talks to its chatbot → signs up → lands owning that workspace. Flag off: landing behaves byte-identically to today, `/build` and `/api/v1/web/build/stream` 404. GC cron reclaims an unclaimed test org. Mapper + cache + claim-return have unit tests.

## 7. P2 — Google one-click (fix #3)

The Google provider is **already registered conditionally** (`auth/config.ts:28`, `allowDangerousEmailAccountLinking: true`) and the prod PKCE/cookie callback bug is **already fixed** (`auth.ts` 2026-05-17, `__Secure-` prefix removed from pkce/state cookies). So:

- **Add a primary "Continue with Google" button** to `signup-form.tsx` that calls `signIn('google', { redirectTo })` — threading the same `redirectTo` (so the claim token survives an OAuth signup too). Magic-link email becomes the secondary option.
- Mirror on the login form if one exists (LOCATE).
- The button renders **only when Google is configured** (surface a `googleEnabled` boolean from the server so it doesn't appear dead when env is unset) — flag-free, purely env-driven.
- **Max's actions (documented in the plan's rollout):** set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in Vercel; add `https://app.seldonframe.com/api/auth/callback/google` (and any preview) as authorized redirect URIs in Google Cloud.
- **Test:** a signed-out cold OAuth round-trip on a preview URL returns to the intended `redirectTo` (and, from the reveal, claims the workspace).

### Definition of done (P2)

With env set, `/signup` shows "Continue with Google" first; the round-trip authenticates and honors `redirectTo`. With env unset, no dead button.

## 8. P3 — Step-level activation funnel

Rewrite the funnel in `super-admin/activation.ts` from workspace-unit to a true per-actor funnel, **excluding internal accounts by default**.

**Stages (each a distinct count, monotonic):**
- **Signup** = `users`.
- **Workspace** = users with ≥1 owned org (`organizations.ownerId = users.id`), i.e. they created a workspace.
- **Agent built** = orgs (owned, non-internal) with ≥1 row in `agents`.
- **Agent tested** = orgs with ≥1 `agent_conversations` row (any status — `status='test'` counts) **OR** ≥1 `agent_evals` row. (Distinct from the existing "Active 30d" which stays as a secondary metric.)
- Keep **Paying** (existing `PAID_PLAN_IDS`) and the **IDE-connections** health block.

**Internal exclusion** (default on, toggle to include): exclude orgs where `ownerId ∈ SF_INTERNAL_USER_IDS` OR `parentUserId ∈ SF_INTERNAL_USER_IDS` OR `parentAgencyId = SF_INTERNAL_AGENCY_ID` OR `previewMode = true` (unclaimed previews). `SF_INTERNAL_USER_IDS` / `SF_INTERNAL_AGENCY_ID` come from env (default: Max's 4 user ids + the Seldon Studio agency id, documented). A `?include_internal=1` query param on the dashboard flips it.

**Implementation:** same `unstable_cache` (TTL 300) + `.catch`-guarded single-SELECT pattern as the existing file; pure helper `buildInternalExclusionSql(ids)` (TDD). Dashboard page renders the 4-stage funnel + a small "excluding N internal workspaces" note.

### Definition of done (P3)

`/super-admin` shows signup→workspace→built→tested with internal excluded by default and a toggle; numbers reconcile with a manual SQL spot-check.

## 9. Cost model (extraction caching)

Two layers, both with in-repo precedent:

1. **URL-keyed result cache (primary lever).** New table `url_extraction_cache` (`url_hash` PK, `url text`, `data jsonb`, `created_at`) — or Upstash KV if preferred (LOCATE: prefer table for durability + inspectability). Normalize the URL (strip scheme/query/trailing slash, lowercase host) → SHA-256 → key. Hit → skip **both** scrape and LLM → **~$0**. TTL/refresh: serve cached up to 30 days; ignore for the "describe the business" (no-URL) path unless the description hashes identically. This makes repeat/viral/demo pastes free.

2. **Sonnet-4 prompt caching (fresh-build lever).** Restructure `extractBusinessData` to the `enhance-blocks.ts` pattern: move the static extraction instructions + JSON schema into a `system: [{type:"text", text: EXTRACTION_SYSTEM, cache_control:{type:"ephemeral"}}]` block; keep only the variable scraped markdown in the user message. The static prefix (~the whole instruction) is prompt-cached (5-min TTL), so bursts of fresh builds pay ~10% on the cached prefix. Keep `claude-sonnet-4-20250514`.

**Honest cost:** fresh build of a new URL ≈ **$0.01–0.03** (Sonnet on scraped markdown, static prefix cached); every repeat of that URL ≈ **$0**. Everything downstream (personality via keyword `selectCRMPersonality`, R1 landing render, chatbot creation) is deterministic and $0.

## 10. Testing strategy

- **Pure logic, TDD:** `mapExtractionToCreateFullInput`, URL normalization + cache key, `buildInternalExclusionSql`, the claim-return redirect resolver, the GC selection predicate.
- **Flag-off inertness test (money/safety gate):** with `SF_WEB_UNGATED_BUILD` unset, the landing hero output and `/signup` flow are unchanged and `/build` + `/api/v1/web/build/stream` 404.
- **Cache test:** second identical URL extraction returns the cached object without a second Anthropic call (inject a spy client).
- **Funnel test:** synthetic orgs/users → the 4 stage counts + internal exclusion are correct.
- **Standard gate per part:** `node --import tsx --test` on changed specs, `npx tsc --noEmit`, `pnpm check:use-server`, `pnpm -C packages/crm build`.
- **Manual smoke (P1+P2):** on a Vercel preview with the flag on, a cold paste→build→talk→Google-signup→own-the-workspace round-trip.

## 11. LOCATE FIRST (pin during planning)

The plan must confirm these before writing tasks (do not assume):
1. `/api/v1/web/workspaces/create-from-url` — exact request + SSE event shape; whether it already calls `createFullWorkspace` + chatbot-seed (if so, the public endpoint may be a thin auth-optional variant, not a rewrite).
2. `/api/v1/workspace/[id]/link-owner` — exact contract: does it accept the `bearerToken` and set `ownerId`? auth model?
3. Whether `createFullWorkspace` already creates the chatbot internally on some paths vs. only the route wrapper (agent found the wrapper does it) — pick the single call path that yields a **published** chatbot for the public build.
4. Workspace `noindex`/robots control for unclaimed orgs.
5. `organizations.source` column existence (for GC predicate + funnel) — or the right marker for "web_ungated, unclaimed."
6. The exact `ExtractedBusinessData` type + `CreateFullWorkspaceInput` type for the mapper.
7. Login form location (for the P2 Google button parity).

## 12. Future work (the NEXT batch — audit fixes #4/#5/#6)

Not built here; captured so they're not lost (Max asked for these after):
- **#4 Move billing out of onboarding** — P1's claim path already lands in the workspace (bypassing `/signup/billing`); this item finishes the job by removing the pre-value billing step from the remaining signup paths and deferring card to the first gated action.
- **#5 Kill the jargon + Soul framework picker** — replace the `/setup` Coaching/Agency/SaaS wizard with the paste→build path; rename "Soul/blocks" to plain "website / booking / CRM / AI receptionist."
- **#6 Above-the-fold proof** — a looping build demo or real generated-workspace screenshot in the hero to back the "60 seconds" claim before the paste.

## 13. Rollout

1. Ship all three parts behind their gates (P1 `SF_WEB_UNGATED_BUILD` off; P2 env-driven; P3 live but internal-excluded).
2. Max: set `GOOGLE_CLIENT_ID/SECRET` + Google Cloud redirect URIs; confirm `CRON_SECRET` + `UPSTASH_*` set; add the GC cron schedule.
3. Smoke on preview → flip `SF_WEB_UNGATED_BUILD=1` → watch the P3 funnel move.
4. Then start the #4/#5/#6 batch.
