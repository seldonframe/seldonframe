# Tasks — SeldonFrame

Canonical in-flight plan. Per CLAUDE.md §2.7, every non-trivial task starts here
with a checkable plan, gets ticked off as it ships, and ends with a review block.

---

## In flight

- [ ] **Portal Documents (file upload)** — first-class file uploads on the
      Client Portal. New `portal_documents` table + Vercel Blob, server actions
      `uploadPortalDocumentAction` / `markPortalDocumentDownloadedAction`,
      operator drag-drop tab on the contact record, merged client-portal list.
      Plan: [tasks/portal-documents-plan.md](./portal-documents-plan.md).

---

## Queued — post-staging

Ordered by staff-engineer priority after staging passes. Pick top-of-stack next.

**High priority (pre-production promotion):**

- [ ] **MCP-side tool: `revoke_bearer`** — add to `skills/mcp-server/src/tools.js`,
      mirrors the `/api/v1/workspace/[id]/revoke-bearer` endpoint. Builders need
      a way to rotate a leaked device token without SQL.
- [ ] **Input sanitization audit** across the 4 typed customizer endpoints —
      `landing/update`'s `contentHtml` is hand-escaped but worth a second pass;
      `intake/customize` field `key` is regex-sanitized to snake_case; booking
      `title`/`description` pass through to JSONB; theme colors are hex-regex.
      Confirm nothing renders user input as unescaped HTML in the public pages.
- [ ] **Orphan workspace TTL cron** — delete anonymous `ownerId IS NULL`
      workspaces unclaimed for 30 days. Vercel cron at `/api/cron/orphan-ttl`.
      Prevents row accumulation now that anyone can `create_workspace`.
- [ ] **Drizzle journal drift on Seldon Frame DB** — `drizzle.__drizzle_migrations`
      is empty even though 39 tables + migration 0015 are applied. Next
      `pnpm db:migrate` will try to replay 0000–0014 and fail. Pick one:
      (a) backfill journal with all applied migrations,
      (b) switch to `drizzle-kit push` (no migration tracking),
      (c) apply future schema changes via Neon MCP SQL only.

**Medium priority (post-promotion):**

- [ ] **NextAuth magic-link claim flow** — one-click post-claim sign-in.
      Currently requires manual login after `link_workspace_owner`.
- [ ] **Observability pass** — structured logs with `request_id`, `org_id`,
      `identity_kind`; minimal dashboard for installs/day, claim rate.
- [ ] **Typed customizer expansion** — Path B left the surface at 4 customizers
      + install endpoints. Candidates for the next wave based on real builder
      needs: `add_booking_type` (multiple bookings per workspace),
      `configure_vertical_pack` (edit a pack's fields), `add_automation`.
      Don't ship speculatively — wait for a real "I can't do X" from a builder.
- [ ] **Rotate EXPIRE NX pattern** to `SET key 1 EX N NX` + `INCR` branching
      if we observe stuck-TTL-less keys in prod. Not urgent — failure mode
      self-heals on next request.

---

## Shipped

### 2026-04-19 (late evening) — 17/17 green in PRODUCTION 🎯

- [x] Branch merged to main via fast-forward (commit 3d332c79)
- [x] Vercel auto-deployed main → app.seldonframe.com now serves Path B
- [x] Wildcard domain `*.app.seldonframe.com` added as Vercel project domain
      → TLS cert provisioned → subdomain TLS handshake works
- [x] Caught + fixed last bug: `/intake` missing from proxy.ts matcher
      (commit 77b6b8eb). `/book` was in the matcher, `/intake` wasn't,
      so /intake fell through to Next default router and 404'd even
      though the proxy rewrite logic was correct.
- [x] **Full 17-assertion smoke against app.seldonframe.com: 17/17 PASSED**
- [x] Zero-friction first-run delivered: builder installs MCP → one NL command
      → real hosted workspace on <slug>.app.seldonframe.com with CRM, booking,
      intake, Brain v2, dark theme, sharable URLs. Zero backend LLM cost.

### 2026-04-19 (evening) — first real end-to-end green on staging

- [x] Staging DB setup: Seldon Frame project, migration 0015 applied via Neon MCP
- [x] Vercel preview env rotated + rebuilt on commit 668b9a27
- [x] `pnpm test:first-run` against preview URL: 15/15 passed (1 public skip)
      — proves: bearer auth, anonymous create, block install, 4 typed
      customizers, snapshot, link-owner/revoke/switch auth gates, all green
- [x] Path B architecture validated in production-shaped environment: backend
      runs zero Anthropic calls, DB writes only

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
