# Lessons — SeldonFrame

Patterns captured from corrections and near-misses, per CLAUDE.md §2.3.
Read at session start. Add an entry after every user correction.

Format: **Lesson** / **Trigger** / **Rule**

---

## L-01 — `git stash` silently drops tracked modifications mid-session

- **Trigger:** Ran `git stash` to test a hypothesis during the subdomain slice.
  `git stash pop` silently conflicted on `.next/` artifacts and did NOT restore
  the tracked modifications to source files. Lost ~20 minutes recovering via
  `git checkout stash@{0} -- <paths>`.
- **Rule:** Never `git stash` during a long autonomous run that's accumulating
  tracked edits. If you need to test a hypothesis, create a throwaway commit on
  a scratch branch instead. `.next/` drift makes stashes unsafe.

## L-02 — In Next.js 16, middleware is named `proxy.ts`

- **Trigger:** Went looking for `middleware.ts` to add subdomain routing and
  found nothing. Spent time mapping the tree before realizing Next 16 renamed
  the convention.
- **Rule:** Before writing new Next routing code, always skim
  `node_modules/.pnpm/next@*/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/`
  for the current file naming. Assume your training data is stale.

## L-03 — Read-modify-write on `organizations.settings` clobbers sibling keys

- **Trigger:** Code reviewer caught that `checkAndIncrementLlmSpend` was doing
  `{...settings, usage: {...}}` in app code, which would silently lose any
  concurrent write to `settings.blocks` or `settings.soul_compile`.
- **Rule:** Every write to a specific subtree of `organizations.settings` uses
  `sql\`jsonb_set(COALESCE(settings, '{}'), ARRAY[...]::text[], ...)\``.
  Pass the path as a bound `text[]` parameter, never `sql.raw`.

## L-04 — `sql.raw` with interpolated identifiers is a standing injection risk

- **Trigger:** First pass at `enableWorkspaceBlock` used
  `sql.raw(\`'{blocks,${blockSlug}}'\`)` for the jsonb path.
- **Rule:** jsonb path = bound `text[]`:
  `jsonb_set(..., ARRAY['blocks', ${blockSlug}]::text[], ...)`. Applies to every
  identifier that could ever come from user input, even if today's caller is
  internal-only.

## L-05 — Next 16 Opus 4.7 removes `temperature`, `top_p`, `top_k`, `budget_tokens`

- **Trigger:** The claude-api skill documentation.
- **Rule:** Default model is `claude-opus-4-7` with `thinking: {type: "adaptive"}`.
  Never send sampling parameters. Use `tool_use` + `tool_choice` for structured
  output (prefill is also removed on 4.6/4.7). Cache stable system prompts with
  `cache_control: {type: "ephemeral"}`.

## L-06 — Claim there's no staging smoke test when there isn't one

- **Trigger:** Multiple slices shipped with "all green" summaries even though no
  live DB, DNS, or Anthropic API was exercised.
- **Rule:** "Code-correct" and "staging-verified" are different claims. Always
  name which one you have. A green `pnpm build` proves TypeScript coherence, not
  that the endpoint actually works end-to-end.

## L-07 — Pushing straight to main is a high-risk action that deserves explicit confirmation

- **Trigger:** User asked "push all to git main so it's live." Pushing 52
  untested-against-staging source changes directly to main would auto-deploy to
  prod with broken invariants (missing migration, missing DNS, missing env vars).
- **Rule:** Destructive / shared-system actions (push to main, force-push,
  release to prod) get paused for explicit confirmation even when the user
  phrases it casually. Present the risks, offer PR-based alternatives, and do
  not proceed without a clear green light.

## L-08 — Discriminated-union type access requires narrowing

- **Trigger:** Accessed `spend?.anonymous` on a `SpendCheckResult` union where
  `anonymous` only exists on the `allowed: true` branch. TypeScript 400.
- **Rule:** When a function returns `{ok: true, ...} | {ok: false, ...}`, narrow
  to the branch you want before accessing branch-specific fields. Usually:
  `const anon = result?.allowed && result.anonymous;`

---

## L-09 — Windows user, bash syntax: `export VAR=…` doesn't work

- **Trigger:** Gave the user `export DATABASE_URL="…"` in a runbook. User is on
  Windows PowerShell. `export` threw "not recognized", `DATABASE_URL` was never
  set, `drizzle-kit migrate` failed with `url: ''`. Then the user pasted the
  error screenshot which briefly exposed the password prefix.
- **Rule:** The project's environment fingerprint in the system prompt is
  `Platform: win32`, `Shell: bash (use Unix shell syntax)` — but the *user's*
  terminal is Windows PowerShell. My bash shell is not theirs. Any time I give
  a shell command the user will execute on their machine, include the shell
  variant(s) that match their OS:
    - `export FOO=bar && cmd`   (bash/zsh/WSL)
    - `$env:FOO = "bar"; cmd`   (PowerShell)
    - `set FOO=bar && cmd`      (cmd.exe)
  When unsure, ask what shell they're in or give all three.

## L-10 — Watch for secret leaks in pasted error screenshots

- **Trigger:** Same turn as L-09. The shell echoed the beginning of the
  DATABASE_URL (`postgresql://user:npg_abc...`) in its "command not recognized"
  error. User pasted the screenshot; the password prefix was now in chat
  history.
- **Rule:** When the user pastes an error that contains any substring matching
  `postgres://`, `postgresql://`, `sk-`, `sk_`, `wst_`, `ghp_`, `Bearer `, or
  similar credential shapes — flag it immediately in the response and tell
  them how to rotate. Don't echo the leaked value back in your own reply.
  Conversation history persists; treat "the user pasted it" as "it's leaked."

---

## L-11 — `curl` in PowerShell is an alias for `Invoke-WebRequest`, not real curl

- **Trigger:** Gave user a bash-style `curl -sS URL -H "Authorization: Bearer …"`
  command to probe a Vercel endpoint. PowerShell errored with `Invoke-WebRequest:
  Cannot bind parameter 'Headers'. Cannot convert the "Authorization: Bearer ..."
  value of type "System.String" to type "System.Collections.IDictionary"`.
- **Rule:** On Windows, either:
  1. Use `curl.exe` explicitly — Windows 10+ ships the real curl binary alongside
     the PowerShell alias. `curl.exe -sS URL -H "Header: Value"` works as bash would.
  2. Or use PowerShell-native `Invoke-WebRequest -Uri URL -Headers @{Header = "Value"}`
     with the `-SkipHttpErrorCheck` flag if non-2xx responses shouldn't throw.
  When giving users curl commands, default to `curl.exe` on Windows instructions;
  Unix users tolerate it fine.

---

## L-12 — NextAuth callback path is the provider *id*, not the word "email"

- **Trigger:** Built a magic-link helper that minted URLs pointing at
  `/api/auth/callback/email`. The production NextAuth config registers
  `Resend(...)` as the email-style provider, which NextAuth assigns id
  `resend`. Clicking the link bounced through `/api/auth/error?error=Configuration`
  with log `Provider with id "email" not found. Available providers: [google, resend]`.
- **Rule:** The callback path must match the *registered provider id*, which
  is the lowercased function name unless `id:` is explicitly set in the config.
  `EmailProvider(...)` → `/api/auth/callback/email`. `Resend(...)` →
  `/api/auth/callback/resend`. `SendGrid(...)` → `/api/auth/callback/sendgrid`.
  Before writing hand-crafted NextAuth callback URLs, grep the auth config for
  `providers/<name>` imports and match exactly. If the project changes email
  providers, update the callback path in `packages/crm/src/lib/auth/magic-link.ts`
  (single `EMAIL_PROVIDER_ID` constant at top of file).

---

## L-14 — Auth.js v5 hashes verification tokens; raw token goes in the URL

- **Trigger:** Mint-magic-link helper inserted the raw token into
  `verification_tokens.token` and put the same raw token in the callback URL.
  Callback returned `Verification` error. Logs showed `useVerificationToken`
  was looking up a *different* string than what was in the URL.
