# Anthropic out-of-credits arrives as HTTP 400 — status-only error mapping lied to users

## The problem, in one line
A live /try build against flowtechac.com failed with Anthropic's "Your credit
balance is too low to access the Anthropic API" error, but the UI showed
"Something broke on our end. Give it another try." with a Try again button —
a retryable framing for a condition no retry can fix.

## The approach
1. Read the production log line (`markdown_extractor_anthropic_error`,
   status 400) and the catch block in
   `packages/crm/src/lib/web-onboarding/markdown-extractor.ts`. The mapping
   keyed ONLY on HTTP status: 401/403 → `anthropic_unauthorized`,
   402/429 → `credits_exhausted`, everything else → `internal_error`.
   Anthropic sends out-of-credits as **400 `invalid_request_error`**, so it
   fell to `internal_error`.
2. Traced the reason downstream: `run-create-from-url.ts` emits SSE
   `error {reason}`; `try-client.tsx` shows `data.message` if present, else a
   generic retryable fallback. So the fix needed THREE layers: the mapping
   (wrong reason), the SSE payload (no honest message for
   `credits_exhausted`), and the UI (retry affordance shown for a
   non-retryable state).
3. Found the identical copy-pasted catch block in `paste-extractor.ts` —
   the exact drift risk that caused the gap. Extracted the mapping into one
   shared `anthropic-error-map.ts` (`mapAnthropicSdkError`) used by both
   extractors; detector = `status === 400` AND case-insensitive substring
   "credit balance is too low" on the SDK error message (the SDK wraps the
   raw error JSON into `err.message`).
4. TDD at each layer: extractor spec (400 + credit message →
   `credits_exhausted`), mapper spec (full status contract), run-pipeline
   spec (`credits_exhausted` 422 carries an honest `message`), and a jsdom
   spec asserting the /try error card shows the server message and renders
   NO "Try again" button. The UI test's RED was proven by stashing only the
   UI file and re-running.

## Judgment calls
- Did NOT match the credit message at any status — kept it scoped to 400 so
  a genuine bad-request bug still surfaces as `internal_error` (a bug
  signal), per the task's spec.
- Did NOT touch the legacy `web-fetch-extractor.ts` mapping — it's only
  imported for the `WebFetchError` type now; changing dead code is noise.
- Did NOT add a `message` to `run-create-from-paste.ts`'s SSE payload — its
  only consumer (`clients-new-form.tsx`) ignores `message` entirely; the
  paste path got the correct *reason* via the shared mapper, and honest copy
  there is a separate UI task.
- Did NOT repair the whole corrupted pnpm store found along the way (12
  empty package dirs in the main checkout broke every jsdom spec locally) —
  restored only the 7 packages jsdom needs to run the new UI test, and
  spawned a separate task for the full `pnpm install` repair.
- Left `anthropic_unauthorized` messageless: sometimes transient/fixable by
  key rotation, and its test pins that contract.

## The reusable rule, one line
Never map provider errors by HTTP status alone — providers ship
semantically-distinct failures under the same status (Anthropic's
out-of-credits is a 400), so keep ONE shared mapper per provider, test the
message-based cases, and make every non-retryable reason carry honest
user-facing copy with the retry affordance suppressed.

## Follow-up (same day, PR #113) — the consumer-surface sweep
The "separate UI task" deferred above (judgment call 3) was real debt: the
dashboard's `/clients/new` kept showing "We couldn't read that site. Try a
different URL" for the same out-of-credits 422, on BOTH its URL and paste
listeners — a worse lie than /try's, because the operator may be on their
own BYOK key and the actual fix is funding it. PR #113 made both listeners
reason-aware (server `message` wins, dedicated fallback copy mentions adding
Anthropic credits), threaded `message` through `run-create-from-paste.ts`'s
422, and hoisted the copy into `CREDITS_EXHAUSTED_UI_MESSAGE` in
`anthropic-error-map.ts` so the two orchestrators share one string.

**Corollary rule:** an error-payload honesty fix isn't done at the payload —
enumerate every consumer surface of that payload (grep the event/field name
across `app/`) and sweep them all in the same wave, or file the gap
explicitly with the exact file:line so the follow-up is mechanical.
