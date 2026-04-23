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

## Template for new entries

```
## L-NN — <one-line summary>

- **Trigger:** What happened that triggered the correction.
- **Rule:** What you will do (or not do) next time, specifically enough that
  future-you could follow it without re-reading the context.
```
