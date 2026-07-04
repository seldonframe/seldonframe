# Win-ladder + SeldonChat — rollout notes

Verify gate: Task 13, wave commits `974dd132..a23f6ec3` on `feature/onboarding-batch-2`.
Plan: `docs/superpowers/plans/2026-07-04-win-ladder-seldonchat.md` (13 tasks, all APPROVED —
see `.superpowers/sdd/progress.md` "WAVE 5" section).

## Env flip Max performs

- **`SF_WIN_LADDER=1`** in Vercel (Production + Preview). Non-secret — a plain
  feature flag, not a key. Strict-`"1"` contract (`isWinLadderOn` in
  `packages/crm/src/lib/web-build/policy.ts:37`) — anything else (`"true"`,
  `"yes"`, unset) keeps every wave surface dark.
- **Recommended alongside it, not required to flip the flag:** `UPSTASH_REDIS_REST_URL`
  + `UPSTASH_REDIS_REST_TOKEN`. The copilot's 20-turns/org/day cap
  (`DAILY_TURN_LIMIT` in `packages/crm/src/app/api/copilot/turn/route.ts:30`)
  goes through the shared rate limiter (`packages/crm/src/lib/utils/rate-limit.ts`),
  which prefers Upstash (fixed-window INCR+EXPIRE) when both env vars are set
  and **falls back to an in-process `Map`** otherwise. The in-memory fallback
  is correct for a single instance but **under-counts (lets more than 20
  through) once Vercel spawns multiple function instances** — each instance
  keeps its own counter. Fine to ship without Upstash on day one (worst case:
  a chatty org gets a few extra free turns); add the two envs before the
  ladder gets meaningful traffic if the cap needs to be load-bearing.

## What goes live immediately (no flag, already shipped in this wave)

These three are NOT behind `SF_WIN_LADDER` — they render/execute for every
org today regardless of the flip:

1. **`/pricing` truth pass** (`4aa2eb3d`, `a23f6ec3`) — the page now shows the
   single real $29/mo flat plan wired to the live Stripe checkout (was a
   stale 3-tier Builder/Workspace/Agency page). FAQ copy also fixed in the
   T11b follow-up commit.
2. **`$ai_generation` LLM-analytics capture** (`a4f6e494`) — server-side spans
   wrapped around every agent's Anthropic `create()` call
   (`packages/crm/src/lib/analytics/llm-capture.ts`), captured to PostHog.
   Invisible to users; adds a span per LLM call, fail-silent on capture
   errors.
3. **Booking → connected-calendar push** (`1bcd3fad`, Task 8) —
   `packages/crm/src/lib/integrations/calendar-push.ts`, fired from the
   `booking.created` event listener (`packages/crm/src/lib/events/listeners.ts`).
   This is **not gated by `SF_WIN_LADDER`** (it's gated by whether the org has
   a connected Composio calendar via `/integrations` — most don't yet, so it's
   a silent no-op for the overwhelming majority of orgs). Fail-soft by
   construction: no connection → no-op; any other failure is caught, logged,
   and swallowed before it can touch the booking flow. This is a scope note
   for whoever reads the diff expecting "only pricing + analytics are
   flag-independent" — the brief's premise undercounted this one path by one;
   it was independently reviewed and approved in Task 8 and carries its own
   live-smoke caveat (see Known caveats below).

