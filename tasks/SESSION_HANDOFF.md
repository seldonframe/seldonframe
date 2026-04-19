# Session handoff — SeldonFrame first-run pipeline

Paste this (or link to it) at the start of any fresh Claude Code session that
needs to pick up this work. Updated whenever we hand off mid-flow.

**Last updated:** 2026-04-19, after connecting Neon MCP.

---

## Project in one paragraph

SeldonFrame is an AI-native Business OS. Builders install an MCP server in
Claude Code, type one natural-language command, and get a real hosted workspace
on `<slug>.app.seldonframe.com` with CRM, Cal.diy booking, Formbricks intake,
and Brain v2 — no signup, no upfront API key. The architecture is **thin
harness + fat BLOCK.md skills + owned Brain v2**, and **Path B locked in**:
all LLM reasoning happens in the user's Claude Code session (user's own
subscription pays), while the SeldonFrame backend is a pure deterministic
state machine. Zero backend LLM spend for the free tier, forever.

## Where we are in the timeline

- 10 slices shipped across two autonomous sessions. Backend + MCP refactor complete.
- **Just connected:** Neon MCP server. The session now has direct DB access via
  `mcp__neon__*` tools.
- **Immediate blocker:** staging Postgres has no tables. `pnpm db:migrate`
  failed silently twice from the user's laptop (Windows PowerShell) — suspected
  pooler endpoint breaking DDL transactions.
- **User just did:** rotated their Neon DB password (it leaked in an earlier
  screenshot) and set up Neon MCP.

## First 3 actions

1. **Verify Neon MCP works.** Call `list_projects` (or the Neon MCP's
   equivalent) and show the user which project/DB is reachable.

2. **Apply migrations to the staging DB.** The repo has 16 drizzle migrations
   in `packages/crm/drizzle/` (0000 through 0015). The staging DB is empty.
   Use the Neon MCP's `apply_database_migration` (or `run_sql` with the file
   contents) to apply them in order. The last one,
   `0015_workspace_bearer_tokens.sql`, adds `api_keys.kind` — every
   bearer-auth route on the first-run chain depends on it.

3. **Re-run the smoke test** against the Vercel preview. The preview URL is
   `https://crm-git-claude-sad-nightingale-5e7c94-maxime-houles-projects.vercel.app`
   — publicly reachable, no auth needed. Run from a bash shell in the repo:

   ```bash
   API_BASE=https://crm-git-claude-sad-nightingale-5e7c94-maxime-houles-projects.vercel.app/api/v1 \
   SKIP_PUBLIC_URL_CHECKS=1 \
   pnpm test:first-run
   ```

   Expected: 14/17 passed, 3 skipped (public URL checks skip because wildcard
   DNS isn't aliased to preview). Paste the full output and fix whatever
   breaks.

## Repo state

- Branch: **`claude/sad-nightingale-5e7c94`** (pushed to origin)
- Last commit: **`252980e5 docs: cover Windows PowerShell + cmd.exe env syntax`**
- Main is ~11 commits behind.
- `pnpm build` is green (6/6 tasks) as of that commit.
- Remote: `https://github.com/seldonframe/crm`
- User environment: **Windows 11 + PowerShell.** Do not give them bash-only commands.

## Locked architectural decisions (do not re-open)

1. **Path B — LLM-free backend.** No `seldon_it` endpoint, no `brain/query`
   endpoint. Replaced with typed customizer endpoints
   (`/api/v1/landing/update`, `/intake/customize`, `/booking/configure`,
   `/theme/update`) and a read-only snapshot endpoint
   (`/api/v1/workspace/[id]/snapshot`). Claude Code does all reasoning.
2. **Zero backend Anthropic spend** for first-run chain. SDK stays in
   `packages/crm/package.json` for 8 legacy paths only.
3. **Anonymous `ownerId: null` orgs.** No shadow users. Claim via
   `POST /api/v1/workspace/[id]/link-owner`.
4. **Bearer tokens** are `wst_*`, SHA256-hashed in `api_keys` with
   `kind='workspace'`. Stored client-side in `~/.seldonframe/device.json`.
5. **Subdomain routing** lives in `packages/crm/src/proxy.ts` (Next.js 16
   renamed middleware → proxy). Do NOT create `middleware.ts`.
6. **Admin URLs route through `/switch-workspace`** to set the active-org
   cookie before rendering.
7. **MCP has 21 tools** in `skills/mcp-server/src/tools.js`. There is no
   `seldon_it` or `query_brain` anymore.

## Operational rules

- **Do not push to main.** User has not authorized it. All work stays on
  `claude/sad-nightingale-5e7c94` or a PR branched from it.
- **Do not commit unless explicitly asked.**
- **Never `git stash` mid-session** (lesson L-01).
- **PowerShell env syntax:** `$env:VAR = "..."`, not `export` (L-09).
- **Flag credential leaks** in pasted screenshots immediately (L-10).
- **Build after every meaningful change.** `pnpm build` from repo root.
- **"Code-correct" ≠ "staging-verified."** Always name which claim you're making.

## Files to read first

1. `CLAUDE.md` — constitution, workflow rules
2. `AGENTS.md` — technical invariants, file map, MCP contract
3. `tasks/todo.md` — current queue + shipped log
4. `tasks/lessons.md` — 10 lessons from prior corrections
5. `docs/STAGING_FIRST_RUN_RUNBOOK.md` — v3 runbook, 17 smoke assertions
6. `docs/STAGING_READINESS_CHECKLIST.md` — one-page readiness check
7. `packages/crm/tests/integration/first-run.spec.ts` — the smoke test itself

## Honest uncertainties

- **Migration has never run against this staging DB.** Try Neon MCP's migration
  apply. If that fails, try the direct endpoint (no `-pooler` in hostname).
- **Wildcard DNS** is production-only. `SKIP_PUBLIC_URL_CHECKS=1` is correct for preview.
- **No end-to-end run has ever succeeded.** Every slice builds green but nothing
  is proven against a live DB + Vercel deploy + wildcard DNS.
- **`.next/` build artifacts are tracked** from pre-existing commits. Ignore
  the `.next/` noise in `git status`; don't commit changes to it.
- **Bug surface to watch for** when the smoke runs: subdomain proxy rewrites,
  the `jsonb_set` SQL in `enableWorkspaceBlock`/`recordWorkspaceEvent`
  (bound `text[]` paths), and the typed customizer membership check
  (`resolveOrgIdForWrite`).

## Success criterion for this session

`pnpm test:first-run` against the preview URL returns **14/17 passed (3 skipped)**
with zero red failures. Until then, diagnose each red failure at the source —
never patch the test.
