# Tasks — SeldonFrame

Canonical in-flight plan. Per CLAUDE.md §2.7, every non-trivial task starts here
with a checkable plan, gets ticked off as it ships, and ends with a review block.

---

## In flight

_(none — awaiting staging smoke result from the last autonomous run)_

---

## Queued — post-staging

Ordered by staff-engineer priority after staging passes. Pick top-of-stack next.

- [ ] **MCP-side tool: `revoke_bearer`** — add to `skills/mcp-server/src/tools.js`,
      mirrors the `/api/v1/workspace/[id]/revoke-bearer` endpoint.
- [ ] **MCP-side tool: `soul_compile_status`** — polls
      `/api/v1/workspace/[id]/soul-status`, for builders using URL-sourced create.
- [ ] **NextAuth magic-link claim flow** — one-click post-claim sign-in. Current
      UX requires manual login after `link_workspace_owner`.
- [ ] **Orphan workspace TTL cron** — delete anonymous `ownerId IS NULL` workspaces
      unclaimed for 30 days. Prevents row accumulation.
- [ ] **Observability pass** — structured logs with `request_id`, `org_id`,
      `identity_kind`; minimal dashboard for installs/day, claim rate, LLM spend.
- [ ] **Expand Seldon It action surface** beyond the current 6 tools —
      `add_booking_type`, `add_intake_form`, `configure_vertical_pack`.
- [ ] **Input sanitization audit on Seldon It prompts** — before the prompt
      reaches Anthropic and before any prompt text is persisted to
      `settings.seldon_it_events`.
- [ ] **Rotate the EXPIRE NX pattern** to `SET key 1 EX N NX` + `INCR` branching
      if we observe stuck-TTL-less keys in prod.

---

## Shipped

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
