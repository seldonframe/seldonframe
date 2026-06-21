# Tasks — SeldonFrame

Canonical in-flight plan. Per CLAUDE.md §2.7, every non-trivial task starts here
with a checkable plan, gets ticked off as it ships, and ends with a review block.

---

## In flight

### Builder Fix Pass — persona isolation + 3 UX fixes (feature/agent-builder) — DONE

Follow-up on the merged builder (Phases 0-2). 4 commits.

- [x] Fix 1 (persona isolation, CRITICAL) — `test-actions.ts testAgentTemplateTurn`:
      pass `soul: null` + `orgName: "your business"` to runStatelessAgentTurn (was
      org.name + org.soul → Seldon Studio identity bled into the HVAC template test).
      Stop selecting org.name/soul (keep slug+timezone). Header comment updated.
      → commit f8efeed7
- [x] Fix 1b — `generate.ts buildGeneratePrompt`: added a line telling the model to
      write the persona for the business TYPE generically (no invented client name).
      → commit f8efeed7
- [x] Fix 2 (surface-filtered tools) — added pure `capabilitiesForSurface(surface)` to
      store.ts (TDD in store.spec.ts); used it in `generateAgentDraftAction` instead of
      ALL_TEMPLATE_CAPABILITIES + routed the editor page through it. → commit 87404e81
- [x] Fix 3 (rotating loader) — cycle status messages every 1500ms while pending in
      new-agent-button.tsx (Generate) + [id]/editor-client.tsx (Refine). → commit fa275244
- [x] Fix 4 (create card → modal) — new-agent-button.tsx inline-expand → centered
      modal (portal + backdrop/Cancel/X/Escape close + body-scroll lock). Body+logic
      unchanged. → commit 43f1cb45
- [x] Verify: agent-templates spec suite green (79/79) + tsc 0-new + check-use-server ✓.

#### Review
- Persona isolation: a tested template no longer inherits the builder workspace's
  identity. Confirmed by reading lib/agents/prompt.ts — passing `soul:null` skips
  every `if (soul?…)` / `if (soulRaw…)` block (About this business / Services /
  Business facts), and `orgName:"your business"` only feeds the persona-line {orgName}
  fallback, which `customSkillMd` already replaces. The template's own blueprint
  (customSkillMd + FAQ + pricingFacts + quoteRanges) now drives the reply.
- The editor already filtered tool checkboxes by surface (page.tsx ternary on
  VOICE/CHAT caps); Fix 2 just unified both call sites on the new helper.
- LLM output can't be unit-tested; verified Fix 1/1b by tsc + reasoning. The
  pure helper (capabilitiesForSurface) IS unit-tested.
- Out of scope (untouched): loadDeploymentVoiceContext (deployed voice path has the
  same builder-soul bleed; telephony Phase 2.2 fixes it separately).
- Manual click-through of a real generate/refine/modal is the user's to run.

### ICP-3 Task 1.2 — Sandboxed test panel for agent templates

Let a builder TEST a voice-receptionist TEMPLATE via chat before deploy/sell.
Sandboxed: testMode (write tools synthetic), NO persistence, NO deployment.

Key reuse: `executeTurn` (runtime.ts) is DB-coupled (loads + persists conversation
+ turns) so it can't run a no-persist template test directly — but it's a thin
orchestration over reusable blocks: `composeSystemPrompt` (prompt.ts),
`getToolsForCapabilities`/`findTool` (tools.ts), `getAIClient` (ai/client.ts), and
the documented Anthropic tool-loop. `ToolExecuteContext.testMode` short-circuits
every write tool (book_appointment, escalate_to_human, take_message → synthetic,
no DB writes). I lift that loop into a shared DB-free helper that both could use.

- [x] 1. `lib/agents/stateless-turn.ts` — `runStatelessAgentTurn(input)`: pure,
      DB-free, DI Anthropic client; reuses composeSystemPrompt + tools registry +
      the same loop/MODEL/iteration cap as executeTurn. Returns { reply, toolCalls }.
- [x] 2. `lib/agent-templates/test-actions.ts` ("use server"):
      `testAgentTemplateTurn({ templateId, messages })` org-guarded, no-persist,
      testMode; `no_llm_key` branch via getAIClient. + `markAgentTemplateTestedAction`.
- [x] 3. `/studio/agents/[id]/test` route (mirror /deploy): server page (org-guard
      + resolveAgentKeyStatus pre-flight) + test-client.tsx chat island.
- [x] 4. "Test" button in the editor header + Mark-as-tested.
- [x] 5. TDD stateless-turn (mocked client) + system-prompt-from-blueprint.
- [x] 6. Verify: tsx --test, tsc -p, check-use-server.sh.

