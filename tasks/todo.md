# Tasks — SeldonFrame

Canonical in-flight plan. Per CLAUDE.md §2.7, every non-trivial task starts here
with a checkable plan, gets ticked off as it ships, and ends with a review block.

---

## In flight

### Task 10 — deploy-verb Tier-0 payoff + stripeMode threading (spec 2026-07-01-voice-deploy-metered-billing) — DONE

Worktree `icp3-wedge/packages/crm` (this repo, HEAD 24c70133). Brief: `.superpowers/sdd/task-10-brief.md`. CONTRACT RULE: `runDeploy`'s DeployResult JSON stays byte-for-byte; new failure reason `"insufficient_balance"` rides the existing `{ok:false,reason}` catch-all (CLI's `DeployResult` type already has `{ok:false;reason:string}` — zero CLI type change needed).

Recon (verified, read from code):
- `resolveBillingMode(env)` (`src/lib/marketplace/billing/billing-mode.ts:54`) is ALREADY the exact key-derived resolver the brief describes for Controller-B (`sk_live_`/`rk_live_` ⇒ "live", else "test") — used by `wallet-topup.ts` (the credit path), `run-drawdown-deps.ts`, and `wallet/balance/route.ts` (existing debit/read paths). Elegant move: `resolveWalletStripeMode` = a thin re-export/alias of `resolveBillingMode`, not a reimplementation — genuinely "the same source," zero drift risk. Already has a full spec (`tests/unit/marketplace/billing/billing-mode.spec.ts`) covering live/test/none.
- Voice webhook route (`app/api/v1/voice/openai/webhook/route.ts`) wires `gateMeteredAccept`'s `getBalanceMicros: getWalletBalanceMicros` (~L301) and `meterCallEnd`'s `debitVoiceUsage` (~L478-490) with NO stripeMode arg → defaults to "test" always. Cron (`api/cron/voice-rent/route.ts`) same gap on `debitNumberRent` (~L139).
- `applyProvisionedNumber` in `app/api/v1/build/deploy/route.ts` (~L241) is the exact phone-application branch that calls `resolveBuilderTelephony(orgId)` and returns `{ok:false,reason:"needs_telephony",missing}` on no BYO creds — this is where Tier-0 fallback slots in, via a NEW `RunDeployDeps.provisionSfManagedIfAvailable` seam (not baked into `applyPhone` itself, since forward-mode never needs it).
- `provision-sf-managed.ts`'s real `runStateMachine` (~L220-231) collapses EVERY `provisionVoiceNumber` failure (incl. `no_numbers_available`, `provision-voice-number.ts:29`) to `"twilio_error"` — the exact one-line collapse point Controller-A targets.
- `deploy-readiness.ts`/`-deps.ts`: `telephonyConnected` today = `deployment.phoneNumber present OR resolveBuilderTelephony(orgId).ok`. Adding `tier0Available` as a new pure-input OR-branch; unmet label today is the static `"Phone number"` string at `deploy-readiness.ts:63` — the ONLY copy surfaced downstream (CLI: `writer.out(\`  - ${req.label}\`)`).
- CLI `status.ts` doesn't render `builder.templates`/`deploy_readiness` AT ALL today — additive JSON there is genuinely zero-risk to the CLI.