A handful of `agents`-table queries (super-admin views, `/api/v1/agents`,
`/api/v1/workspace-state`, `createAgent`'s first-slug check) picked up a
`ne(agents.archetype, "workspace_copilot")` filter in this wave. These are
inert until a `workspace_copilot` agent row exists, which only happens via
`ensureWorkspaceCopilotAgent`, called only from the flag-gated
`/api/copilot/turn` route — so they have zero effect while the flag is off.

## What stays flag-dark until `SF_WIN_LADDER=1`

Every other wave surface checks `isWinLadderOn` before doing anything
user-visible:

- **SeldonChat dock** — `packages/crm/src/app/(dashboard)/layout.tsx:324`:
  `{winLadderOn && !isOperatorSession && orgId ? <SeldonChat .../> : null}`.
  Not rendered at all (not just hidden) when the flag is off.
- **`POST /api/copilot/turn`** — returns `404 { error: "not_found" }` before
  any auth/DB work when the flag is off (route.ts:38-40).
- **Dashboard win-ladder card + share/QR + contextual agent picks** —
  `packages/crm/src/app/(dashboard)/dashboard/page.tsx:596-628`: `winLadderOn`
  is computed once and short-circuits `ladderState`/`shareAssets` to `null`
  before any DB call (`resolveLadderInputs`, `buildShareAssets`) when off —
  zero added query cost in the common (flag-off) case.
- **`/settings/domain` $29 upgrade CTA** (`DomainUpgradeButton`) renders
  regardless of the ladder flag (it's the existing domain-gate upsell, not a
  ladder-only surface) — this was already live pre-wave and is unaffected.

## Live-smoke checklist (post-flip)

1. **Copilot turn** — on a test org, POST `/api/copilot/turn` with
   `{"message": "change my headline to X"}` (or drive it from the dock UI) →
   confirm the landing page version increments and the preview-bust logic
   fires (`shouldBustPreview` prefix-list check in `seldon-chat.tsx`).
2. **Ladder renders** — load `/dashboard` on Metro Medspa (or any claimed
   workspace with `landingPageRows.length > 0`) → confirm the 4-step ladder
   card renders with correct step states.
3. **Share QR** — from the ladder's share row, download the QR → confirm it
   decodes to the workspace's public site URL.
4. **Domain CTA → $29 checkout** — click the domain upgrade CTA → confirm it
   opens a real Stripe Checkout session for the $29/mo flat plan (not a
   stale tier).
5. **PostHog events** (project 497925, US region) — confirm `$ai_generation`,
   `activation_step_completed`, and `$mcp_tool_call` events are visible and
   attributed correctly (surface=copilot via `agent.archetype`, distinctId=orgId).
6. **Composio calendar push** — on a real org with a connected Google/Outlook
   calendar (via `/integrations`), create a booking → confirm a live event
   lands on the actual calendar. This is the one wave path that has never
   been end-to-end live-smoked (see caveat below) — do this before treating
   the push as reliable in production.

## Known caveats

- **Composio calendar-push slug/shape unverified** — `calendar-push.ts`'s
  header (lines 14-23) records that the `GOOGLECALENDAR_CREATE_EVENT` action
  slug and its response shape have never been live-smoked for this org-level
  path (only the per-deployment booking-backend path has partial
  confirmation, and even that flags its free-slots slug as best-guess). If
  the slug or response shape is wrong, the module fails soft to a logged
  no-op — never a thrown error into the booking flow — but the push silently
  won't happen. Live-smoke item 6 above is the fix-or-confirm step.
- **Per-booking `listConnections` round-trip** — `calendar-push.ts` calls
  Composio's `listConnections` fresh on every booking (no debounce/cache);
  harmless at current volume but a known follow-up if booking volume grows.
- **In-memory rate-limit under-counts without Upstash** — see the env-flip
  section above; the 20-turn/day cap is a soft ceiling until Upstash envs are
  set.
- **Ladder recompute per render** — `ladderState`/`shareAssets` are computed
  once per dashboard request but not cached across requests; cheap today
  (qrcode encoding + a few indexed selects), a cost note if dashboard traffic
  grows.
- **`go_live` step copy overpromises slightly** until the share row is fully
  wired end-to-end in production traffic (functionally complete per Task 7/9
  review, just not yet observed live).

## Fast-follows (not blockers)

- Add `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` once copilot usage
  is non-trivial, to make the 20/day cap authoritative across instances.
- Debounce or cache `listConnections` in `calendar-push.ts` if booking volume
  makes the per-booking round-trip costly.
- aria-live region for SeldonChat dock announcements (accessibility polish,
  noted at Task 4 final review).
- llm-capture.ts header comment inaccuracy (`$ai_span_id` "doesn't exist
  anywhere in the package" → should say "not present in the anthropic
  wrapper specifically"), noted at Task 12 final review — cosmetic, no
  functional impact.

## Verify-gate results (this task)

- Full unit suite: 600 spec files, 28 files / 81 leaf tests failing — **all
  pre-existing baseline failures untouched by the wave range**
  (`974dd132..a23f6ec3`); zero wave-attributable failures. All 10 wave-added
  spec files (ladder, ladder-server, share, suggest-agents, copilot-cap,
  copilot-ensure, copilot-tools, llm-capture, seldon-chat, calendar-push)
  passed clean.
- `npx tsc --noEmit` — zero errors.
- `bash scripts/check-use-server.sh src` — clean.
- `npx next build` — exit 0, full route manifest generated including
  `/api/copilot/turn`, `/dashboard`, `/settings/domain`, `/pricing`.
- Flag-off proof — verified by direct read of every `isWinLadderOn` call site
  (dashboard layout mount, dashboard page ladder/share computation, copilot
  turn route) plus a full `git diff --stat` accounting of every touched file
  in the wave.
- Dependency check — only `qrcode` + `@types/qrcode` added as new direct
  deps; the rest of the `pnpm-lock.yaml` diff is `qrcode`'s own transitive
  tree (yargs, pngjs, dijkstrajs, etc.), not new top-level additions.
