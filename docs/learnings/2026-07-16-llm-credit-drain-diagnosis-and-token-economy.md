# 2026-07-16 — Diagnosing an LLM credit drain from the app's own records, and making the runtime cheap by construction

## The problem, in one line

A $20 Anthropic top-up vanished in 34 minutes with no obvious cause — the only
visible symptom was a generic "Something broke on our end" on the public /try
page.

## The approach

1. **Read the error, not the symptom.** The Vercel log export contained the
   exact cause in one line: Anthropic returned HTTP 400 "credit balance is too
   low". Note: Anthropic ships this as a **400 invalid_request_error**, NOT a
   402/429 — error mappers keyed on status alone misclassify it as internal.
2. **Find where usage is recorded before guessing who spent it.** The
   dedicated metering table (`seldon_usage`) was empty — that told us the
   burner was a flow that doesn't write there. `agent_run_receipts` was the
   ground truth: every push-triggered agent run, timestamped, with status and
   tool calls.
3. **Bracket the spend window with the receipts.** Errors all day = balance
   was $0 long before the top-up. First `ok` receipt = the moment credits
   landed (18:18). Last `ok` before errors resumed (18:52) = the moment they
   ran out. Everything that succeeded inside that window IS the spend, fully
   enumerated: 10 email-agent runs.
4. **Explain the magnitude from the code, not vibes.** Three multipliers found
   by reading the loop: (a) tool outputs `JSON.stringify`'d into the
   conversation with no cap, re-sent every iteration; (b) no prompt caching
   anywhere in the loop; (c) the adaptive model selector escalates to premium
   whenever a write tool is bound — which is always, for Gmail agents. Plus a
   4th multiplier in the DB: **three duplicate deployments** of the same
   template on the same mailbox (dedupe was per-deployment, so each email ran
   3×).
5. **Fix at all three layers**: cap tool results at the seam where they enter
   the conversation (20k chars, explicit truncation marker so the model
   narrows its query instead of hallucinating the tail); cache-mark system +
   last-tool + a moving breakpoint on the last message block (3 markers ≤ the
   API limit of 4, copy-on-write so markers never accumulate across
   iterations); block exact duplicate deployments at `createDeployment` with
   an explicit `allowDuplicate` escape hatch.

## Judgment calls

- **Did NOT cache the validator-regen call.** Its request has no `tools`, so
  its prefix can never match the loop's cached `[tools, system, …]` prefix — a
  marker there is pure cache-write premium (+25%) with no possible reader.
  Cache markers are only worth it when a later call shares the exact prefix.
- **Did NOT cap what gets persisted.** The full tool output still lands on the
  turn row; the cap applies only where content enters the model's context
  (including the history REBUILD path, which re-taxes historical outputs on
  every later turn — the non-obvious second seam).
- **Did NOT delete the duplicate deployment rows.** The product's own cancel
  action sets `status='canceled'`; mimicked that instead of a raw row delete
  (receipts reference deployment ids). Also did not touch a second duplicate
  pair belonging to a possibly-intentional forwarder — surfaced it to the
  operator instead.
- **Did NOT add a spend meter or budget system.** The runtime had one and it
  was deliberately removed under BYOK (operator pays their own key). The fix
  is structural cost reduction, not a new accounting subsystem.

## The reusable rule, one line

When an external-API budget drains mysteriously, bracket the spend window with
your own success/failure records (first-ok → last-ok) before touching the
provider dashboard — and in any agentic loop, treat every byte that enters the
conversation as a RECURRING cost (it re-bills every iteration and every later
turn), so cap it at entry and cache the static prefix.

## Related

- `docs/learnings/` sibling: none yet on prompt caching.
- Memory: `worktree-typecheck-method` (test-running mechanics used here),
  `email-agent-voice-push` (the push-trigger architecture that fired the runs),
  `usage-meter-shipped` (the per-sub-account metering that the burner flow
  bypassed — receipts, not the meter, were the evidence).