Review (ICP-3 Task 1.2):
- Reuse: `runStatelessAgentTurn` (new lib/agents/stateless-turn.ts) lifts the
  EXACT LLM↔tools loop from `executeTurn` (same MODEL, MAX_TURN_ITERATIONS,
  Messages-API message shape) and reuses `composeSystemPrompt` + the tool
  registry verbatim — no new prompt assembly, no new tool dispatch. It just
  drops the persistence/budgeting/validator-regen layers (don't apply to a
  throwaway sandbox) and injects the Anthropic client (DI for tests). NO `@/db`
  import in the module → structurally cannot mutate.
- Sandbox proof: testMode flows into every tool's ToolExecuteContext.
  book_appointment/escalate_to_human/take_message short-circuit to synthetic
  results before any DB import. The spec asserts the booking tool_result fed
  back to the model is testMode:true with a `test-` id — would have ECONNREFUSED
  if it hit the DB. No conversation/turn rows written (action never calls
  executeTurn).
- no_llm_key UX: action returns {ok:false,error:"no_llm_key"} when getAIClient
  yields no Anthropic client; page pre-flights via resolveAgentKeyStatus and the
  client halts the input + shows a banner linking /settings/integrations/llm.
- Tests: 6 new (stateless-turn.spec.ts) all green; existing store.spec 19/19;
  tsc 0 source errors (10 .next/ baseline only); check-use-server clean.

- [ ] **Portal Documents (file upload)** — first-class file uploads on the
      Client Portal. New `portal_documents` table + Vercel Blob, server actions
      `uploadPortalDocumentAction` / `markPortalDocumentDownloadedAction`,
      operator drag-drop tab on the contact record, merged client-portal list.
      Plan: [tasks/portal-documents-plan.md](./portal-documents-plan.md).

- [x] **Cinematic landing (Phase 1 — hero)** — Aura-style cinematic hero
      variant + Pexels video backgrounds, defaulted on for agency + coaching
      archetypes. Shipped in v1.41.0 — preview-deploy verification pending
      (the live regen check on signal-to-leads). Phase 2 (extending the
      cinematic system to about/services/testimonials/pricing/CTA sections)
      stays deferred.
      Plan: [tasks/cinematic-landing-plan.md](./cinematic-landing-plan.md).

- [x] **Parallel enhance Phase 1a (latency 116s → ~25s)** — shipped in
      v1.42.0. Merged to main. Vercel auto-promoted. Phase 1b (async
      URL return via Next 16 `after()`) stays deferred.
      Plan: [tasks/parallel-enhance-plan.md](./parallel-enhance-plan.md).

- [x] **Hero template registry (5 new templates)** — shipped in v1.43.0.
      Plan: [tasks/hero-templates-plan.md](./hero-templates-plan.md).

- [x] **persist_block ↔ template registry wiring** — shipped in v1.44.0.
      Fixes the architectural disconnect where v1.43 templates lived in
      enhance-blocks (server-side single-call path) but operator MCP flow
      used persist_block (per-block, writes contentHtml). 5-file fix:
      extends hero schema with template/shiny_word/background_video_query,
      persist.ts now resolves Pexels + writes sections JSONB when template
      is set, public page renderer prioritizes sections over contentHtml.
      Output: every persist_block-built hero now renders via
      HERO_TEMPLATES[template] React tree with Framer Motion + liquid
      glass instead of legacy static HTML with Unsplash photo.

---

## Queued — post-staging

Ordered by staff-engineer priority after staging passes. Pick top-of-stack next.

**High priority (pre-production promotion):**

- [ ] **MCP-side tool: `revoke_bearer`** — add to `skills/mcp-server/src/tools.js`,
      mirrors the `/api/v1/workspace/[id]/revoke-bearer` endpoint. Builders need
      a way to rotate a leaked device token without SQL.
- [ ] **Input sanitization audit** across the 4 typed customizer endpoints —
      `landing/update`'s `contentHtml` is hand-escaped but worth a second pass;
      `intake/customize` field `key` is regex-sanitized to snake_case; booking
      `title`/`description` pass through to JSONB; theme colors are hex-regex.
      Confirm nothing renders user input as unescaped HTML in the public pages.
- [ ] **Orphan workspace TTL cron** — delete anonymous `ownerId IS NULL`
      workspaces unclaimed for 30 days. Vercel cron at `/api/cron/orphan-ttl`.
      Prevents row accumulation now that anyone can `create_workspace`.
