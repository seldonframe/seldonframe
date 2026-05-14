# Lean URL workspace flow — design spec

**Date:** 2026-05-14
**Author:** Maxime Houle + Claude (reflection after live haltexplumbing.com test)
**Status:** Approved design, awaiting implementation plan
**Predecessor:** [`2026-05-13-faq-from-url-chatbot-design.md`](2026-05-13-faq-from-url-chatbot-design.md) (shipped as `@seldonframe/mcp@1.46.0` + routing fix in v1.46.1)

---

## Summary

The 2026-05-13 spec shipped `create_workspace_from_url({ url })` and got the tool routing correct in v1.46.1. But a real-world test against `haltexplumbing.com` exposed a deeper architectural mismatch:

- **Total time:** 7 minutes (6m 49s "bake" + 17s "brew" + 2-3 min block persistence retries)
- **Chatbot built:** NO (operator's existing site never gets the AI receptionist)
- **Landing page generated:** YES (but the client already has `haltexplumbing.com` — they don't need our generated one)
- **Facts hallucinated:** YES (`Licensed (RMP 45127)`, `4.9★ from 162+ neighbors` — neither verified against the source)

The bottleneck is the **default-on landing-page block-generation pipeline** that wasn't needed in 90%+ of URL-input cases (agency client already has a site). This spec separates the four products SeldonFrame ships and makes landing-page generation an **opt-in follow-up**, not the critical-path cost.

**Target outcome:**
- URL input → CRM + booking + intake + AI chatbot + embed snippet, in **under 30 seconds**, **no landing page generated**
- Operator can later say "generate a landing page for this workspace" → separate tool, runs at its own pace
- Hallucinated facts (license numbers, review counts) blocked at the source

## Goals

- Cut URL-flow latency from 7 minutes (current) to **under 30 seconds** without compromising chatbot or workspace quality
- Make the chatbot embed snippet the **headline deliverable** of the URL flow — not buried in the response JSON
- Eliminate generated landing pages from the default URL path (agency clients have their own websites)
- Run the eval gate's 11 scenarios in parallel — drop p95 eval time from ~30s to ~3s
- Block hallucinated specific-fact extraction (license numbers, review counts, certification IDs) at the soul-compiler level
- Promote `generate_landing_page` to a top-level MCP tool for the minority case where the client wants a new landing page

## Non-goals (out of scope for this spec)

- Voice receptionist / SMS-followup archetype builds
- A web UI for managing the chatbot embed snippet
- A "white-label preview" before publish (Smithery deferred separately)
- Performance optimization for landing-page generation itself (still slow when explicitly invoked; outside this scope)
- Customer-facing booking self-service portal (separate spec)
- Multi-workspace agency dashboard (separate spec)

---

## Design decisions

Five decisions, locked from the post-test reflection:

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | Default landing-page generation in URL flow | **OFF.** URL flow skips landing-page block generation entirely. | The agency's client already has a website. Adding a SeldonFrame-generated one isn't on the critical path; it's a distraction. |
| 2 | Where landing-page generation lives | **New top-level MCP tool `generate_landing_page({ workspace_id })`.** Existing landing-page generation code stays unchanged; just exposed as a separate tool. | Promotes the optional capability from buried-in-orchestrator to operator-visible. Operators who want one ask for one. |
| 3 | Chatbot embed snippet visibility | **First-class field in response + first item in `next_steps`.** Surfaced as `chatbot_embed_snippet: "<script src=\"...\"></script>"` plus a "Paste this onto your client's website" hint. | The embed snippet IS the deliverable. Burying `embed_url` in nested JSON was a UX failure. |
| 4 | Eval-gate parallelism | **Run all 11 scenarios via `Promise.all` instead of sequential `for...of`.** | 11×~3s = 33s sequential → ~3s parallel (rate-limit fits in one batch). Pure latency win; zero behavioral change. |
| 5 | Hallucinated-fact defense | **Two layers: (1) extraction prompt forbids specific-fact fabrication; (2) post-extraction validator strips number-shaped substrings that don't appear in source markdown.** | Real test produced `RMP 45127` and `162+ neighbors` — fabricated. These are brand-risk for the agency. The validator is the safety net. |

---

## Architecture overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Claude Code (operator)                                             │
│  > create a workspace for https://www.haltexplumbing.com/           │
│  (routed to create_workspace_from_url via v1.46.1 description fix)  │
└──────────────────────────────────┬──────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────┐
│  MCP tool wrapper (already exists, MODIFIED)                        │
│  skills/mcp-server/src/tools.js                                     │
│  • POST /workspace/create with                                      │
│    { url, include_chatbot: true,                                    │
│      auto_extract_faq: true,                                        │
│      include_landing_page: false }   ← NEW, defaults to false       │
└──────────────────────────────────┬──────────────────────────────────┘
                                   ↓ HTTP POST
┌─────────────────────────────────────────────────────────────────────┐
│  Backend orchestrator (MODIFIED)                                    │
│  packages/crm/src/app/api/v1/workspace/create/route.ts              │
│                                                                     │
│  P1: Validate URL (~50ms)                                           │
│  P2: Soul-compile (LIGHT mode when include_landing_page=false):     │
│      - Extract: business_name, phone, services[], description       │
│      - Skip: hero block generation, intake field generation,        │
│              landing-page personality system                        │
│      - Extract: FAQs (existing pipeline)                            │
│      ~5-10s, one or two Claude calls                                │
│  P3: Workspace + CRM + booking + intake atomic insert (~500ms)      │
│      - Uses vertical-default templates (no LLM block generation)    │
│      - Booking hours from soul or sensible defaults                 │
│      - Intake fields from vertical template (no per-niche generate) │
│  P4: Chatbot build (parallel with eval gate):                       │
│      - createAgent with extracted+synthesized FAQ + provenance      │
│      - publishAgent('live') — eval gate runs INTERNAL parallel pass │
│      - setPublicChatbotEmbed if eval passes                         │
│      ~5-10s with parallel eval                                      │
│  P5: Response with chatbot_embed_snippet front-and-center           │
│                                                                     │
│  Total p50: 15-25s. p95: <40s. Down from 7 min.                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Key invariants:**

1. The four products (CRM, booking, intake, chatbot) get built; the landing page does NOT, unless explicitly requested.
2. `create_full_workspace` and `create_workspace_v2` continue to default `include_landing_page: true` — backward compatibility for callers that DO want the full v2 flow.
3. `create_workspace_from_url` defaults `include_landing_page: false` — the new lean path.
4. The MCP tool list grows by ONE: `generate_landing_page({ workspace_id })`. Existing landing-page-generation code is unchanged; we just expose a callable surface to it.
5. Soul-compiler gets stricter about specific facts. No new types. One prompt addition + one post-extraction validator.
6. Eval-runner switches from sequential to parallel via Promise.all. No new types. Identical contract.

---

## Schema changes

**None.** All changes are behavioral, not data-shape.

The `include_landing_page` flag is an additive boolean on the request body and a new optional parameter on internal functions — no DB schema changes, no JSONB shape changes, no Zod schema additions.

---

## New components

### 1. `generate_landing_page` MCP tool (new top-level surface)

**File:** `skills/mcp-server/src/tools.js`

```javascript
{
  name: "generate_landing_page",
  description:
    "Generate a SeldonFrame landing page for an existing workspace. " +
    "USE-WHEN: operator explicitly asks for a landing page after the workspace exists, " +
    "OR the client has no website of their own and the agency wants SeldonFrame to host the public-facing site. " +
    "If the client already has a website (most agency cases), the chatbot embed snippet from create_workspace_from_url " +
    "is the canonical deliverable; you do NOT need a generated landing page. " +
    "This call runs the v2 block-enhancement pipeline (13 sections, niche-aware copy, opus-grade). Takes ~30-60s. " +
    "Returns the public landing URL + per-block customization handles for follow-up edits.",
  inputSchema: obj(
    {
      workspace_id: str("Workspace UUID (from create_workspace_from_url or other creation tool)."),
      style: { type: "string", enum: ["bold-urgency", "editorial-warm", "clinical-trust", "cinematic-aspirational"], description: "Optional override of the auto-detected archetype." },
    },
    ["workspace_id"]
  ),
  handler: async (args) =>
    api("POST", "/workspace/generate-landing-page", {
      body: { workspace_id: args.workspace_id, style: args.style ?? null },
      allow_anonymous: true,
    }),
}
```

### 2. `/api/v1/workspace/generate-landing-page` route (new endpoint)

**File:** `packages/crm/src/app/api/v1/workspace/generate-landing-page/route.ts`

Thin handler that:
- Loads the workspace by `workspace_id`
- Loads the soul (already persisted from the earlier workspace creation)
- Calls the existing landing-page block-enhancement code (extracted from current `createWorkspaceFromSoulAction`)
- Returns the public landing URL + block IDs

No new logic — purely an extraction + exposure of code that currently lives inline in `createWorkspaceFromSoulAction`.

---

## Modified components

### 1. `packages/crm/src/app/api/v1/workspace/create/route.ts` — accept `include_landing_page`

Body type extension:

```typescript
type WorkspaceCreateBody = {
  // ... existing fields ...
  include_chatbot?: unknown;
  auto_extract_faq?: unknown;
  include_landing_page?: unknown;   // NEW. defaults true for backward compat.
};
```

Parsing:

```typescript
const includeLandingPage = body.include_landing_page === false ? false : true;
```

Pass through to the orchestrator:

```typescript
const workspace = await createWorkspaceFromSoulAction(
  { soul, sourceText, pagesUsed, includeLandingPage },  // NEW field
  { userId }
);
```

Response: when `includeLandingPage === false`, the response includes `landing_page: null` (or omits the field) and the `next_steps` array opens with the chatbot embed snippet hint.

### 2. `packages/crm/src/lib/billing/orgs.ts` (or wherever `createWorkspaceFromSoulAction` lives) — branch on `includeLandingPage`

The current function:
1. Creates the workspace + CRM
2. Creates the booking page
3. Creates the intake form
4. Creates the landing page (default template)
5. Runs the v2 block-enhancement pipeline (LLM-generated 13 sections)

Modification:
- Make step 4 + step 5 conditional on `includeLandingPage === true`
- When `includeLandingPage === false`: skip 4 and 5; workspace has CRM + booking + intake only

The block-enhancement code (step 5 — the slowest part) is extracted into a separate function `enhanceLandingPageBlocks(workspaceId, soul)` that:
- The unchanged path (step 5 when `includeLandingPage === true`) calls inline
- The new `generate-landing-page` route calls explicitly

### 3. `packages/crm/src/lib/soul-compiler/service.ts` — light-mode soul compilation

When `includeLandingPage === false`, skip the parts of soul compilation that exist only to drive landing-page rendering:
- Skip `landing_page_sections` LLM call (or fallback to `[]`)
- Skip `intelligence_hooks` LLM call (or fallback to `[]`)
- Skip `custom_blocks` generation

Keep:
- `business_name`, `audience_type`, `base_framework`, `tagline`, `soul_description`
- `pipeline_stages` (4-7 stages for CRM)
- `intake_form_fields` (drives the intake form)
- `booking_config` (drives the booking page)
- `pricing_config` (drives the chatbot's pricing facts)
- `faqs` (drives the chatbot)

Implementation: a new `lightMode?: boolean` parameter on `compileSoulService` that controls which LLM calls fire. The full mode (default) is unchanged.

### 4. `packages/crm/src/lib/agents/eval-runner.ts` — parallel scenarios

Current shape (lines 80-90 in v1.46.1):

```typescript
const bundles = getScenariosForArchetype(agent.archetype);
const results: EvalResult[] = [];

for (const bundle of bundles) {
  try {
    // ... sequential execution of each scenario ...
    results.push(result);
  } catch (err) { ... }
}
```

New shape:

```typescript
const bundles = getScenariosForArchetype(agent.archetype);

const results = await Promise.all(
  bundles.map(async (bundle) => {
    try {
      // ... same logic, including the bp_scraped_injection_attempt
      //     blueprintOverride special case ...
      return await runOneScenario(bundle, agent, /* args */);
    } catch (err) {
      return { scenarioId: bundle.scenario.id, passed: false, error: String(err) };
    }
  })
);
```

Sort the results array by scenario order after `Promise.all` resolves (so the eval report stays in deterministic order).

**Rate-limit consideration:** Anthropic's API limits are 50 RPM for tier-1 users on Sonnet. 11 scenarios × ~1 LLM call each = 11 RPM peak. Well within limits. No throttling needed.

### 5. `packages/crm/src/lib/soul-compiler/anthropic.ts` — hallucination guardrails

Add to `soulCompilerSystemPrompt` (after the existing rules):

```
- SPECIFIC-FACT DISCIPLINE: Do NOT fabricate any of the following unless they
  appear VERBATIM in the source content:
  - License numbers (RMP, EPA, contractor IDs, professional license numbers)
  - Certification IDs or codes
  - Review counts ("162+ reviews", "4.9 stars from N customers")
  - Award names ("Best of Denton 2023", specific publication mentions)
  - Service-area lists with specific city names beyond what the source mentions
  - Phone numbers, addresses, business hours
  If a fact is not present in the source, OMIT it from the output rather than inventing
  a plausible-sounding placeholder.
```

### 6. Post-extraction fact validator

**File:** `packages/crm/src/lib/soul-compiler/fact-validator.ts` (new)

```typescript
/**
 * Strips number-shaped substrings from the soul that don't appear in
 * the source markdown. Catches hallucinated license numbers, review
 * counts, certification IDs.
 *
 * Conservative: only strips obviously-fabricated specific numbers.
 * Does NOT strip pricing values from the booking_config.services or
 * pricing_config.tiers (those are legitimate operator-side data).
 */
export function stripUnsourcedFacts(args: {
  soul: SoulV4;
  sourceMarkdown: string;
}): SoulV4 {
  // 1. Find all number-shaped substrings in soul.tagline and
  //    soul.soul_description
  // 2. For each, check if the same digit sequence appears in source markdown
  // 3. If not, REPLACE the entire phrase containing the unsourced number
  //    with a more conservative version (e.g., remove the parenthetical
  //    or the trust-strip claim).
  //
  // Examples that get stripped:
  //   "Licensed (RMP 45127), bonded, insured" → "Licensed, bonded, insured"
  //     (the source might say "Licensed" but not "RMP 45127")
  //   "4.9★ from 162+ neighbors" → "" (entirely fabricated trust signal)
  //
  // Examples that stay:
  //   "Phone (940) 999-7742" → stays if the source contains this phone
  //   "Pricing $150 for drain repair" → stays if the source mentions $150
  // ...
}
```

The validator runs AFTER soul compilation, BEFORE the soul is persisted.

### 7. Response shape — surface the chatbot embed prominently

In `/api/v1/workspace/create/route.ts`, when chatbot was built:

```typescript
return NextResponse.json({
  status: "ready",
  workspace: { /* unchanged */ },
  // NEW — the headline deliverable for URL flow
  chatbot_embed_snippet: agentInfo.embedUrl
    ? `<script src="${agentInfo.embedUrl}" async></script>`
    : null,
  chatbot_instructions: agentInfo.embedUrl
    ? "Paste the chatbot_embed_snippet above into your client's existing website (anywhere before </body>). The chatbot will appear bottom-right and start booking appointments / answering FAQs immediately."
    : null,
  agent: { /* unchanged */ },
  faq_summary: { /* unchanged */ },
  landing_page: includeLandingPage ? { url: subdomainUrl } : null,
  next_steps: [
    agentInfo.embedUrl
      ? "Paste chatbot_embed_snippet onto the client's existing website."
      : null,
    "Optional: generate a SeldonFrame-hosted landing page via generate_landing_page({ workspace_id }).",
    "Attach to a partner agency via register_partner_agency + attach_workspace_to_partner_agency.",
  ].filter(Boolean),
  // ... unchanged fields below
});
```

### 8. MCP tool description — update `create_workspace_from_url`

In `skills/mcp-server/src/tools.js`, update the description so it accurately reflects the new behavior (no landing page by default):

```
+ "BY DEFAULT: skips landing-page generation (the agency's client already has a website). "
+ "Builds CRM + booking + intake + AI chatbot + embed snippet only. "
+ "Returns chatbot_embed_snippet which the operator pastes onto the client's existing site. "
+ "If you ALSO need a SeldonFrame-hosted landing page (rare — only when the client has no site of their own), "
+ "call generate_landing_page({ workspace_id }) AFTER this returns."
```

---

## Data flow (new latency budget)

```
PHASE                                                     LATENCY
1. Validate URL (sync)                                     ~50ms
2. Soul-compile in LIGHT mode (single Claude call):
     - extracts business_name, phone, services, description
     - extracts FAQs (existing pipeline)                   ~5-10s
3. Atomic workspace + CRM + booking + intake insert:
     - parallel DB inserts                                 ~500ms
4. Chatbot build (parallel with eval gate):
     a. createAgent + blueprint composition                ~200ms
     b. Eval gate (11 scenarios, PARALLEL Promise.all)     ~3s
     c. publishAgent('live') + setPublicChatbotEmbed       ~200ms
5. Return                                                  ~50ms

Total p50:  ~9-14s
Total p95:  ~20s
```

Down from the current 7-minute experience. The 7-minute number included:
- Soul compile in full mode (~10s)
- Workspace + CRM + booking + intake insert (~500ms)
- Landing-page personality system (~5s)
- 13-section block enhancement via opus-4-7 (varies — was reported 7s for the LLM but 5+ minutes for the persist_block flow with retries)
- Unsplash queries (~5s, all failed)
- Icon allowlist retries (5-10s)
- Sequential eval gate (~30s)

The new flow eliminates everything except the parts you actually need.

---

## Error handling

### Soul-compile light-mode failures

Same as today: if Claude fails or the URL doesn't return enough content, the operator gets a `code: "scrape_failed"` 422. The light mode reduces the surface area for failure (fewer LLM calls), so the error rate should drop.

### Eval gate parallel failures

If one of the 11 scenarios throws (rate limit, network), `Promise.all` short-circuits with that error and the agent stays in `test` status. We should NOT short-circuit — we should let the other scenarios complete. Use `Promise.allSettled` instead, which always resolves with a `{status: 'fulfilled'|'rejected', value|reason}` per scenario. A rejected scenario counts as a failed scenario for the pass-rate calculation.

```typescript
const results = await Promise.allSettled(
  bundles.map((bundle) => runOneScenario(bundle, agent))
);
// Map fulfilled/rejected to EvalResult[] preserving order, then compute pass rate.
```

### Fact validator over-removes

If the fact validator strips a legitimate substring (false positive), the soul becomes slightly less rich but the workspace still creates successfully. Operators can manually re-add facts via `update_workspace` or by editing the chatbot blueprint via `update_website_chatbot`.

**Logging:** every strip operation logs the original substring + the replacement so we can tune the validator from real-world drift over time.

### Landing-page deferred generation

`generate_landing_page` can be called any time after workspace creation. If the workspace doesn't have a soul (rare — only if it was created via a path that skipped soul compile entirely), return 422 with a clear error.

---

## Testing strategy

### Unit tests (mocked Claude)

**`packages/crm/tests/unit/soul-compiler-light-mode.spec.ts` (new):**
- Light-mode returns minimal soul (no landing_page_sections, no intelligence_hooks)
- Light-mode still extracts business_name, services, faqs
- Full-mode (default) still extracts everything (backward compat)

**`packages/crm/tests/unit/fact-validator.spec.ts` (new):**
- Strips "RMP 45127" when not in source
- Strips "162+ neighbors" when not in source
- KEEPS phone number when source contains the same digits
- KEEPS service price $150 when source contains $150 in a pricing context
- Pure regex; no LLM call

**`packages/crm/tests/unit/eval-runner-parallel.spec.ts` (new):**
- All 11 scenarios run via Promise.allSettled
- Result order matches scenario declaration order
- One rejected scenario doesn't prevent others from completing
- Pass rate calculation treats rejected scenarios as failed

### Integration tests

**`packages/crm/tests/unit/workspace-create-from-url-lean.spec.ts` (new):**
- URL flow with `include_landing_page: false` (default) → response has `chatbot_embed_snippet` populated, `landing_page: null`
- URL flow with `include_landing_page: true` → response has both `chatbot_embed_snippet` AND `landing_page.url`
- `create_full_workspace` legacy flow → unchanged (landing page generates by default)

### Manual smoke tests

Append to `packages/crm/tests/integration/faq-from-url-smoke.md`:

```
## Test 5 (NEW): Lean URL flow with chatbot embed

curl -X POST "https://staging.app.seldonframe.com/api/v1/workspace/create" \
  -H "Content-Type: application/json" \
  -H "x-claude-api-key: $ANTHROPIC_API_KEY" \
  -d '{
    "url": "https://www.haltexplumbing.com",
    "include_chatbot": true,
    "auto_extract_faq": true,
    "include_landing_page": false
  }'

Expected (within ~30s, NOT 7 minutes):
- response.chatbot_embed_snippet: "<script src=\"https://...\" async></script>"
- response.landing_page: null
- response.agent.status: "live"
- response.faq_summary.total: 8
- Server logs show NO Unsplash queries, NO enhance_blocks events
```

```
## Test 6 (NEW): Hallucinated fact stripped

Use a test URL whose source content has NO license number or review count.
Verify the soul doesn't contain "RMP <number>" or "<number>+ neighbors"
in tagline/soul_description.
```

```
## Test 7 (NEW): Landing page generated on-demand

After Test 5 (workspace exists, no landing page):

curl -X POST "https://staging.app.seldonframe.com/api/v1/workspace/generate-landing-page" \
  -H "Content-Type: application/json" \
  -H "x-claude-api-key: $ANTHROPIC_API_KEY" \
  -d '{ "workspace_id": "<from Test 5>" }'

Expected:
- Workspace URL now serves a v2-block-rendered landing page
- Latency: ~30-60s (same as the old default; that's fine — opt-in path)
```

---

## Migration / rollout

Zero-downtime. All changes are additive:

1. Ship the new schema + behavior with `include_landing_page` defaulting to `true` in `create_full_workspace` and `create_workspace_v2` (backward compat).
2. Ship `create_workspace_from_url` with `include_landing_page` defaulting to `false`.
3. Ship the new `generate_landing_page` MCP tool + route.
4. Bump `@seldonframe/mcp` to `1.47.0` (minor — new tool + behavior change in the URL path).
5. Run the staging smoke tests.
6. Publish to npm.

Existing callers (anyone using `create_full_workspace` or `create_workspace_v2`) see no behavior change because their flow defaults to `include_landing_page: true`.

---

## Open questions deferred to implementation

- **Exact phrasing of the fact-validator strip rule** — the spec says "regex match digit sequences against source markdown." The implementer should choose a balance: aggressive enough to catch fabricated review counts, conservative enough to preserve legitimate operator-set pricing. Initial heuristic: strip if a 3+ digit number appears in tagline/soul_description but NOT in source markdown.
- **Should `generate_landing_page` accept an explicit `personality` override?** Currently the spec only allows a `style` enum. Could add `personality_override` for power users.
- **Light-mode soul should it skip `pipeline_stages`?** No — pipeline stages drive the CRM, which we keep. Skip only landing-page-driving fields.
- **What happens if soul-compile light mode returns a soul that fails Zod validation?** Same as full mode today — retry with VALIDATION_ERROR prefix, then hard-fail.

---

## Out of scope (separate specs)

- End-customer self-serve booking portal (deferred from 2026-05-13 spec)
- Agency multi-client dashboard
- Voice receptionist or SMS-followup archetype builds
- Smithery MCPB bundle (deferred from Phase 1 distribution)
- Workspace replay / restore from soul-only state
- Performance optimization of landing-page generation itself (the slow path stays slow, but is now opt-in)

---

## References

- Predecessor spec: `docs/superpowers/specs/2026-05-13-faq-from-url-chatbot-design.md`
- Real-world test results: 2026-05-14 haltexplumbing.com creation logs (in conversation transcript)
- Existing soul-compiler: `packages/crm/src/lib/soul-compiler/`
- Existing eval-runner: `packages/crm/src/lib/agents/eval-runner.ts`
- Existing workspace orchestrator: `packages/crm/src/app/api/v1/workspace/create/route.ts`
- Existing landing-page generation: `createWorkspaceFromSoulAction` in `packages/crm/src/lib/billing/orgs.ts`
- v1.46.1 routing fix: commit `ba123649`
