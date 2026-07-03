# Virality Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Sequential implementers in THIS worktree (virality, branch feature/virality-pack off cd168a46).

**Goal:** the five built-in growth loops — powered-by badge, deploy share-card, fork-this-agent, find_blocks in-prompt registry, referral wallet credits (inert until flagged).

**Architecture:** all five are additive surfaces on existing rails: the R1 site renderer, the deploy result envelope, the keyless anonymous-workspace + agent-install path (the ChatGPT app's deps), marketplace search, and the wallet ledger. One additive migration (referrals) in V5 only.

## Global Constraints

- Verify gate per task in `packages/crm`: `node --import tsx --test <touched specs>` → `npx tsc --noEmit` → `pnpm check:use-server`. Verbatim output in reports.
- Commit early and often; never push; reports to `.superpowers/sdd/<task>-report.md` in THIS worktree.
- `skills/mcp-server` (tools.js) is NOT touched in this plan — the two new MCP tools (share field is response-side only; find_blocks + fork don't need client tools v1) ride the improve build's single 1.59.0 bump if needed later. V3/V4 expose HTTP + response fields only.
- MONEY (V5 only): flag `SF_REFERRALS_ENABLED` (absent → every referral entry point is a no-op returning null); credits are WALLET LEDGER rows only (kind `referral_credit`), never Stripe, never cash; UNIQUE idempotency keys `referral:referrer:<refereeOrgId>` and `referral:referee:<refereeOrgId>` (one credit pair per referee, ever); amount env `SF_REFERRAL_CREDIT_CENTS` default 500; wallet mode via the existing `resolveWalletStripeMode`. Max flips the flag.
- Attribution: the badge/share links carry `?ref=<workspaceId>`; capture NEVER blocks the referred flow (fail-soft).
- Keyless fork (V3): FREE listings only — `storefrontPriceFromRow(listing).isPaid` → 404-style friendly refusal (a fork of a paid listing would bypass purchase). Same per-IP rate limiter class as the anonymous create path.

---

### Task 1: Powered-by badge on every generated site

**Files:**
- Create: `packages/crm/src/components/landing-r1/powered-by-badge.tsx`
- Modify: the R1 site shell footer — locate the component that owns the rendered /w site's footer (start at `src/app/(public)/w/[slug]/page.tsx` and follow SiteShell; the badge renders on EVERY R1 archetype once, at the shell level, not per-archetype)
- Test: `packages/crm/tests/unit/landing/powered-by-badge.spec.ts`

**Interfaces (Produces):** `PoweredByBadge({ workspaceId }: { workspaceId: string })` — a small fixed-position-safe footer element: "⚡ Built with SeldonFrame — build yours from your IDE" linking `https://www.seldonframe.com/build?ref=${workspaceId}&utm_source=powered_by`. Server component, zero client JS. Subtle styling consistent with the shell (muted, small, non-blocking); `rel="noopener"`, `target="_blank"`.

**Steps:**
- [ ] TDD a pure `buildPoweredByHref(workspaceId)` (exported from the component file): exact URL shape incl. encoding.
- [ ] Component + wire into the shell footer (one place → all archetypes). Confirm it renders by grepping the built component tree usage — do NOT restyle anything else.
- [ ] Gate → commit: `feat(growth): powered-by badge on generated sites (ref-attributed)`

### Task 2: Deploy share-card

**Files:**
- Create: `packages/crm/src/app/api/og/shipped/route.tsx` (Next `ImageResponse` from `next/og`; edge-safe; inputs via query: `name`, `mins`, `kind`)
- Create: `packages/crm/src/lib/build/share-card.ts` (+ test `tests/unit/build/share-card.spec.ts`)
- Modify: `packages/crm/src/app/api/v1/build/deploy/route.ts` — success response gains `share: { card_url, post_url, text }` (additive field)

**Interfaces:** `buildShareCard(args: { businessName: string; startedAt: Date | null; now: Date; kind: "voice" | "chat" | "workspace" })` → `{ cardUrl, text, postUrl }` — PURE. `text` = `Shipped a 24/7 AI ${kind === "voice" ? "phone receptionist" : "agent"} for ${businessName} in ${mins} minutes — from my IDE. Built on @seldonframe.` `postUrl` = `https://x.com/intent/post?text=<urlencoded text + card link>`. Minutes = clamped 1–120 from startedAt→now, fallback "under an hour" phrasing when null.

**Steps:**
- [ ] TDD `buildShareCard` (minutes clamp, null-start fallback, URL encoding, no template-literal injection from businessName — it is URL-encoded).
- [ ] OG route: dark card, SeldonFrame wordmark text, big "$NAME · shipped in N min", footer "seldonframe.com/build". Keep it dependency-free (system fonts).
- [ ] Wire the deploy route's success payload (additive only — existing consumers unaffected).
- [ ] Gate → commit: `feat(growth): deploy share-card — OG image + x-intent in the deploy result`

### Task 3: "Fork this agent" — keyless buyer→builder conversion

**Files:**
- Create: `packages/crm/src/app/api/marketplace/fork/route.ts`
- Create: `packages/crm/src/lib/marketplace/fork-listing.ts` (+ test `tests/unit/marketplace/fork-listing.spec.ts`)
- Modify: `packages/crm/src/app/(public)/marketplace/[slug]/page.tsx` — "Fork this agent — make it yours in 60s" CTA posting to the route (a plain form, no client JS)

**Interfaces:** `forkListingIntoNewWorkspace(args: { slug: string; ip: string }, deps)` — DI'd, reusing the EXACT pieces the ChatGPT app's deps.ts uses: rate-limit check (same limiter keys class, 3/hr 10/day per IP), resolve PUBLISHED `kind:'agent'` listing, REFUSE paid via `storefrontPriceFromRow(listing).isPaid`, `createAnonymousWorkspace` (name = `${listing.name} Workspace`), clone via the same `buildInstalledAgentTemplate`/`createAgentTemplate` path deps.ts deploy() uses, return `{ adminUrl, publicUrl }`. Route: POST form → 303 redirect to adminUrl; failures → 303 back to the listing with `?fork_error=<reason>`.

**Steps:**
- [ ] TDD the DI'd fork fn over fakes: paid-listing refusal, rate-limited refusal, happy path calls create-then-install in order and returns both URLs, unknown slug refusal.
- [ ] Route + CTA (match the page's existing inline-style tokens; place beside the primary install CTA).
- [ ] Gate → commit: `feat(growth): Fork this agent — keyless listing→workspace conversion (free listings only)`

### Task 4: find_blocks — the in-prompt registry endpoint

**Files:**
- Create: `packages/crm/src/app/api/v1/build/blocks/search/route.ts`
- Create: `packages/crm/src/lib/marketplace/blocks-search.ts` (+ test `tests/unit/marketplace/blocks-search.spec.ts`)

**Interfaces:** GET `?q=<need>&limit=5` (public read-only, cache 5 min) → `{ blocks: Array<{ slug, name, description, niche, kind, url, trust: { evalPassRate, scenarioCount } | null }> }`. `searchBlocks({ q, limit })` ranks `listMarketplaceAgentsFromDb` results by simple term-overlap score over name+description+niche (pure scorer, TDD); trust from `trust_stats` when the improve build's column exists — read defensively (column may not be deployed yet: `(row as any).trustStats ?? null` typed via a local optional field), NEVER throws absent.

**Steps:**
- [ ] TDD the pure scorer (term overlap, empty q → featured/installCount order, limit).
- [ ] Route (no auth — public catalog data only; same posture as the public marketplace pages).
- [ ] Gate → commit: `feat(growth): find_blocks search endpoint (in-prompt registry rail)`

### Task 5: Referral credits (MONEY — inert behind SF_REFERRALS_ENABLED)

**Files:**
- Create: `packages/crm/src/db/schema/referrals.ts` + export from `src/db/schema/index.ts`
- Create: `packages/crm/drizzle/0061_referrals.sql` + journal entry (idx after current tail; check `drizzle/meta/_journal.json` — the improve build may land 0060 first on ANOTHER branch: number this 0061 regardless; if 0060 is absent on THIS branch that is fine — journal idx must simply follow this branch's tail, and the merge wave reconciles (flag any collision in your report instead of resolving it yourself))
- Create: `packages/crm/src/lib/growth/referrals.ts` (+ test `tests/unit/growth/referrals.spec.ts`)
- Modify: `packages/crm/src/app/(public)/build/page.tsx` (or the /build route's server component) — read `?ref=`, set an httpOnly cookie `sf_ref` (90d) — fail-soft
- Modify: the anonymous/workspace creation path that /build leads into — stamp `referrals` row `{ referrerOrgId: <from cookie>, refereeOrgId: <new org>, status: 'pending' }` when cookie present + flag on
- Modify: `packages/crm/src/lib/deployments/deploy-orchestrator.ts` call-SITE (NOT the orchestrator itself — find where a deploy completes server-side, e.g. the deploy route post-success) — `maybeCreditReferral(refereeOrgId)` fail-soft

**Interfaces:**
```ts
export function referralsEnabled(env: NodeJS.ProcessEnv): boolean;          // SF_REFERRALS_ENABLED === "true"
export async function recordReferral(args: { referrerOrgId: string; refereeOrgId: string; source: string }): Promise<void>; // no-op when disabled or self-referral or referee already recorded (unique on refereeOrgId)
export async function maybeCreditReferral(refereeOrgId: string): Promise<{ credited: boolean }>; // idempotent: status pending → credit BOTH wallets via the existing wallet-ledger credit fn with the two UNIQUE keys, kind 'referral_credit', amount SF_REFERRAL_CREDIT_CENTS (default 500), mode via resolveWalletStripeMode → status 'credited'
```
Schema: `referrals { id, referrerOrgId FK, refereeOrgId FK UNIQUE, source text, status text default 'pending', createdAt, creditedAt }`.

**Steps:**
- [ ] READ FIRST: `src/lib/build/wallet-store.ts` + wallet-ledger — find the existing credit function + whether kind `referral_credit` already exists in the kind union; ADD it additively if absent (text column — no migration for the kind itself). Reuse the credit fn; do NOT write new SQL for balances.
- [ ] TDD `referrals.ts` over DI fakes: disabled → all no-ops; self-referral rejected; double-record no-ops; credit is idempotent (second call `credited:false`, no second ledger row — assert by idempotency key reuse); both parties credited with the exact keys.
- [ ] Migration + capture + credit call-site (each fail-soft: a referral bug must never break /build or deploys).
- [ ] Gate → commit: `feat(growth): referral wallet credits — inert behind SF_REFERRALS_ENABLED (ledger-only, idempotent pair)`

### Task 6: Final verify + handoff

- [ ] Full gate: `node --import tsx --test tests/unit/landing/powered-by-badge.spec.ts tests/unit/build/share-card.spec.ts tests/unit/marketplace/fork-listing.spec.ts tests/unit/marketplace/blocks-search.spec.ts tests/unit/growth/referrals.spec.ts` + the marketplace suite (regression) → `npx tsc --noEmit` → `pnpm check:use-server`.
- [ ] Review package for the whole branch → opus fresh-context review (V5 is money; V3 is keyless-write).
- [ ] DO NOT push — the controller merges this branch into the session's final wave alongside the improve build (one deploy, journal collision reconciled there).