- [ ] **Drizzle journal drift on Seldon Frame DB** — `drizzle.__drizzle_migrations`
      is empty even though 39 tables + migration 0015 are applied. Next
      `pnpm db:migrate` will try to replay 0000–0014 and fail. Pick one:
      (a) backfill journal with all applied migrations,
      (b) switch to `drizzle-kit push` (no migration tracking),
      (c) apply future schema changes via Neon MCP SQL only.

**Medium priority (post-promotion):**

- [ ] **NextAuth magic-link claim flow** — one-click post-claim sign-in.
      Currently requires manual login after `link_workspace_owner`.
- [ ] **Observability pass** — structured logs with `request_id`, `org_id`,
      `identity_kind`; minimal dashboard for installs/day, claim rate.
- [ ] **Typed customizer expansion** — Path B left the surface at 4 customizers
      + install endpoints. Candidates for the next wave based on real builder
      needs: `add_booking_type` (multiple bookings per workspace),
      `configure_vertical_pack` (edit a pack's fields), `add_automation`.
      Don't ship speculatively — wait for a real "I can't do X" from a builder.
- [ ] **Rotate EXPIRE NX pattern** to `SET key 1 EX N NX` + `INCR` branching
      if we observe stuck-TTL-less keys in prod. Not urgent — failure mode
      self-heals on next request.

---

## Shipped

### 2026-04-19 (late evening) — 17/17 green in PRODUCTION 🎯

- [x] Branch merged to main via fast-forward (commit 3d332c79)
- [x] Vercel auto-deployed main → app.seldonframe.com now serves Path B
- [x] Wildcard domain `*.app.seldonframe.com` added as Vercel project domain
      → TLS cert provisioned → subdomain TLS handshake works
- [x] Caught + fixed last bug: `/intake` missing from proxy.ts matcher
      (commit 77b6b8eb). `/book` was in the matcher, `/intake` wasn't,
      so /intake fell through to Next default router and 404'd even
      though the proxy rewrite logic was correct.
- [x] **Full 17-assertion smoke against app.seldonframe.com: 17/17 PASSED**
- [x] Zero-friction first-run delivered: builder installs MCP → one NL command
      → real hosted workspace on <slug>.app.seldonframe.com with CRM, booking,
      intake, Brain v2, dark theme, sharable URLs. Zero backend LLM cost.

### 2026-04-19 (evening) — first real end-to-end green on staging

- [x] Staging DB setup: Seldon Frame project, migration 0015 applied via Neon MCP
- [x] Vercel preview env rotated + rebuilt on commit 668b9a27
- [x] `pnpm test:first-run` against preview URL: 15/15 passed (1 public skip)
      — proves: bearer auth, anonymous create, block install, 4 typed
      customizers, snapshot, link-owner/revoke/switch auth gates, all green
- [x] Path B architecture validated in production-shaped environment: backend
      runs zero Anthropic calls, DB writes only

### 2026-04-19 — zero-friction first-run pipeline

- [x] MCP v2 rewrite with bearer token + `~/.seldonframe/device.json`
- [x] Anonymous `POST /api/v1/workspace/create` (no auth on first workspace)
- [x] Migration `0015_workspace_bearer_tokens.sql` — `api_keys.kind` column
- [x] `resolveV1Identity` helper adopted across 7 v1 routes
- [x] Cal.diy booking + Formbricks intake install endpoints
- [x] Auto-template creation on install (booking, intake, landing page)
- [x] `POST /api/v1/workspace/[id]/link-owner` claim endpoint
- [x] `POST /api/v1/seldon-it` with 6 LLM tools (Opus 4.7 + tool_use)
- [x] `POST /api/v1/brain/query` with LLM + heuristic fallback
- [x] `POST /api/v1/soul/submit`
- [x] `GET /switch-workspace` → active-org cookie flip
- [x] `?workspace=<id>` auto-switch from `dashboard/page.tsx`
- [x] Upstash Redis rate limiter with in-memory fallback (async)
- [x] Free Soul compile on URL source via Next 16 `after()`
- [x] `GET /api/v1/workspace/[id]/soul-status`
- [x] `POST /api/v1/workspace/[id]/revoke-bearer`
- [x] Atomic settings writes via `jsonb_set` (block install + event log)
- [x] Integration test harness + staging runbook + readiness checklist

---

## Review log

### 2026-04-19 staging-readiness slice

**What:** 5 slices across reliability + UX. All 6/6 builds green.
**What it proves:** Code-correctness only. Live-DB correctness not verified.
**Outstanding:** Every item in "Queued — post-staging" above depends on smoke
passing first. If staging breaks in ways the checklist didn't anticipate,
capture the pattern in [tasks/lessons.md](tasks/lessons.md).
