# A route can "work" only because the middleware never sees it

## The problem, in one line
On mobile, a freshly-claimed /record user could browse `/studio/agents/[id]` fine but was 307'd to the "Spin up a client workspace" page (`/clients/new`) the moment they clicked "Add your key" (`/settings/integrations/llm`) — same session, same auth state, inconsistent behavior.

## The approach
1. Reduce the user's exported request log (Vercel crm-log-export JSON) to unique `METHOD path status` tuples with a 10-line node script — the anomaly pops out immediately (`/settings/integrations/llm 307` amid 200s).
2. Grep the redirect target's copy ("Spin up") to identify the destination page (`/clients/new`), then grep for code that redirects there: found the onboarding gate in `packages/crm/src/proxy.ts` (~line 655) — authenticated + `soulCompleted=false` + non-public path → 307 `/clients/new`.
3. The contradiction (`/studio` 200 vs `/settings` 307) resolves in the middleware **matcher whitelist** (`export const config = { matcher: [...] }`, proxy.ts ~line 909): `/settings/:path*` is listed, `/studio/*` is not. The gate never ran for /studio at all.
4. Root cause of the state itself: accounts created by claiming a /record session never got `markOperatorOnboarded` (only the older /claim-build flow stamps it), so they are permanently `soulCompleted=false` and hit the gate on every matched path. Fix = stamp on claimed compile (idempotent, soft-fail) + replace the navigation with an in-page dialog.

## Judgment calls
- Did NOT "fix" it by adding `/settings/integrations/llm` to the gate's exception list — that patches one path and leaves every future dashboard link broken for the same accounts. The stamp kills the class.
- Did NOT add `/studio/:path*` to the matcher "for consistency" — widening middleware coverage was out of scope and would have newly gated a flow that works; noted it instead.
- Kept the stamp reuse of `markOperatorOnboarded` even though it also sets `welcomeShown=true` (record-claimers skip /welcome) — same self-closing semantics as /claim-build, flagged as a product note rather than forked into a new half-copy of the helper.

## The reusable rule, one line
When two same-session routes behave inconsistently under an auth/onboarding gate, check the middleware **matcher** before the gate logic — a path that "works" may simply be invisible to the middleware, and the matched/unmatched split tells you exactly which gate fired.

Related: memory `record-v3-redesign`, memory `seldonframe-platform-gotchas`.