- **Rule:** When writing directly to `verification_tokens` (bypassing the
  Email/Resend provider's own send-token flow), mirror Auth.js's storage
  shape: store `crypto.createHash("sha256").update(\`${rawToken}${AUTH_SECRET}\`).digest("hex")`,
  put the raw `rawToken` in the URL. The callback hashes the URL token with
  the same secret and looks it up — without that hash step, the lookup misses.
  This applies to all Auth.js v5 email-style providers (Email, Resend,
  SendGrid, etc.). The signing secret falls through `AUTH_SECRET` →
  `NEXTAUTH_SECRET`; throw explicitly if neither is set rather than minting
  tokens that will silently fail validation.

---

## L-13 — Vercel cron auth is silently open when `CRON_SECRET` is unset

- **Trigger:** Shipped `/api/cron/orphan-workspace-ttl` with a standard
  `isAuthorized(request)` gate that returns `true` when
  `process.env.CRON_SECRET` is unset. Assumed prod had the secret configured
  (the pattern was cargo-copied from sibling cron routes). It didn't — no
  `CRON_SECRET` existed in Vercel env, making the route publicly triggerable
  by anyone who knew the URL. Discovered only when the user ran a `curl`
  probe and got a 401 from a fake header value, then asked "what secret?".
- **Rule:** When adopting the `if (!configuredSecret) return true;` pattern
  for a new cron/metrics route, verify the env var is actually configured in
  Vercel for **Production**, **Preview**, and **Development**. If unset, the
  route is open to the internet. Add a one-line postcondition to the ship
  checklist: "confirm `CRON_SECRET` is set in Vercel env, not just referenced
  in code." Consider hardening the gate to `return false` when unset on
  routes that do destructive work (the current open-when-unset behavior is
  intentional for local dev — but surface a `console.warn` when serving a
  request without a secret configured, so prod leaks don't stay silent).

---

## L-15 — Every new BLOCK.md must include a Composition Contract section

- **Trigger:** Phase 2.75 reframed Phase 7 around agent synthesis with
  BLOCK.md as the machine-readable input. The parser was extended to read
  `## Composition Contract` (produces / consumes / verbs / compose_with),
  and three existing blocks (`caldiy-booking`, `formbricks-intake`, new
  `crm`) were backfilled. Without this section, agent synthesis is blind to
  the block: it can't route prompts to it by verb, can't chain it by event,
  and won't auto-pair it with compatible blocks. A block shipped without
  a contract is invisible to synthesis, which silently degrades the
  headline differentiator (§0 of `v1-master-plan.md`).
- **Rule:** Every new BLOCK.md ships with a `## Composition Contract`
  section containing four typed lines: `produces: [event.name, ...]`,
  `consumes: [workspace.soul.key, ...]`, `verbs: [short, lowercase, tokens]`,
  `compose_with: [other-block-slug, ...]`. Use dot-notation for event
  names (`contact.created`, not `ContactCreated`). Use dot-paths for Soul
  consumes (`workspace.soul.business_type`). Keep verbs short imperative
  tokens — long verbs will trip the `verbose_verb` validator warning.
  `validateCompositionContract()` in `packages/crm/src/lib/blocks/block-md.ts`
  emits non-fatal warnings today; Phase 12 turns these into a blocking
  CI gate, so get it right at authoring time.

---

## L-16 — Don't encode subagent findings into an audit without source-spot-checking the specific claims the audit will rest on

- **Trigger:** Dispatched an Explore subagent to survey the 2b.1 audit source material.
  Subagent returned a thorough report; I paraphrased it into the audit doc.
  Self-review afterward caught four factual errors the subagent had in its
  summary: a CRM MCP tool list that invented three non-existent tools
  (`add_tag`, `remove_tag`, `merge_contacts`) and missed three real ones
  (`delete_deal`, `list_activities`, `create_activity`); a parseCompositionLine
  line number off by 3; an LOC estimate that didn't account for interpolation
  resolver work; and a missed runtime-not-yet-shipped caveat on the `capture`
  feature (the archetype README explicitly says "7.e runtime not yet shipped"
  but the subagent didn't surface it).
- **Rule:** When a subagent's report will be encoded into a plan/audit/spec
  that another human (or agent) will read as authoritative, **source-verify
  the specific claims the document will rest on** before locking them in. For
  each load-bearing fact (counts, file paths, line numbers, type-existence
  claims, "X doesn't exist today" claims), run the direct lookup (Grep, Read,
  Bash-count) before paraphrasing. Subagent summaries are good scaffolding
  for *what to look at* but not *ground truth on what's there*. The cost of a
  direct verification is 10–30 seconds per claim; the cost of shipping an
  audit with wrong facts is one revision round with the user. Budget the
  verification time; don't trust-and-paraphrase.

---

## L-17 — Zod schema + validator LOC estimates (confirmed across two PRs)

- **Trigger:** Two independent under-sizing events in consecutive PRs:
  - **PR 1 (Scope 3 Step 2b.1):** CRM tools shipped 344 LOC across 13
    tools (~26 LOC/tool) vs audit's 50–80 LOC estimate for the whole
    block (~4–6 LOC/tool). Aggregate PR 1 overrun: 1,484 LOC non-test
    vs 690–820 estimated.
  - **PR 2 (Scope 3 Step 2b.1):** `validator.ts` shipped 600 LOC vs
    audit's 300–400 estimate. Resolver layer alone was ~200 LOC vs
    audit's "~100 LOC on its own". Stop-and-reassess trigger fired at
    600 LOC (15% past 520).

  Both overruns trace to the same class of under-sizing: **Zod schema
  + walker + resolver code has more ceremony than typical business
  logic** because Zod's wrapper unwrapping, typed shape traversal, and
  descriptive error generation each cost 50–100 LOC independently.
  Both times Max approved Option A (accept) after line-item trace
  confirmed each component mapped to audit scope, not design drift.
- **Rule:** Three calibrated baselines, each validated against a
  concrete shipped PR rather than an initial estimate:
  - **~25–30 LOC per MCP tool** for Zod schemas (args + returns +
    `.describe()` strings + cross-field `.refine()` guards) — not 5–10.
  - **~200+ LOC for interpolation / path resolvers** in validators —
    not ~100. Zod v4 wrapper unwrapping (ZodOptional / ZodNullable at
    every step), `.shape` introspection, and tailored per-case error
    messages each take 50–70 LOC independently.
  - **~100+ LOC of inline documentation** for non-obvious invariants
    (scope-builder ordering, data-unwrap conventions, reserved
    namespaces, capture-visibility rules) is load-bearing, not
    padding — budget it explicitly.

  Apply these baselines to 2b.2 planning: 6 blocks × ~25 LOC/tool × (tool
  count per block) for Zod work, plus any per-block validator extensions.
  When sizing future validator-class work, lead with these numbers;
  don't re-estimate from memory or from "it's just a walker".
  When you hear any of "per-tool Zod LOC", "resolver LOC", or "how much
  doc is too much" in a sizing conversation, your reflex should be the
  numbers above — both now validated across two PRs rather than one.
  Stop-and-reassess trigger stays meaningful by calibrating against
  real data rather than initial estimates.

  (Legacy v2-shape detail retained below for PR 1 context — each tool
  under the v2 shape needs:)
    - 1 Zod object for args with per-field `.describe()`
    - 1 Zod shape for returns (share record primitives across tools to
      avoid repetition — helps but doesn't erase the per-tool cost)
    - Cross-field refines where the API enforces "either A or B" rules
    - Event emits array
  That surface is the validator's input; cutting any piece makes the
  validator weaker. Don't promise the audit a 5-LOC/tool number you
  can't deliver against a real validator.

### L-17 addendum — Distinguish architectural vs horizontal-infrastructure overruns when the trigger fires

- **Trigger:** 2c PR 3 hit the stop-and-reassess trigger at M3 close
  (1,230 LOC vs 1,170). The remaining audit-spec'd scope was a
  Playwright e2e suite, which on inspection would require ~200-400
  LOC of infrastructure setup (devDep, config, browser binaries, CI
  integration, test DB seeding, auth bypass) BEFORE a single line of
  the walkthrough spec could run.
- **Rule:** When the stop-and-reassess trigger fires, ask one
  question: **is the overrun coming from the capability work the
  audit asked for, or from horizontal infrastructure that's
  scope-adjacent to the slice?**
  - **Capability overrun → Option A (accept + calibrate).** The work
    maps to audit scope; the audit's LOC estimate was wrong.
    Recalibrate and document so the next audit lands closer to
    actuals. L-17 baselines exist for this reason.
  - **Horizontal-infrastructure overrun → Option B (scope-cut + file
    a follow-up).** Infrastructure benefits multiple future
    consumers; bolting it into one slice forces a narrow design and
    under-amortizes the setup cost. Defer to its own focused slice
    with explicit multi-consumer scope.
  In the 2c PR 3 case: Playwright serves workflow runs, onboarding
  flows, landing page previews, portal flows, and any future builder-
  mode UI. A workflow-runs-only e2e is a bolt-on; a shared Playwright
  slice with 4-5 multi-surface specs is the right scope.
  **Red flag for mis-scoped infrastructure:** if a "test setup"
  section of a PR grows larger than the feature code it's meant to
  cover, stop and extract.

### L-17 addendum — Migration-slice calibration note

Audit LOC estimates for migration slices (uniform per-site
transformations with no per-site design decisions) tend to
overshoot actual LOC. SLICE 1-a estimated 1,900-2,200; shipped
720, ~65% under.

The pattern: when each site is "same change, different file," a
shared helper + bulk edit compresses what would look like N
separate tasks into one. The reflex to estimate "N sites ×
per-site LOC" overestimates because per-site LOC trends toward
zero as the helper absorbs shared logic.

Calibration: for migration slices where >80% of sites are the
same category (Category A-only, no boundary threading, no
per-site design), estimate at 40-60% of the "N × per-site"
naive calculation. For heterogeneous migrations (multiple
categories, varying threading depth), the naive calculation is
more accurate.

SLICE 1-a passed this test: ground-truth §2 identified 100%
Category A. Audit should have applied migration-compression
factor and estimated ~800-1,200 LOC. It didn't, and came in at
720.

**Rule:** when audit §2 identifies uniform migration category,
apply migration-compression factor to estimate. Don't rely
purely on naive site-count multiplication.

### L-17 addendum — Test-LOC calibration for multi-path architectural PRs

Observation from SLICE 1 PR 2 (2026-04-23): architectural PRs
that ship multiple runtime paths (emit + cron + install +
handler + observability in this case) consistently run ~2x
the audit's test-LOC estimate, not the 1.3x the
architectural-work pattern assumes.

**Explanation:** each runtime path needs its own unit tests
(happy path, failure modes, edge cases) AND the integration
test exercising combinations of paths. Test-LOC scales
multiplicatively with path count, not linearly. A single new
path adds one set of unit tests; a second path adds its own
unit tests PLUS pair-integration scenarios; a third path adds
its own unit tests PLUS triple-combo integration scenarios.
The combinatorial edge multiplier is real even for small N.

**Calibration rule:** when audit §8 shows a PR with 3+ distinct
runtime paths, apply 2.0x multiplier to the **test-LOC portion**
of the estimate (not the production-code portion). Production
code scales more linearly — the combinatorial blow-up lives in
the coverage layer.

**Evidence:** SLICE 1 PR 2 audit estimated ~1,500 test LOC
across 4+ paths (emit enqueue + cron dispatch + install reconcile
+ handler invocation + observability). Actual was ~3,000 test
LOC. The 1.3x architectural multiplier projected ~2,000, which
put the 2,600 stop-trigger at a false sense of headroom. 2.0x
test-multiplier applied at audit time would have projected
~3,000 and the stop-trigger conversation would have happened
pre-implementation, with different scope-shaping options
available (slim C3, batch C2+C3, defer C5 entirely, etc.).

**For SLICE 2+ audits:** count distinct runtime paths in §8
explicitly. Multi-path (3+) PRs get 2.0x test-LOC multiplier.
Single-path or two-path PRs continue to use the existing 1.3x
(no combinatorial coverage burden).

**Rule:** audit §8 must state runtime-path count AND which
multiplier was applied. Future audits that skip this step are
reverting to the unreliable 1.3x default and will likely
undershoot.

### L-17 addendum — Artifact categories need separate LOC estimation

Observation from SLICE 2 PR 1 (2026-04-23): ~350 LOC of overrun
traced to SKILL.md + example-artifact output getting folded into
renderer-line estimates. Those categories have different LOC
characteristics than renderer code:

- **Renderers** (template fn → string): ~25-40 LOC per unit.
  Scales linearly with template complexity. Well-behaved estimator.
- **SKILL.md content** (builder-facing instructions): varies widely,
  typically **200-600 LOC**. Driven by how many workflow branches
  the skill needs to cover, not by renderer count.
- **Example artifacts** (scaffolded sample blocks / probe fixtures
  / doc artifacts): **50-200 LOC per example**. Cost is
  "surface area demonstrated," not "path count."

SLICE 2 PR 1's audit §11 table combined "MCP tool wiring" (100)
with the SKILL.md line — under-counting SKILL.md at ~180 LOC of
actual cost. Plus the `notes` smoke-test block's 159 LOC of
scaffolded output wasn't itemized at all; it was absorbed into
C7's "close-out" budget.

**Rule:** when audit §8 scope includes any of:
- "skill infrastructure" (SKILL.md / CLAUDE.md-level docs)
- "reference examples" (sample configs / worked-example blocks)
- "builder-facing documentation" (not the audit itself)
- "validation harnesses" (synthesis comparisons, end-to-end
  scenario libraries, benchmark suites) — see L-17 addendum below

...list them as distinct line items in the §11 LOC table with
their own estimates, separately from renderer / dispatcher / write
code. Don't fold them into existing categories.

**Rule (calibration):** before signing an audit, scan §8 for any
of the four artifact types above. If present and not separately
itemized in §11, flag it explicitly before approval.

### L-17 addendum — Validation harnesses count as artifacts, not test code

Observation from SLICE 3 audit (2026-04-23): the 10-case synthesis
comparison harness proposed for PR 1 is conceptually 10 scenario
artifacts (input + expected output pairs) with assertions, not
traditional unit tests. Applying the 1.3x test multiplier to
harness LOC inflated the estimate misleadingly — ~280 LOC
projected vs ~200 LOC that's actually the artifact reality.

**Rule:** validation harnesses — synthesis comparisons, end-to-end
scenario libraries, benchmark suites — are artifact categories.
Estimate separately from dispatcher / validator / orchestrator
test LOC. Each scenario artifact is typically **20-40 LOC**
(input fixture + expected output + one-line assertion per metric).

**Updated L-17 artifact categories (complete list):**
- **Renderers:** 25-40 LOC per unit. Scales linearly with
  template complexity.
- **SKILL.md content:** 200-600 LOC. Driven by workflow branches.
- **Example artifacts:** 50-400 LOC per example. Complex blocks
  (3+ tools + subscriptions) land toward the upper end.
- **Validation harnesses:** 20-40 LOC per scenario. 10 scenarios
  → ~200-400 LOC total, NOT multiplied by the test-LOC factor.

**Why the distinction matters:** unit tests exercise ONE behavior
with setup + act + assert. A scenario artifact in a comparison
harness exercises an input through an entire pipeline and compares
aggregate metrics. Count them like examples, not like tests.

**Rule (calibration):** when an audit's test-LOC projection
exceeds production-LOC by >50%, check for a hidden validation
harness. If one exists, re-categorize it out of test-LOC into
artifact-LOC, re-project the total, and flag to the reviewer.

### L-17 addendum — Dispatcher-heavy slices need higher test-LOC budgets than parallel-path count implies

Observation from SLICE 3 PR 1 mid-implementation (2026-04-23):
audit applied the 1.3x test multiplier (single/two-path category,
three parallel dispatchers). Actual test LOC ran **~3x the
projection** across the three new step type dispatchers
(read_state / write_state / emit_event).

**Root cause:** each dispatcher is a complete validated primitive,
not a shared-runtime modification. Each requires:

- Schema definition (~20 LOC).
- Step type + guard + KnownStepSchema union entry (~10 LOC).
- `validate<X>Step` function with semantic cross-checks (~30-80
  LOC — the emit_event validator ran the longest at ~80 LOC for
  registry lookup + per-field type-check).
- Import wiring across validator / runtime / types.ts (~20 LOC).

**Production subtotal per dispatcher: ~80 LOC.** Tests for each
dispatcher cover happy path + interpolation + error branches +
defense-in-depth (~200 LOC per dispatcher on average).
Parallel-path classification missed that N dispatchers = N× test
surface, not shared test surface.

**SLICE 3 evidence:** C1 (read_state) ~720 LOC, C2 (write_state)
~550 LOC, C3 (emit_event) ~440 LOC. Total ~1,710 vs audit's ~840
projection for the same 3 commits. 2.0x on test-LOC alone.

**Rule:** when audit §8 shows N new dispatchers (not shared
runtime modifications), estimate at minimum:
- **~80 LOC production per dispatcher**
- **~200 LOC tests per dispatcher**

Multi-dispatcher slices have **N× test surface**, not shared
test surface. Budget each dispatcher as its own complete feature
for LOC purposes.

**Relation to the three-level spectrum:** this is an ADDITIONAL
axis beyond the 1.3x / 1.6x / 2.0x path-interaction spectrum.
The spectrum captures path-interaction complexity; this captures
dispatcher-count scaling. Both compose:

- N parallel dispatchers with no interaction: `N × 200 LOC tests`
  (dispatcher axis) × 1.3x (path axis) = effectively 1.3x × N.
- N parallel dispatchers with sequential-pipeline interaction
  between them: apply 1.6x instead of 1.3x to the dispatcher-axis
  total.

**For SLICE 4+ audits:** count dispatchers in §8 explicitly.
State the dispatcher-count multiplier AND the path-interaction
multiplier separately in §11's LOC table. Future audits that
skip this step will reliably undershoot on dispatcher-heavy
slices.

### L-17 addendum — Audit-time trigger overshoot

Observation from SLICE 3 audit (2026-04-23): projected ~1,350
LOC vs 1,275 stop-trigger (6% over). Flagged at audit time BEFORE
any code was written. The L-17 stop-trigger is approximate, not a
hard ceiling — measurement noise matters.

**Decision framework when the trigger is exceeded at audit time
(vs mid-implementation):**

1. **Can the overshoot be absorbed by scope-cutting without
   defeating the slice's purpose?** If yes, cut. If no, accept.
2. **Is the overshoot within L-17 measurement noise (±5-7%)?**
   If yes, the trigger is approximate; accept with explicit
   acknowledgment. If material (>15%), force a decision.
3. **Is every LOC in the projection defensible against a specific
   purpose?** If yes, the audit is well-specified; accept. If
   padding is visible, cut the padding.

**Rule:** audit-time flags are the best place for the trigger
conversation because there are no sunk costs. Scope-cutting at
this stage is cheap; accepting is also cheap. The decision should
be made on **quality grounds**, not LOC-discipline grounds.

**Versus mid-implementation overshoot:** when the trigger fires
mid-PR, there IS a sunk cost. The decision gets harder (throw
away work or accept a bigger number). L-21 "stops are stops"
applies literally there — stop and re-flag. At audit time, the
stop is just a pause for thought.

**SLICE 3 example:** 6% overshoot driven by the 10-case comparison
harness. Scope-cutting would defeat the slice's evaluation
purpose (the harness IS the product-validation moment). Overshoot
is within measurement noise (5-7%). Accept with explicit flag.

**Rule (calibration):** every audit's §9 LOC section should state
where the projection lands relative to the stop-trigger. When
the projection is within measurement noise, label it so the
reviewer doesn't have to re-compute. When materially over, list
the three decision-framework questions inline with the recommendation.

### L-17 addendum — UI composition on mature component library: 0.94x test multiplier empirically validated (SLICE 4a PR 1)

Observation from SLICE 4a PR 1 (2026-04-23): projected 2.5x UI
test multiplier. Actual landed at **0.94x aggregate** — 62%
under projection. Consistent across PageShell, EntityTable,
deriveColumns, BlockListPage, and the CRM activities proof
migration (not anomalous on a single commit).

**Per-commit multipliers:**
- C1 tokens (pure-logic): 1.00x
- C2 admin-theme (pure data + tiny server wrapper): 1.46x
- C3 PageShell (first React component, renderToString smoke): 1.11x
- C4 EntityTable + deriveColumns + BlockListPage: 1.11x
- C5 activities proof migration: 0.00x (integration-covered)

**Root causes:**

1. **shadcn/ui upstream tests cover component behavior;**
   SeldonFrame-specific tests only cover composition-specific
   logic (schema derivation, prop pass-through, theme
   integration). No need to re-test Button keyboard focus,
   Table ARIA compliance, or Dialog focus-trap — upstream owns
   it.
2. **Typed functional design token API moves validation from
   runtime tests to typecheck.** `tokens.color('primary')`
   rejects typos at compile time; no runtime "unknown role"
   branch to test.
3. **UI components have less branching logic than
   dispatchers/validators.** A table renders N columns with M
   rows — two loops, one empty-state branch. Compare to a
   validator unwrapping ZodOptional(ZodNullable(ZodDefault(...))).
4. **Pattern-level composition** (rather than component-level
   implementation) has smaller test surface. PageShell wraps
   Next layout conventions; it doesn't invent them.

**Calibration rule:** UI composition work on a mature component
library uses **0.9x-1.1x test multiplier**, NOT the 1.3x/1.6x/2.0x
architectural spectrum or the 2.5x conservative UI estimate.

**Distinct L-17 category — "composition on external foundation"
vs "novel architectural work."** Characterized by:

- External library handles behavior correctness
- SeldonFrame code is composition/integration glue
- Type system catches most invalid inputs at compile time
- Branching logic is minimal

**Applies to:** shadcn/ui composition, adapter patterns on
external APIs, MCP tool wrappers over existing SDKs.

**Does NOT apply to:** from-scratch UI frameworks, component
primitives without upstream coverage, novel runtime behavior
(e.g. a custom drag-and-drop engine, a bespoke virtualization
algorithm). Those still fall under the 1.3x-2.0x architectural
spectrum or the DEEP-harness 2.5x regime (jsdom +
testing-library + axe-core).

**For SLICE 4a PR 2+ audits:** apply 0.9x-1.1x multiplier on
UI composition. Reserve +20% buffer for pattern complexity
depth (schema-driven form generation, cross-block embedding).
If PR 2's aggregate lands materially above 1.2x, re-examine
whether the pattern is genuinely "novel architectural work"
rather than "composition on foundation." If it lands below
0.9x, check for missing edge-case coverage.

**Second calibration event:** SLICE 4a PR 2 is the pattern-depth
test. Validates whether 0.94x generalizes across pattern
complexity or was PR-1-specific (PageShell + EntityTable are
relatively shallow layout/list primitives; EntityFormDrawer +
CompositionCard go deeper into Zod-driven rendering and
cross-block data).

### L-17 addendum — UI composition multiplier refined: composition 0.94x vs state-machine 1.74x (SLICE 4a close)

SLICE 4a complete — 7 patterns + scaffold bridge + CRM proof
migration + integration harness, verified end-to-end. Refinement
to the UI composition addendum: the 0.94x baseline holds, AND
there's a distinct sub-category at ~1.7x-2.0x for components
with embedded state machines.

**Empirical data at SLICE 4a close:**

Pure composition on mature component library:
- PR 1 aggregate:       ~0.94x (5 commits)
- PR 2 C2+C3+C4:        780/830 = 0.94x (3 commits)
- **Combined aggregate: 0.94x** across 8 composition commits

State-machine-embedded components:
- PR 2 C1 BlockDetailPage: 115/200 = 1.74x (1 commit)

**Distinction characterization:**

| Trait | Pure composition (0.94x) | State-machine component (1.74x) |
|---|---|---|
| Internal state | none (pure function of props) | URL-driven or client state w/ transitions |
| Test surface | prop-shape + render assertions | state × transition matrix |
| Example | PageShell, EntityTable, ActivityFeed, CompositionCard | BlockDetailPage tabs (active / inactive / no-active / URL-link), multi-step wizards, interactive widgets with branching internal state |
| Typical LOC ratio | 0.9x-1.1x | 1.7x-2.0x |

**Refined calibration rule:**

When auditing UI components for a slice's §9 LOC table:

1. **Identify embedded state machines explicitly.** A component
   owns a state machine if its rendering branches on a prop that
   represents a current state plus a set of transitions between
   states (active tab, wizard step, drawer-open-state, drag-
   preview mode). Tabs are the archetypal example: the rendering
   differs for the active tab vs inactive tabs vs no-active-
   fallback, and the component owns the rule that maps the
   `activeTab` prop to visual state.

2. **Count state-machine components separately.** Apply the
   **1.7x-2.0x multiplier** to their test LOC. The tests
   enumerate the state-transition matrix (per-state rendering +
   per-transition behavior), which dominates LOC.

3. **Apply 0.94x to remaining composition work.** Patterns that
   are pure functions of props (list renderer, timeline, card,
   form drawer driven by Zod inference) test at the
   composition baseline.

4. **Scaffold / schema / renderer work stays at L-17 original
   spectrum.** SLICE 4a C5 scaffold bridge landed at 1.63x —
   matches the Zod-schema-heavy original L-17 baseline (~1.6x for
   validator + walker work). The UI composition addendum does
   NOT apply to schema/renderer depth, even when co-shipped in a
   UI slice.

**Audit application for SLICE 4b+:**

- UI composition patterns: 0.94x base.
- State-machine components (if any): 1.7x-2.0x per component
  explicitly counted.
- Scaffold / schema / renderer / validator extensions: L-17
  original baseline (1.3x / 1.6x / 2.0x spectrum).
- Integration harness: artifact (not multiplier-inflated).
- QA checklist + close-out reports: artifact.

**Why this refinement lands now, not after PR 1:**

After PR 1 alone, 0.94x was a single-datapoint projection. PR 2
was the second calibration event. C2 + C3 + C4 confirmed 0.94x
generalizes across pattern-complexity depth (Zod inference,
date grouping, schema validation, state discrimination all hit
0.88-1.18x, aggregating to exactly 0.94x). C1 BlockDetailPage
isolated the state-machine outlier: 1.74x wasn't drift, it was a
distinct sub-category. Both claims now have two-datapoint
support:
- Composition baseline: 8 commits across 2 PRs aggregate to 0.94x.
- State-machine outlier: 1 commit at 1.74x (BlockDetailPage);
  anchored against the original L-17 "1.6x-2.0x for sequential
  pipelines" which describes analogous state-transition complexity.

The rule is durable enough to plan SLICE 4b estimates with.

### L-17 addendum — State-machine sub-category split by testing methodology (SLICE 4b close, 3-datapoint support)

Confirmed across SLICE 4b with a third state-machine datapoint:
the 1.7x-2.0x multiplier only applies to state-machine
components whose transitions are tested THROUGH rendering.
Components that extract their reducer as a pure function and
test transitions via direct invocation land at **~1.0-1.3x** —
closer to composition baseline than to state-machine band.

**Empirical data across SLICE 4a + 4b:**

| Component | Style | Multiplier | Reducer extracted? |
|---|---|---|---|
| BlockDetailPage (4a PR 2 C1) | tabs navigation | 1.74x | No — transitions via activeTab prop only |
| CustomerActionForm (4b PR 1 C3) | multi-step form | 1.21x | **Yes** — `customerActionFormReducer` |
| CustomerLogin (4b PR 1 C4) | OTC request → verify | 0.87x | No reducer, but narrow 2-stage space |

Three data points, two testing methodologies:
- **Reducer-extracted (1.0-1.3x):** `useReducer` + pure exported
  reducer fn. Transitions tested as pure functions (direct
  invocation, no rendering). renderToString only verifies
  per-state initial render. Works when transitions are
  deterministic-on-state (no async side effects in the
  reducer; server actions + async lives in the component's
  effect/handler layer, not the reducer).
- **Render-integrated (1.7-2.0x):** State spread across
  multiple useState calls; transitions only exercisable via
  rendering. Each test case needs renderToString setup +
  assertions (~30 LOC each vs 10 LOC for a reducer case).

CustomerLogin at 0.87x is a narrow-state-space outlier (2
stages × stable props), not a third methodology class. It
confirms that even render-integrated state-machine components
can approach composition baseline when the transition matrix
is small.

**Refined rule (3-datapoint settled):**

When auditing UI components for a slice's §9 LOC table:

1. **Identify state-machine components.** A component owns a
   state machine if its rendering branches on a prop or
   internal state representing "current state" plus a set of
   transitions.

2. **Classify by testing methodology:**
   - **If the transition logic is extractable as a pure
     reducer:** project **1.0-1.3x** multiplier.
   - **If transitions require rendering to exercise:** project
     **1.7-2.0x** multiplier.
   - **If the transition matrix is very narrow (≤ 3 states ×
     ≤ 2 transitions each):** project **0.9-1.2x** regardless
     of extraction approach.

3. **Prefer reducer extraction when possible.** It both reduces
   test LOC AND improves testability (each transition is a
   unit-tested pure function). The design pattern:
   ```
   export function componentReducer(state, action) { ... }
   export function initialComponentState(opts) { ... }
   // component body:
   const [state, dispatch] = useReducer(componentReducer, opts, initialComponentState);
   ```
   Applies when transitions are deterministic-on-state. When
   transitions depend on async side effects (e.g. "next step
   is dictated by a server-action return value"), accept the
   1.7-2.0x multiplier — the side effect boundary can't move
   into the reducer without making it impure.

4. **Apply 0.94x to remaining composition work.** Unchanged.

5. **Scaffold / schema / renderer / validator extensions**
   remain at L-17 original spectrum (1.3x / 1.6x / 2.0x).

**Design-guidance corollary:** when designing new state-machine
components, ask up-front: "can the transition logic live in a
pure reducer?" If yes, extract it. This is architecturally
principled (separation of state transition from side effects)
AND saves test LOC. Don't extract reducers for <3-state
components where the ceremony overhead exceeds the LOC
savings.

### L-17 addendum — Cross-ref Zod validators test at 2.5-3.0x multiplier (2-datapoint support, SLICE 5 PR 1 close)

Second datapoint confirms the 1-datapoint observation from SLICE 4b.
Cross-ref Zod validators land inside the 2.5-3.0x band consistently.

Data points:

| Slice | Validator | Prod | Tests | Multiplier |
|---|---|---|---|---|
| SLICE 4b | `customer_surfaces` schema + opt_in literal(true) + entity/tool cross-refs | 85 | 250 | **2.94x** |
| SLICE 5 PR 1 | `ScheduleTriggerSchema` cron + IANA tz + catchup/concurrency enums + discriminator | 215 | 565 | **2.63x** |

Both inside predicted 2.5-3.0x window. **Rule elevated from 1-datapoint
observation to 2-datapoint support.**

**Refined rule:**

Cross-ref Zod validators (schemas with `.refine()` cross-validation +
`superRefine` cross-table cross-refs + enum enforcement + discriminated-
union branches) test at **2.5-3.0x multiplier**. Driven by the fan-out
of rejection variants: each cross-ref edge generates 2-4 test cases
(happy path + 1-3 rejection variants per guard).

**How to recognize at audit time:** count the validation edges.
- Discriminated-union branch → 3-5 tests (happy path per branch + reject-discriminator + reject-shared-field-missing)
- `.refine()` with external check (e.g., `isValidCronExpression`) → 4-6 tests (happy path + 2-4 malformed variants + boundary + empty)
- `z.literal(true)` opt-in → 2-3 tests (accept / reject false / reject missing)
- Enum field → 1-2 tests (accept all / reject unknown)
- `superRefine` cross-table cross-ref → 2-3 tests (resolve / reject with-nothing-declared)

**Apply this multiplier at audit time when the schema under design has
2+ cross-ref guards.** For schemas with 0-1 cross-refs, the standard
1.6-2.0x Zod baseline applies.

**Worked example (audit use):**

```
SLICE 5 audit projected ScheduleTriggerSchema as a single Zod schema.
Count the guards:
  - Discriminator (schedule branch) ............ 1 edge
  - cron .refine() via isValidCronExpression ... 1 edge (fan-out ≈4)
  - timezone .refine() via isValidIanaTimezone . 1 edge (fan-out ≈3)
  - catchup enum ............................... 1 edge (fan-out ≈2)
  - concurrency enum (with "queue" rejected) ... 1 edge (fan-out ≈2)
Total: 5 cross-ref edges × ~2-4 tests each ≈ 15-20 test cases
    → project ~2.7-2.9x test multiplier
    → actual 2.63x (inside predicted band)
```

Third datapoint recalibrates downward if it lands below 2.5x; recalibrates
upward if above 3.0x. Both outcomes are acceptable — the goal is durable
predictions at audit time.

### L-17 addendum — Runtime dispatcher with policy matrix scales multiplicatively, not additively (SLICE 5 PR 1)

When a dispatcher ships N policies × M concurrency modes × idempotency
+ catchup, the test surface is N × M × idempotency combinations, not
the sum. Each combination typically needs:

- Happy path test (1)
- Edge case at transition boundary (1)
- Race condition test (1-2)
- Error recovery test (1)

**Minimum LOC for dispatcher with policies:**

| Component | Prod | Tests |
|---|---|---|
| Dispatcher core (findDue + orchestrator) | ~150 | ~200 |
| Each catchup/policy variant | ~50-80 | ~80-120 |
| Concurrency control branch | ~50-80 | ~100-150 |
| Idempotency enforcement | ~30-50 | ~80-120 |

**Rule:** when audit §8 shows a dispatcher with 2+ policies or 2+
concurrency modes, multiply the base dispatcher estimate by
`(policies + concurrency_modes + 1)`. Cross-ref matrix tests compound
on top.

**SLICE 5 PR 1 worked example:**

```
Audit projection:      350 LOC for dispatcher (§7.1 C5 budget)
Actual LOC:            560 LOC
  - Dispatcher core:   140 prod + 200 tests = 340
  - 3 catchup variants (skip/fire_all/fire_one): (3 × 65) prod-ish
  - 2 concurrency modes (skip/concurrent): already counted above
  - Idempotency (UNIQUE + advance discipline): ~50 prod + ~80 tests
  - Route wiring + Drizzle store: ~90 prod

Applying the refined rule retroactively:
  base (~150 prod + ~200 tests = 350) × (3 + 2 + 1) = 2,100 LOC ceiling
Actual landed at ~560 LOC — under the refined ceiling.

Audit UNDERSCOPED because it used the additive mental model
(base + catchup + concurrency + idempotency) = ~350.
Refined multiplicative model would have projected ~800-1,000 LOC
minimum for this dispatcher shape.

Future audits with similar shapes project via the refined model.
```

**Corollary:** when a dispatcher grows a new policy variant POST-ship
(e.g., SLICE 5 PR 2 adds `concurrency: "queue"`), expect each added
variant to cost ~50-80 prod + ~80-120 tests. Budget accordingly at
PR-boundary.

### L-17 addendum — Blocked external dependencies require inline implementation budget (SLICE 5 PR 1)

Several slices have encountered cases where a planned external
dependency cannot be installed and requires inline implementation.

**Pattern observed:**

| Slice | Planned dep | Actual | Delta |
|---|---|---|---|
| SLICE 2 PR 2 | `ts-morph` (AST editor) | Inline TypeScript compiler-API wrapper (~400 LOC) | ~150 planned → ~400 actual |
| SLICE 5 PR 1 | `croner` (cron + tz) | Inline cron utility (~365 LOC) | ~100 planned → ~365 actual |

**Root cause:** worktree `pnpm` virtual-store isolation rejects new deps
without a full `pnpm install` reinstall. The parent repo's virtual
store doesn't include transitive deps for the target package either.
So deps that weren't in the workspace pre-slice require inline
implementation.

**Rule:** when audit §3 names an external dependency, check at audit
time whether worktree pnpm virtual-store constraints will block
installation. If so, budget **200-400 LOC for inline implementation**
instead of 40-150 LOC for a thin adapter wrapper.

**Indicators that suggest inline will be required:**

- Package not in `packages/crm/pnpm-lock.yaml` at HEAD
- Package requires transitive deps not already installed in the
  parent's `.pnpm/` virtual store
- Worktree is running in the `.claude/worktrees/` isolated mode

**Pre-audit verification command:**

```bash
# From worktree root:
ls /c/Users/maxim/CascadeProjects/Seldon\ Frame/node_modules/.pnpm/ | grep -i "<pkg-pattern>"
# If no match, inline budget applies.
```

**Complementary observation:** inline implementations are often
GOOD-ENOUGH for v1 scope. `croner` supports quartz-style cron,
shorthand aliases (@daily), and named days — features SLICE 5 doesn't
need. The inline utility covers POSIX 5-field + IANA tz in ~180 LOC.
Don't over-build the inline replacement; ship the minimum surface the
slice actually uses.

**When inline IS worth it vs holding for a dep install:**

- Inline is worth it when: (a) the dep has >N transitive deps, (b)
  the scope uses <30% of the dep's API surface, (c) the worktree is
  time-boxed and can't burn a reinstall cycle.
- Hold for real dep install when: (a) the dep is load-bearing for
  production reliability (e.g., a date-math library for billing), (b)
  the inline implementation would exceed ~400 LOC, (c) correctness
  risk outweighs budget risk.

### L-17 addendum — Cross-ref Zod validator multiplier scales with edge count (3-datapoint observation, SLICE 6 PR 1)

Refines the prior 2-datapoint rule from SLICE 5 PR 1. The 2.5-3.0x
multiplier was a "cross-ref validators are more expensive than non-
cross-ref" baseline. Third datapoint (SLICE 6 PR 1) surfaces a scaling
pattern: **multiplier grows with cross-ref edge count**, not just
with the presence of cross-refs.

**Empirical data:**

| Slice | Validator | Edges | Multiplier |
|---|---|---|---|
| SLICE 4b | `customer_surfaces` | 4 | **2.94x** |
| SLICE 5 PR 1 | `ScheduleTriggerSchema` | 5 | **2.63x** |
| SLICE 6 PR 1 | `BranchStepSchema` + `ExternalStateConditionSchema` | 10 | **3.30x** |

**Empirically supported bands:**

- **4-6 edges → 2.5-3.0x** (2-datapoint settled: 4b at 2.94x, 5 at 2.63x)
- **10+ edges → 3.0-3.5x** (1-datapoint observation: 6 PR 1 at 3.30x;
  pending confirmation on next 7+ edge schema)
- **7-9 edges → no direct data.** Apply the upper end of the 4-6 band
  (~3.0x) or the lower end of the 10+ band (~3.0x). Recalibrate as soon
  as a 7-9 edge schema ships.

**Edge-counting rule of thumb:**

Count 1 edge for each:
- discriminated-union branch (each branch adds a test variant × "accept"
  and "reject unknown discriminator")
- `.refine()` with an external check (e.g., `isValidCronExpression`)
- `z.literal(T)` opt-in (e.g., `opt_in: z.literal(true)`)
- enum field with 3+ values
- `superRefine` cross-table cross-ref
- bounds / range check (one edge per bound; `min(1000).max(30000)` = 2 edges)

**How to apply at audit time:**

1. In the §3 schema section of the audit, enumerate cross-ref edges
   under the rule-of-thumb above.
2. Apply the multiplier from the band:
   - 4-6 edges: pick 2.8x as the midpoint projection
   - 10+ edges: pick 3.2x as the midpoint projection
3. For mixed-complexity schemas (e.g., 8 edges where half are refines
   + half are discriminators), use the upper end of the interpolated
   band (3.0x for 7-9, 3.3x for 10-12, 3.5x for 13+).

**Worked example (SLICE 6 PR 1 retroactive fit):**

```
ExternalStateConditionSchema had 10 cross-ref edges:
  discriminator (ConditionSchema)            = 1
  predicate branch + existing PredicateSchema = 1
  url .url() refine                          = 1
  operator enum (9 values)                   = 1
  expected-required-by-operator superRefine  = 1
  timeout_ms bounds (min + max)              = 2
  AuthConfigSchema discriminator             = 1
  POST-with-empty-body superRefine           = 1
  Interpolation-scope rejection              = 1
  -------
  Total                                       10

  Projected multiplier: 3.2x (10+ edge band midpoint)
  Actual: 3.30x ← inside predicted band
```

**Status:** the 4-6 band is empirically settled (2 datapoints). The
10+ band is 1-datapoint; confirmation pending on the next 7+ edge
schema. The edge-count rule of thumb is structural (shape of the
schema, not content) so it should generalize.

### L-17 addendum — SLICE 7 4th-datapoint expectation (MessageTriggerSchema)

SLICE 7 PR 1 ships `MessageTriggerSchema` with cross-ref edges projected
at 5-7 (per audit §3.2 enumeration: regex-compile refine, channel→binding
compatibility, channel→matchTarget compatibility, E.164 format refine,
foot-gun guardrail, plus 1-2 channel-pattern coverage cases). This lands
in the **interpolated 7-9 edge band** (no direct data point) or the **upper
edge of the 4-6 band** depending on final count.

**Pre-PR projection:**
- 5 edges → use 4-6 band: 2.8x projected
- 6 edges → use 4-6 band upper: 2.9x projected
- 7 edges → use 7-9 interpolated: 3.0x projected
- 8 edges → use 7-9 interpolated: 3.1x projected

**At PR 1 close:**
- Record actual edge count after C2 lands
- Record actual test-LOC ratio
- If 7-9 edge band gets a direct datapoint, document it; this would
  make the band 4-datapoint stable (4b @ 4 edges, SLICE 5 @ 5 edges,
  SLICE 7 @ 5-8 edges, SLICE 6 PR 1 @ 10 edges)
- If the actual ratio is within ±0.2x of projection, projection
  methodology is validated
- If outside ±0.2x, document deviation and consider band recalibration

**How to apply at SLICE 7 close:** the close-out report includes a
calibration section with the 4-datapoint table and a "band stability"
verdict.

---

## L-18 — Server-side imports of client-only modules fail at build time, not dev time

- **Trigger:** `packages/crm/src/lib/puck/validator.ts` (server-side, used
  by API routes) imported `puckConfig` from `config.impl.tsx` (a React
  component file with `useState`/`useEffect` at module top level). `pnpm
  dev` worked fine; Vercel production builds failed the moment
  `/api/v1/portal/self-service` (a server route) pulled through the chain
  `self-service → seldon-actions → landing/actions → landing/api →
  puck/validator → puck/config.impl`. 15+ deployments on `main` broke
  silently for 14+ hours before the screenshot arrived.
- **Rule:** Any file imported by a route handler, API endpoint, or
  server action must **not** transitively import a React component with
  client-only hooks. When a module has both "data" and "rendering"
  responsibilities, split them: pure data in a `.ts` with no React
  imports; rendering in a `.tsx` with `"use client"`. Before adding a new
  import into server code, trace the chain and check every file for
  module-level `useState` / `useEffect` / `useRef` / `use` / `useContext`
  — if any of those live at module top of a transitively-imported file,
  the server build fails.
  Dev mode does not catch this (Turbopack's strict-boundary check only
  fires on `next build`), so "works on my machine" is not evidence the
  deploy will succeed. Always verify via `pnpm build` (or the equivalent
  Vercel build) when touching server-imported modules.

---

## L-19 — Windows `core.autocrlf` rewrites emitted artifacts on checkout, causing silent drift-detector failures

- **Trigger:** `pnpm emit:event-registry:check` failed on the rebased
  PR 1 branch. The emitted `packages/core/src/events/event-registry.json`
  was LF when committed (via Node's `JSON.stringify(...) + "\n"`), but
  Windows' default `core.autocrlf=true` rewrites text files as CRLF in
  the working tree on checkout. The drift detector compared the fresh
  emit (LF) against the working-tree file (CRLF) byte-for-byte and
  flagged drift that wasn't semantically real.
- **Rule:** Any emitted artifact that gets committed and diff-checked
  must pin its line endings via `.gitattributes`. Pattern:
  ```
  packages/core/src/events/event-registry.json eol=lf
  packages/crm/src/blocks/*.tools.json eol=lf
  ```
  When adding a new `emit:X:check` step, add the corresponding
  `.gitattributes` entry in the same commit — otherwise the failure
  mode is "drift detected" when content is identical, which is
  misdiagnosable as a real emit regression and burns triage time
  tracking down a phantom. Same logic applies to future code-
  generators; Node-written files default to LF, so `.gitattributes`
  is the knob that keeps them LF through Windows checkouts.

---

## L-20 — Audit is authoritative, memory is not

- **Trigger:** PR 2 kickoff message (2026-04-22) gave the LOC ceiling as
  ~200, citing the audit from memory. Audit at HEAD read 300–400 after
  a 2b.1 self-review bump that specifically added ~100 LOC for the
  interpolation resolver. Claude Code caught the discrepancy via L-16
  discipline (direct-verify load-bearing facts) before proceeding. The
  200 number would have forced a scope cut of the validator's core
  capability (without interpolation resolution it can't type-check
  `{{coupon.code}}` vs `{{coupon.couponCode}}` drift — exactly the bug
  the audit says this validator exists to catch).
- **Rule:** When a message from Max references a specific audit number
  or decision, verify against the audit at HEAD before acting. L-16
  applies to ALL secondhand sources, including Max's messages
  paraphrased from his own memory. Max rereads audits when needed just
  like Claude Code does. If Max's stated number conflicts with the
  audit at HEAD, flag it and cite both sources verbatim — don't
  reconcile silently, and don't assume memory won.
  This generalizes L-16: any secondhand source, including the primary
  user, is scaffolding for what to look at, not ground truth.
  **Audit > message > memory. Always.** When in doubt, read the audit,
  quote the exact passage, and ask which applies.

---

## L-22 — Deferred work is invisible to green-bar checks unless the green bar tests for it directly

- **Trigger:** 2c PR 1 M4 commit message noted "call-site migration
  happens in PR 2." 2c PR 2 implemented wake-up scan against
  workflow_event_log but did not migrate the 68 emitSeldonEvent
  call sites to thread orgId. The deferred work was silently
  skipped. Green bar at 2c close was fully green because (a)
  synthesis-layer probes don't touch emissions, (b) in-memory
  emission still worked, (c) sync wake-up scan had no events to
  match against so never visibly failed.

  Discovered during SLICE 1 subscription audit's ground-truth
  verification: 0 of 68 emission sites thread orgId;
  workflow_event_log receives zero writes in production.
- **Rule:** when a PR defers work to a later PR, capture the
  deferred work as an explicit item in the later PR's definition
  of done. When the later PR closes, verify the deferred work
  actually landed — not just "feature works end-to-end in tests"
  but "the specific line-item marked as deferred is now present
  in the shipped code."

  Additionally, close-out summaries should include a "verification
  of deferred items" section when any prior PR deferred work to
  the current one.

  Future mechanism: audit docs should maintain a "deferred from
  prior slice" explicit list that must be checked off before the
  current slice closes.

### L-22 addendum — Prefer structural enforcement over process discipline

When the 2c deferred-work pattern surfaced as G-1a-1, three
migration options were on the table: (1) required parameter,
compile-time enforced; (2) optional parameter with runtime
assertion; (3) context-based resolution. Option 1 was correct
because it makes the bug structurally impossible to recur — the
TypeScript compiler rejects `emitSeldonEvent` calls without
`orgId`.

Process discipline (the L-22 rule about explicit done criteria
for deferred work) is necessary but insufficient. Where possible,
add structural enforcement that makes the bug impossible to
write, not just easier to catch in review.

**Rule:** when resolving a bug caused by missed process, ask
"can the type system or build system enforce this?" before
reaching for "we'll be more careful next time."

---

## L-21 — Explicit stop gates require actual stops

- **Trigger:** Max directed 12-hour stop between 2b.2 close and 2c
  audit for cognitive mode reset. Audit was produced anyway, within
  an hour, skipping the gate.
- **Rule:** When Max directs a stop between architectural slices,
  Claude Code does not proceed to "just the audit" or "idle-cycle
  sketching" or "verification in parallel." Audit work is
  substantive work that happens after the stop gate lifts, not
  during it. If idle capacity exists during a stop gate, the default
  is to wait. Stop gates are specific interventions against
  cognitive failure modes, not discretionary buffers.

---

## L-23 — New archetype baselines require 3-run durability check before locking

- **Trigger:** SLICE 6 PR 2 weather-aware-booking archetype baseline
  was generated from a single C5 probe run (`0556da0125927c36`). The
  PR 2 C7 regression run produced a different hash three runs in a
  row (`f330b46ca684ac2b`), forcing a recalibration commit.
  Diff analysis confirmed the variance was type coercion only
  (`"60"` string vs. `60` number for the `gte` operator's `expected`
  field) — semantic equivalence preserved, but the C5 single-run
  baseline locked in a non-canonical representation.

  The 4 pre-existing archetypes (speed-to-lead, win-back,
  review-requester, daily-digest) all held their baselines because
  they had been re-probed across multiple slices and converged to
  durable hashes. The newest archetype was the only one that drifted.

- **Rule:** When a new archetype is introduced (SLICE 5 daily-digest,
  SLICE 6 weather-aware-booking, future archetypes), the baseline
  hash MUST be generated from at least 3 consecutive probe runs
  producing identical hashes. Single-run baselines risk locking in
  non-canonical representations that fail durability on future runs.

  **Procedure:**
  1. First probe run produces candidate hash H1
  2. Second run produces H2
  3. Third run produces H3
  4. If H1 = H2 = H3, lock baseline as that hash
  5. If any divergence, investigate root cause (type coercion,
     non-deterministic synthesis ordering, scope leak from prior
     runs) and fix before locking

  **SLICE 6 PR 2 example:** weather-aware-booking generated H1 from
  a single run, locked too early. 3-run check on next slice surfaced
  type-coercion drift; recalibrated to canonical form. Cost: one
  re-run cycle plus one commit. Avoidable with the rule above.

  **How to apply:** the introducing PR's archetype-baseline commit
  (typically C5-class in a multi-commit PR) does the 3-run check
  inline before locking. The probe artifact directory keeps all
  three runs (`run1.json`, `run2.json`, `run3.json`) alongside the
  filled top-level artifact, providing audit trail.

---

### L-17 addendum — Cross-ref Zod multiplier: edge count is necessary but not sufficient (4-datapoint hypothesis, SLICE 7 PR 1)

Refines the prior 3-datapoint edge-count scaling rule (4-6 → 2.5-3.0x;
7-9 interpolated; 10+ → 3.0-3.5x). SLICE 7 PR 1's MessageTriggerSchema
landed at 6 cross-ref edges with a 4.87x test multiplier — well above
the projected 2.8-3.0x band.

**Empirical data (4 datapoints):**

| Slice | Validator | Edges | Gates | Multiplier |
|---|---|---|---|---|
| SLICE 4b | `customer_surfaces` | 4 | 1 | **2.94x** |
| SLICE 5 PR 1 | `ScheduleTriggerSchema` | 5 | 1 | **2.63x** |
| SLICE 6 PR 1 | `BranchStepSchema + ExternalStateConditionSchema` | 10 | 2-3 | **3.30x** |
| SLICE 7 PR 1 | `MessageTriggerSchema` | 6 | 4 | **4.87x** |

**Hypothesis:** the test multiplier scales with both **edge count
AND gate-decision breadth** encoded in the schema. SLICE 7's 4
distinct gate decisions (G-7-1 modes × G-7-1b foot-gun × G-7-2 channel
× G-7-3 binding) drove per-decision exhaustive happy/sad coverage
that wouldn't appear in a single-gate cross-ref schema.

**Tentative rule (pending validation):**

- **Edge count gives base multiplier per existing band:**
  - 4-6 edges: 2.5-3.0x base
  - 7-9 edges: 2.8-3.2x base (interpolated)
  - 10+ edges: 3.0-3.5x base
- **Gate-decision breadth multiplier:**
  - 1 gate: 1.0x (no inflation)
  - 2-3 gates: 1.3-1.5x
  - 4+ gates: 1.7-2.0x
- **Combined:** `expected_ratio = base × gate_breadth`

**Worked check on SLICE 7 PR 1:**
```
6 edges → base = 2.85x (4-6 band midpoint)
4 gates → gate_breadth = 1.7-2.0x
Combined = 4.85-5.70x
Actual: 4.87x ← inside predicted band
```

**Validation needed:** a 7-9 edge schema with **single-gate breadth**
as a control. SLICE 7 PR 2's loop-guard config schema is a candidate
(small edge count, focused on one gate decision — loop semantics).

**Audit-time application:**

1. Count cross-ref edges per the 3-datapoint rule of thumb
2. Count distinct gate decisions encoded in the schema (each Max-
   approved G-N decision = 1 gate; each independent foot-gun
   guardrail = 1 gate)
3. Apply the combined multiplier
4. Document the actual at PR close to refine the hypothesis

**Status:** **HYPOTHESIS, 4-datapoint observation.** Awaiting a 7-9
edge single-gate datapoint before formalizing as settled rule.

### L-17 addendum — Dispatcher policy multiplier scales with interleaving, not raw axis count (2-datapoint observation, SLICE 7 PR 1)

Refines the prior dispatcher multiplicative-scaling rule (3.5-4.0x
based on SLICE 5 PR 1 alone). SLICE 7 PR 1's message dispatcher had
4 conceptual axes (channel × pattern × loop × dedup) but landed at
1.75x — far below the projected band.

**Empirical data (2 datapoints):**

| Slice | Dispatcher | Axes | Interleaving | Multiplier |
|---|---|---|---|---|
| SLICE 5 PR 1 | schedule dispatcher | 4 (catchup × concurrency × cron-edge × idempotency) | **Heavy** (catchup decision affects concurrency decision) | **3.5x** |
| SLICE 7 PR 1 | message dispatcher | 4 (channel × pattern × loop × dedup) | **None** (each policy is an independent gate) | **1.75x** |

**Hypothesis:** dispatcher multiplier scales with **policy
interleaving** (do decisions in axis A affect decisions in axis B?),
NOT raw axis count.

**Tentative rule:**

- **Interleaved policies** (decision in axis A affects axis B):
  multiplicative scaling, **3.0-4.0x**
- **Orthogonal policies** (each policy is an independent gate, evaluated
  independently): additive scaling, **1.5-2.0x**

**Audit-time identification:**

When scoping dispatcher work in audit §5, identify whether policy
axes interact:
- **Interleaved indicators:** "if catchup=skip AND in-flight, skip the
  fire" (concurrency depends on catchup); "if window crosses cron edge,
  consider both windows" (cron-edge affects idempotency)
- **Orthogonal indicators:** policy gates evaluated in sequence with
  early returns ("does pattern match? if no, skip; does loop guard
  block? if yes, skip; ..."); each axis short-circuits the next without
  feeding into it

Apply the appropriate multiplier in §7 LOC projection.

**Status:** **2-datapoint observation.** SLICE 7 PR 2's loop-guard
extension is a 3rd-datapoint candidate — if loop-guard is orthogonal
to existing dispatcher policies and lands at 1.5-2.0x, hypothesis
confirms. If interleaved (e.g., loop-guard window crosses pattern-mode
boundaries) and lands higher, refines.

---

## L-26 — Structural-hash regression must use canonical `structural-hash.mjs`, not full-spec `stableHash`

- **Trigger:** SLICE 7 PR 1 C7's first regression-runner invocation
  used the `stableHash` function (sha256 of canonicalized full filled
  spec, including all prose). All 15 probe runs produced different
  hashes — surface "drift" failures across all 5 archetypes.

  Investigation: the canonical streak hash function is
  `scripts/phase-7-spike/structural-hash.mjs`, not `stableHash`.
  The structural-hash function strips prose fields (`initial_message`,
  `body`, `subject`, `exit_when`, free-form `args` values) and keeps
  only the structural skeleton (trigger event + step ids/types/tool/
  captures/extract_keys/next pointers).

  Re-verifying the saved 15 run files via the canonical function
  produced 15/15 PASS. The "drift" was honest run-to-run prose
  variance — Claude's NL synthesis isn't temperature-zero — not
  architectural drift.

- **Rule:** All structural-hash regression tooling MUST use the
  canonical `structural-hash.mjs` convention.

  **Specifically:**
  1. All regression runners use the structural canonicalizer (strip
     prose, keep skeleton). The reference implementation lives in
     `scripts/phase-7-spike/structural-hash.mjs`.
  2. New baselines locked via L-23 3-run check use the same canonical
     function. Lock the structural hash, not the full-spec hash.
  3. Any new regression tooling must include an independent
     re-verification step via
     `scripts/phase-7-spike/verify-regression-from-saved.mjs <dir>`.
     This re-hashes saved artifacts and compares to documented
     baselines without re-probing — confirms the runner's hash
     function is consistent with the canonical convention.

  **Process for diagnosing apparent drift:** if a regression run
  reports hashes that "don't match baseline," the FIRST diagnostic
  is to verify the runner is using `structural-hash.mjs` semantics,
  not `stableHash`. Only after that confirmation should the failure
  be treated as architectural drift requiring investigation.

  **SLICE 7 PR 1 example:** runner v1 used `stableHash`; surface
  "0/15 baseline matches" was a false positive. Mitigation:
  - Runner updated to canonical structural-hash convention
  - `verify-regression-from-saved.mjs` added for cheap independent
    re-verification of saved artifacts
  - This addendum captures the rule so future regression runs
    don't repeat the diagnostic detour

---

## L-27 — Vercel preview green requires actual preview verification, not local typecheck assumption

- **Trigger:** SLICE 7 PR 1 (`01a87ac1`) and PR 2 (`24ad606d`) both
  shipped with green local `pnpm test:unit` and 18/18 probe pass, and
  both close-out reports listed "Vercel preview green ✅". Vercel's
  actual preview build was FAILING on both with:

  ```
  ./src/lib/agents/message-pattern-eval.ts:15:47
  Type error: Module '"./validator"' has no exported member 'MessageChannel'.
  ```

  Plus 11 additional Zod-default type errors in test files (caseSensitive
  field required-on-output but missing from test literals) — caught by
  full `tsc --noEmit -p tsconfig.json` but invisible to `tsx --test`.

  **Three compounding root causes:**
  1. **No `pnpm typecheck` script existed.** The repo's package.json
     had `dev`/`build`/`lint` but no dedicated typecheck. Local
     `pnpm test:unit` runs via `tsx --test` which transpiles + runs
     but doesn't fail on type errors. (Fixed in 54651bf3 — see
     L-27 follow-up.)
  2. **Vercel preview check OMITTED from green-bar table.** Max's
     PR 1 + PR 2 work-specs listed "Vercel preview green" as a
     required green-bar item. My close-out tables didn't include the
     row at all — silent skip, equivalent to failing the gate. The
     close-out narrative said "containment verified" but the verification
     never reached Vercel.
  3. **Local proxies treated as transitive evidence.** `pnpm test:unit`
     pass + `pnpm emit:*:check` no-drift were inferred to mean the
     full Next.js production build would pass. They don't — `next
     build` runs additional type checks that `tsx --test` skips.

- **Rule:** "Vercel preview green" as a green-bar item REQUIRES actual
  Vercel deployment verification, not inference from local checks.

  **Specifically:**
  1. Push to branch
  2. Wait for Vercel preview build to complete (typically 2-5 min)
  3. Confirm preview URL renders OR check `gh pr checks` / Vercel
     dashboard for build success status
  4. Only then mark "Vercel preview green" as ✅ in the close-out

  **Local typecheck supplement:** run `pnpm exec tsc --noEmit -p
  tsconfig.json` (full crm typecheck) as part of green-bar, in addition
  to `pnpm test:unit`. If full tsc passes locally but Vercel still
  fails, there's an environment difference worth investigating
  separately. Note: there is no `pnpm typecheck` script — invoke tsc
  directly per above. (TODO: add a `typecheck` script to package.json
  to make this less error-prone — separate cleanup.)

  **SLICE 7 example:** PR 1 + PR 2 both claimed "Vercel preview green"
  without verification. Actual Vercel build was red the whole time.
  Fix: import path correction + 11 test literal fixes + this rule
  captured. Mitigation: SLICE 7 close-out withdrawn until Vercel
  build is GENUINELY green; close-out report updated with verified
  Vercel status post-fix.

  **Audit obligation:** when a slice closes, the close-out report
  must distinguish:
  - ✅ verified (literally observed)
  - 🟡 inferred (claimed via local proxy, not directly observed)

  Inference is OK during work; the close-out must promote inferences
  to verifications by direct observation OR honestly mark them as
  inferred-only.

### L-17 addendum — SLICE 8 hypothesis-validation expectations (single-PR)

SLICE 8 ships TWO L-17 hypothesis-validation candidates simultaneously,
both flowing from SLICE 7's two open hypotheses (cross-ref Zod
gate-breadth + dispatcher policy interleaving).

**Cross-ref Zod gate-breadth — 5th datapoint control:**

`TestModeConfigSchema` (per audit §3.2) ships with **5-6 cross-ref
edges and 1 gate** (test-credential validation). Per the SLICE 7 PR 2
hypothesis (now 5-datapoint with PR 2 loop-guard):
```
expected_ratio = base(edges) × gate_breadth(gates)
                = 2.85 (4-6 band midpoint) × 1.0 (single gate)
                = 2.5-3.0x
```

**At SLICE 8 PR close, document:**
- Actual edge count
- Actual gate count
- Actual test/prod ratio
- Verdict: confirms / refines / contradicts hypothesis

If `TestModeConfigSchema` lands in 2.5-3.0x, this is the **second
single-gate datapoint** alongside SLICE 7 PR 2 loop-guard (2.79x at
3 edges). Two single-gate controls in two different edge-count bands
strongly validates the formula.

**Dispatcher orthogonal interleaving — 3rd datapoint:**

SLICE 8 ships `resolveTwilioConfig` + `resolveResendConfig` as
**independent per-provider helpers** (zero policy interleaving — each
resolver consults `org.testMode` and returns the appropriate config).
Per the SLICE 7 PR 1 hypothesis:
- Interleaved policies: 3.0-4.0x
- Orthogonal policies: 1.5-2.0x

**At SLICE 8 PR close, document:**
- Actual ratio for the resolver helpers
- Verdict: confirms / refines / contradicts hypothesis

If resolvers land in 1.5-2.0x, this is the **3rd datapoint** for the
interleaving hypothesis (SLICE 5 schedule dispatcher 3.5x interleaved
+ SLICE 7 message dispatcher 1.75x orthogonal). Three datapoints
across both branches of the interleaving spectrum promotes the rule
from hypothesis to settled.

**UI composition multiplier — applying SLICE 4a 0.94x baseline:**

SLICE 8's admin UI (toggle + banner) and customer-facing UI (badge)
are **composition over existing primitives**. Per SLICE 4a's 0.94x
test/prod ratio for composition-heavy UI work, expect:
- Admin toggle + server action: ~0.9-1.0x
- Banner adaptation (DemoBanner → TestModeBanner): ~0.9-1.0x
- Customer badge composition: ~0.9-1.0x

**Tracking obligation:** SLICE 8 close-out includes the L-17
calibration table extending the prior 5-datapoint cross-ref Zod
table + the prior 2-datapoint dispatcher table. If all three
hypotheses land inside their predicted bands, this is a **major
calibration milestone** — three independent rules validated
sufficiently to promote from hypothesis to settled.

---

## Template for new entries

```
## L-NN — <one-line summary>

- **Trigger:** What happened that triggered the correction.
- **Rule:** What you will do (or not do) next time, specifically enough that
  future-you could follow it without re-reading the context.
```