Plan:
- [x] `resolveWalletStripeMode(env)` — re-export of `resolveBillingMode` in `wallet-store.ts`; focused spec.
- [x] `deploy-readiness.ts` — `tier0Available?: boolean` input; `telephonyConnected || tier0Available` OR-merge; dual-option label when unmet. Extend spec.
- [x] `deploy-readiness-deps.ts` — real `tier0Available` = `voiceManagedEnabled(env) && !!resolveMasterTwilio(env) && balance >= TIER0_READY_FLOOR_MICROS` (balance read via `resolveWalletStripeMode`). Skips the DB read entirely when telephony isn't needed or BYO already satisfies it.
- [x] `deploy-orchestrator.ts` — `RunDeployDeps.provisionSfManagedIfAvailable`; wired into BOTH the no-body-phone branch (tried before `phone_required`) AND as a rescue when `applyPhone` fails with missing BYO creds (never masks an unavailable-Tier-0's original failure). `ProvisionSfManagedIfAvailableResult` (`ok:true` | `available:false` | `available:true,reason`) keeps `not_offered` vs `offered-but-failed` distinct. 9 new tests, TDD (failing-first confirmed).
- [x] `app/api/v1/build/deploy/route.ts` — `applyTier0IfAvailable` wires the real dep (`buildDefaultProvisionSfManagedDeps`); area code = `deriveAreaCode(clientContact.phone)` falling back to a documented default (512) for the true zero-connect case.
- [x] `provision-sf-managed.ts` — widened `ProvisionSfManagedError` with `"no_numbers_available"`; extracted the one-line collapse into a pure `mapProvisionErrorToSfManagedError` (unit-testable without DB/Twilio fakes) and fixed it at the call site. New tests for both the pure mapper and the orchestration passthrough.
- [x] Threaded `resolveWalletStripeMode` into: voice webhook accept-gate read + `debitVoiceUsage` call, `provision-sf-managed.ts` real deps' `debitNumberRent`, rent cron's debit, Tier-0 readiness balance read. BONUS (found while auditing, same invariant): `workspace-state/route.ts`'s `getWalletBalanceMicros(orgId)` call (feeds `builder.wallet_balance_usd` → dashboard + `seldonframe status`) was ALSO unthreaded — fixed.
- [x] Surfaces: workspace-state `builder.templates[].tier0_available` added (org-wide, computed once, reuses the already-fetched wallet balance — zero extra DB round trips even with N templates). CLI: NO code change — `status --json` already serializes the raw `builder` object at runtime (not the narrow `WorkspaceState` TS type), so the new field flows through for free; adding it to the human-readable renderer would require new UX copy decisions out of scope — explicitly skipped, noted here.
- [x] Verify: 531/531 unit tests (deployments+telephony+build) green (46 new/changed) → tsc 0 → check:use-server clean. CLI untouched but sanity-checked anyway: 108/108 tests + clean build.
- [x] Commit (named files only): `feat(voice-billing): deploy-verb Tier-0 payoff — funded wallet ⇒ instant number ⇒ live + mode threading (TDD)`.

**Review:** Shipped the deploy-verb's Tier-0 payoff (funded wallet ⇒ `provisionSfManagedIfAvailable` ⇒ instant number ⇒ live, zero connects) plus both controller-assigned fixes from the T6 review (the `no_numbers_available` taxonomy widening; the stripeMode activation blocker). Key discovery: `resolveBillingMode` (marketplace/billing) was ALREADY the exact resolver the brief asked for — `resolveWalletStripeMode` is a documented one-line alias, not a reimplementation, so there's no second key-parsing path to drift. JSON contract preserved by construction: `DeployResultPhoneError`/`DeployResultGoLiveError` were already `{ok:false; reason:string}` (untyped string), so `"insufficient_balance"`/`"no_numbers_available"` type-check with ZERO type changes; `runDeploy`'s new Tier-0 branches only fire when `!deployment.phoneNumber && needsNumber` (unreachable for chat/already-numbered deploys — 2 dedicated regression tests pin this). Found + fixed one more unthreaded stripeMode call site beyond the brief's named four (`workspace-state`'s wallet-balance read) under the same Controller-B invariant. Full report: `.superpowers/sdd/task-10-report.md`.



### P1 — Builder marketplace: unified discover → inspect → run (spec 1ff09dcb) — IN PROGRESS

Worktree `icp3-wedge/packages/crm`. MONEY-SAFE: P1 = interface + COST CALC + usage RECORD only. NO live charge / NO Stripe call (the prepaid wallet is P2). Errors → cost 0, not recorded billable. Cost is micro-dollars (Monid `billing.calculatedCost`).

Recon (verified, read from code):
- Catalog sources: AGENTS = `marketplaceListings` (kind='agent', isPublished, pricing cols price_model/per_call_price_cents/per_outcome_price_cents/outcome_type). TOOLS = `COMPOSIO_TOOLKITS` + `DEFAULT_TOOLS_BY_TOOLKIT` (`src/lib/integrations/composio/catalog.ts`).
- Agent exec: `resolveRentalAgent(slug)` + `runAgentRentalTurn({agent,message})` (`src/lib/marketplace/agent-rental-run.ts`) → stateless turn on creator BYOK. Tool exec: `new Composio({apiKey}).tools.execute(slug,{userId:orgId,arguments,dangerouslySkipVersionCheck:true})`; key via `resolveComposioKey(orgId)` (null = inert).
- Pricing: `normalizePricingForPersist`/`storefrontPriceFromRow` (`pricing-model.ts`); 5% fee = `computeMarketplaceFeeCents` (`billing/gmv.ts`, MARKETPLACE_FEE_PERCENT=5). Auth: `guardApiRequest` (bearer wst_). Usage record: `trackEvent(event,props,{orgId})` fire-and-forget into seldonframeEvents.

- [x] **Task 1 — discover** — DONE (bea60956). `discoverCatalog` + entry mappers + `POST /api/v1/build/discover`. 12 tests.
- [x] **Task 2 — inspect** — DONE. `buildInspectView`/`agentRunInputSchema` (7 tests) + `POST /api/v1/build/inspect`; tool schema via ensureSession→createMcpClient.listTools (fail-soft permissive).
- [x] **Task 3 — run** — DONE. `computeRunCost` (micro-dollars, 12 tests) + `POST /api/v1/build/run`. Agent→rental turn / tool→Composio execute; records `build_run_usage` (flag-gated, fire-and-forget) but NEVER charges; errors→cost 0, not recorded. Money-safety audit: no Stripe/charge/settle in build/.
- [x] **Task 4 — verify + ship** — DONE. `buildSkillMd()` §7 documents discover→inspect→run + endpoints + the "recorded not charged" contract (10 skill-md tests). FINAL GATE: 50 build tests pass · tsc 0 · check-use-server clean · `pnpm build` exit 0 (all 3 endpoints registered).

**Review:** P1 shipped the unified discover→inspect→run interface over the catalog (agents = published listings, tools = Composio actions), Composio-first. Pure cores TDD'd: `discoverCatalog` (ranker), `buildInspectView`, `computeRunCost` (micro-dollars + 5% fee echo). MONEY-SAFE: run records a `build_run_usage` meter event behind `SF_MARKETPLACE_BILLING` but NEVER charges (no Stripe path in build/); errors → cost 0, not billable. SHAs: discover bea60956 · inspect 8d6b03c1 · run e94821b2 · skill-md+ship (this commit).

### P4 / Task 8 — One shared Apps & tools catalog + agents-list clarity (primitive-composition generator) — DONE

Plan: `docs/superpowers/plans/2026-06-26-primitive-composition-generator.md` Task 8. Worktree `icp3-wedge/packages/crm`. LIGHT unification — do NOT rebuild connectors. Do NOT commit/push.

Recon facts (verified):
- `TOOL_CATALOG` (`src/lib/agents/generate/tool-catalog.ts`) = postiz (vetted) + googlesheets→googledrive / googlecalendar / gmail / notion / slack (composio). PURE (no imports) → a client component may import it directly. No `toolCatalogForUi` exists yet.
- `author-llm.ts` already builds its tool menu from `TOOL_CATALOG` via `buildToolMenu()` — one source already on the author side.
- Editor `ComposioAppsSection` (`src/app/(dashboard)/studio/agents/[id]/editor-client.tsx`) renders chips from the `composioCatalog` prop (= all 8 `COMPOSIO_TOOLKITS`) + a hardcoded "Post to social (Postiz)" chip. Header already says "Apps & tools" (no visible "Composio").
- Agents-list (`src/app/(dashboard)/studio/agents/page.tsx`) ALREADY shows `tmpl.name` + `triggerLabel(resolveAgentTrigger(bp.trigger, surface))` chip → change #3 already satisfied (verify only).
- "Composio" within `studio/agents/**` is all comments / type names / action names / internal `kind:"composio"` checks — none user-visible. (The `/integrations` page names Composio in visible copy but is OUT of scope + is the legit BYO-key surface.)

Steps:
- [x] Add `ToolCatalogUiEntry` + `toolCatalogForUi()` to `tool-catalog.ts` (projection `{id,label,description,connectorKind,toolkitSlug?}`).
- [x] Editor: `ComposioAppsSection` maps `toolCatalogForUi()` (composio entries toggle `toolkitSlug`; postiz/vetted entry opens add-form pre-selected). Dropped the separate hardcoded Postiz chip + the now-unused `composioCatalog` plumbing (editor `Props`/`ConnectorsCard`/`ComposioToolkitOption` type + the `COMPOSIO_TOOLKITS` import in page.tsx). Factored the pill into `AppToolChip` + `appChipLabel`.
- [x] Verify agents-list shows name + trigger chip (ALREADY does at `studio/agents/page.tsx:163,153` — no change).
- [x] Confirm no user-facing "Composio" remains in scope (all remaining occurrences = action name / component id / local vars / `kind:"composio"` checks / comments).
- [x] Test: added a `toolCatalogForUi()` describe block to `tool-catalog.spec.ts` (same ids+order as `TOOL_CATALOG`, includes postiz, label/description/connectorKind verbatim, toolkitSlug present iff composio).
- [x] Verify: specs pass (959, fail 0; tool-catalog spec 20/20) · tsc 0 · check-use-server clean · `pnpm build` exit 0.

Review: LIGHT unification landed. One source of truth — editor quick-chips + author menu both derive from `TOOL_CATALOG`. Side effect (intended): the editor's quick-toggle now shows only the agent-bindable apps (5 composio + Postiz), no longer hubspot/quickbooks/outlook (which aren't in the bindable catalog); a previously-enabled non-catalog toolkit stays untouched in `enabled` (never silently removed). Change #3 (list name+trigger chip) was already implemented in an earlier task — verified, not rebuilt. NOT committed/pushed per instructions.


### Phase 3 (seller side) — Agent Marketplace Seller UI (feature/agent-marketplace-seller) — DONE

Goal: a builder lists a Studio agent in a few clicks + sees earnings, with the
**2% shown ONLY here** ("you keep 98%"). NO migration. Do NOT merge.

Recon facts (verified):
- `publishAgentTemplateAction({templateId,priceCents,niche,tags})` →
  `lib/marketplace/actions.ts:433`. Free→`isPublished=true`; paid→stays unpublished
  (needs Connect). Hardcodes `description: template.name`.
- `marketplaceListings` (`db/schema/marketplace.ts:107`) has `description`,
  `longDescription`, `tags`, `price`, `niche`, `kind`, `installCount`,
  `stripeConnectAccountId`, `isPublished`, `creatorOrgId` → marketing copy fits, NO migration.
- `AgentCard` (`components/marketplace/agent-card.tsx:20`, server cmpt, `{agent: StorefrontAgent}`);
  `StorefrontAgent` via `rowToStorefrontAgent` (`marketplace-data.ts:185`). REUSE for preview.
- Connect gate mirror: soul gate `api/v1/marketplace/listings/[id]/publish/route.ts:44`
  (`price>0 && !stripeConnectAccountId`). Onboarding = POST `/api/v1/proposals/connect/start`→`{url}`
  (`ConnectStartButton`). Status = `stripeConnections` row → `isActive` (`proposals/page.tsx:50`).
- Earnings: rentals = `seldonframe_events` `event='agent_rental_call'`, attributed via
  `orgId=creator_org_id` (`api/v1/agents/[slug]/mcp/route.ts:62`). installs =
  `marketplaceListings.installCount`. revenue = price × installs.
- Fee = `computeInvoiceApplicationFeeCents` + `GMV_FEE_PERCENT=2` (`lib/billing/gmv.ts`).
- Studio nav = `app/(dashboard)/studio/studio-tabs.tsx`. Editor header = `studio/agents/[id]/page.tsx:89`.

Plan:
- [x] S1 — Pure earnings math (TDD) `lib/marketplace/earnings.ts` + spec. `263cd243`
- [x] S2 — Seller actions `lib/marketplace/seller-actions.ts` (publish/update/unpublish/republish
      + connect status), org-guarded, marketing fields, paid→needs_connect. `537cb935`
- [x] S3 — Preview helper (pure, spec) + `list-on-marketplace.tsx` wired into editor header. `7cc5b17a`
- [x] S4 — `studio/earnings/page.tsx` + "Earnings" tab (2% shown ONLY here). `54c3a718`
- [x] S5 — Verify (tsc 0 / check-use-server clean / unit tests) + report.

Review:
- 4 feature commits (+ this todo update). tsc = 0 errors (was 0). check-use-server clean.
- 23 new unit tests, all green (earnings 7, listing-tags 9, listing-preview 7). Full suite:
  4324 pass / 77 fail — the 77 are the documented pre-existing baseline (workflow runtime,
  pricing-catalog mid-implementation #139, archetype isolation, block-gen, signup forms);
  ZERO failures reference any file I added or touched (verified per-spec).
- NO migration (the `tmpl:<id>` reserved tag is the template↔listing FK; reuses
  description/tags/price columns). Did NOT merge.
- Files: lib/marketplace/{earnings,seller-actions,listing-tags}.ts;
  components/marketplace/marketplace-data.ts (buildPreviewStorefrontAgent);
  app/(dashboard)/studio/agents/[id]/{list-on-marketplace.tsx,page.tsx};
  app/(dashboard)/studio/earnings/page.tsx; studio-tabs.tsx; lib/utils/formatters.ts.
- 2% appears ONLY on /studio/earnings. Publish panel + buyer surfaces stay fee-free.
  (Pre-existing, separate: deploy-margin readout + marketing pricing pages — out of scope.)
- Honest gaps: rentals are a usage signal (count only — the agent_rental_call payload carries
  no $ amount, so not summed into revenue); revenue = price × installCount (lifetime, not a
  webhook-confirmed paid ledger); the rental query is the first jsonb `->>` in app code
  (validated via Drizzle .toSQL() — parameterized, correct). No DB/staging run.

---

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

---

## Review — Unified Agent Model P1, Task T4 (event-triggered outbound agents) — 2026-06-25

**Done:** Wired review-requester (← `booking.completed`) + speed-to-lead (← `lead.created`) to fire on real SeldonEvents via a new DI'd orchestrator.

- `src/lib/agents/triggers/run-event-agent.ts` — pure-ish DI orchestrator (`runEventAgent`); never throws; review one-per-contact throttle (per-`(contact,skill)`); speed-to-lead never throttled.
- `src/lib/agents/triggers/run-event-agent-deps.ts` — production deps: `agent_templates` lookup (resolveAgentTrigger → event match), contact load, throttle probe over `smsMessages`+`emails` `metadata.source='agent:<skill>'`, sends via existing `sendSmsFromApi`/`sendEmailFromApi`.
- `src/lib/events/listeners.ts` — hooked `runEventAgent` into the existing `bus.on("booking.completed")` + a NEW `bus.on("lead.created")`.
- `src/lib/forms/actions.ts` + `src/app/api/v1/forms/submit/route.ts` — EMIT `lead.created` after the existing `form.submitted` emit (it wasn't emitted before).
- `src/db/schema/agents.ts` — additive `AgentBlueprint.reviewUrl?` (jsonb, no migration).
- `src/lib/emails/api.ts` — additive `metadata?` param on `sendEmailFromApi` (mirrors SMS) for the throttle tag.

**Verify:** triggers specs 45/45 pass · typecheck `error TS` = 0 · check-use-server clean · `next build` exit 0. Not committed.

---

## #139 Marketplace billing — margin + ledger + race + success-state (2026-06-29)

Money-safe: keep `SF_MARKETPLACE_BILLING` flag + DI'd fake-Stripe. Never charge in dev. Commit per piece; push to main only if green.

**Research (DONE) — P1 margin mechanism.** Stripe docs (/connect/charges, /direct-charges-fee-payer-behavior, /connect/subscriptions) + stripe-node SDK confirm:
- `on_behalf_of` on a destination charge does NOT shift the Stripe processing fee — the platform balance is still debited; it only sets the country-fee basis + merchant-of-record.
- DIRECT CHARGES (`{ stripeAccount: seller }` + `application_fee_amount`/`_percent`, NO `transfer_data`) are the ONLY type where the connected account bears Stripe's processing fee and the platform `application_fee` arrives clean.
- Checkout supports both modes on the connected account: `payment_intent_data.application_fee_amount` + `subscription_data.application_fee_percent`. SDK docstring: application_fee_percent "must be made on behalf of another account, using the Stripe-Account header."
- Trade-offs (correct for a marketplace): seller = merchant of record + bears dispute/refund liability + settlement currency; the customer/price/subscription/invoices now live on the CONNECTED account → webhook must read `event.account`; buyer billing-portal runs on the connected account.

- [x] **P1 — margin** (cb41e77c): one-time + monthly + metered → DIRECT charges (`{ stripeAccount }`, drop transfer_data, keep 5%); recurring price+meter create on the connected account; buyer billing-portal + metered usage/meter-event run on the connected account. Pure webhook handler unchanged (reconciles by the same ids; Stripe delivers Connect events).
- [x] **P2 — fee ledger** (c3b81907): monthly persists `computeMarketplaceFeeCents(monthlyAmount)` first-cycle snapshot; metered stays 0 (documented per-usage accrual); `computeListingEarnings` unchanged + consistent (no double-count — it doesn't read this column).
- [x] **P3 — webhook race** (a616d42a): invoice events carry a CUSTOMER-id fallback + stamp the sub id; applier retries by customer on a sub-id miss; `updatePurchaseByCustomerId` added; idempotent.
- [x] **P4 — success state + 4-model verify** (70e884f7): `[slug]/page.tsx` reads `?purchased=true` → "You're subscribed/installed ✅" buy box; per_outcome test strengthened so all 4 models assert the direct-charge mechanism.

**Verify:** marketplace unit tests 429/429 pass · `tsc --noEmit` 0 · `check-use-server.sh src` clean · `pnpm build` exit 0 (all routes compiled).

**Margin mechanism (verified vs Stripe docs + stripe-node SDK):** DIRECT charges, not `on_behalf_of`. `on_behalf_of` on a destination charge does NOT shift Stripe's processing fee (platform balance still debited). A direct charge debits the fee from the connected (seller) account → SF's 5% application fee arrives clean.

**Trade-offs accepted (correct for a marketplace):** seller = merchant of record + bears dispute/refund liability + settlement currency. Customer/subscription/invoices live on the connected account.

**Re-smoke + Stripe reconfig Max needs:**
1. Point the `/api/v1/marketplace/stripe/webhook` Stripe endpoint at **Connect** events ("Listen to events on Connected accounts") — the events now carry `event.account`. The signature secret is unchanged (`STRIPE_MARKETPLACE_WEBHOOK_SECRET`).
2. Fresh $1/mo (or $1 one-time) smoke with `SF_MARKETPLACE_BILLING=true`: confirm on the **seller's** connected account the Stripe processing fee is debited from the SELLER and SF's 5% application fee lands clean on the platform (the prior smoke showed the platform eating the 34¢).
