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

## L-17 — Zod schema LOC estimates for non-trivial tools need a ~25 LOC/tool baseline, not 5-10

- **Trigger:** PR 1 of Scope 3 Step 2b.1 shipped contract v2 CRM tools
  at 344 LOC across 13 tools (~26 LOC/tool) vs the audit's 50-80 LOC
  estimate for the whole block (~4-6 LOC/tool). Aggregate PR 1 overrun:
  1,484 LOC non-test vs 690-820 estimated. Stop-and-reassess trigger
  fired on C8 verification. Max approved Option A (accept) after
  tracing the overrun to line-items and confirming it was audit-
  estimation miss, not schema-design complexity.
- **Rule:** Zod schemas for tools that downstream validators consume
  require args schema + returns schema + `.describe()` strings +
  cross-field `.refine()` guards — thin estimates reflect thin schemas
  that can't serve the validator's needs. Apply **~25-30 LOC/tool** to
  2b.2 planning and any future block Zod migrations. When you hear
  "per-tool Zod LOC" in a sizing conversation, your reflex should be
  ~25, not ~5. Under the v2 shape specifically, each tool needs:
    - 1 Zod object for args with per-field `.describe()`
    - 1 Zod shape for returns (share record primitives across tools to
      avoid repetition — helps but doesn't erase the per-tool cost)
    - Cross-field refines where the API enforces "either A or B" rules
    - Event emits array
  That surface is the validator's input; cutting any piece makes the
  validator weaker. Don't promise the audit a 5-LOC/tool number you
  can't deliver against a real validator.

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

## Template for new entries

```
## L-NN — <one-line summary>

- **Trigger:** What happened that triggered the correction.
- **Rule:** What you will do (or not do) next time, specifically enough that
  future-you could follow it without re-reading the context.
```
