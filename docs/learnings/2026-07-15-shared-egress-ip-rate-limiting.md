# Rate-limiting a channel whose callers share egress IPs (ChatGPT MCP, PR #85)

## The problem, in one line
The ChatGPT app's `build_workspace` tool rate-limited by caller IP (3/hr) — but every ChatGPT user's tool calls arrive from OpenAI's handful of shared server egress IPs, so the whole channel collapsed to ~3 builds/hour total.

## The approach
1. Find the identity the platform already provides for this: OpenAI stamps `_meta["openai/subject"]` (anonymized, stable per-user id) on every MCP tools/call **exactly for rate limiting**, plus `_meta["openai/session"]` per conversation. Check the platform's docs for a per-user key before inventing one.
2. Extract the id in the PURE wire layer (`extractOpenAiMeta` in `packages/crm/src/lib/chatgpt-app/chatgpt-mcp-rpc.ts`): trim, reject non-strings, length-cap to 128 (it becomes a Redis key).
3. Express the limit policy as a PURE plan builder (`rate-limit-plan.ts`: `buildWorkspaceRateLimitChecks(ip, subject) → [{key, limit, windowMs}]`), and have the effectful deps layer just execute the plan against `checkRateLimit`. The policy — the part that can be subtly wrong — is now unit-testable with zero fakes.
4. Thread the id through the DI'd handler as a new dep parameter (`buildWorkspace(args, meta)`), so the pass-through is covered by the existing fake-deps handler specs.
5. Reuse the id for analytics: it became the PostHog distinct id, linking one user's build→browse→deploy funnel; `?ref=chatgpt` stamped on returned URLs (idempotent `URL.searchParams.set`) makes downstream claims attributable.

## Judgment calls
- **The caller-supplied id is forgeable wire data — never trust it alone.** Kept a coarse per-IP backstop (60/hr, 200/day) alongside the per-subject limit: a direct attacker rotating fake subjects burns their own IP's backstop, never a real user's allowance. Threat model: legit path (many users, one OpenAI IP) vs forge path (many subjects, one attacker IP) — the two keys cover each other's blind spot.
- **Calls with NO subject got today's strict per-IP keys, not the loose backstop.** The naive reading of "IP as backstop at 60/hr" would have loosened the public endpoint 20× for plain curl callers. Missing-subject = non-ChatGPT traffic = keep the old rules, in the same shared bucket as the anonymous web route (no double-dip).
- **Did NOT touch tool names/descriptions/schemas** — those trigger OpenAI app re-review. Server-side behavior and returned-URL content are free to change; the tool contract is not.
- **Did NOT make the error message dynamic** per which limit tripped — one friendly message covers all four checks; per-key messaging is complexity with no user value.

## The reusable rule, one line
When callers are proxied through a platform's shared infrastructure, rate-limit on the platform-provided per-user id and demote the IP to an anti-forgery backstop — and express the limit policy as a pure plan (keys+limits out, effects elsewhere) so it's testable.

Related: memory `marketplace-distribution-state` (the blocker this fixes), memory `seldonframe-security` (rate-limit invariants live next to the org-scope rules).
