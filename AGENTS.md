<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version (Next 16.2+) has breaking changes — APIs, conventions, and file structure may differ from your training data. Read the relevant guide in `node_modules/.pnpm/next@*/node_modules/next/dist/docs/` before writing routing or middleware code. Specifically:

- **`proxy.ts` replaces `middleware.ts`.** The subdomain routing + auth-gate lives in `packages/crm/src/proxy.ts`. Do not create `middleware.ts` — Next 16 discovers `proxy.ts` automatically.
- Heed deprecation notices in runtime logs.
<!-- END:nextjs-agent-rules -->

---

# SeldonFrame — architecture and locked rules

This file is the single source of truth for any agent working in this repo. Read it
before touching code. If a rule here contradicts something else, this wins.

## Core vision (locked — never compromise)

1. **Thin harness + fat BLOCK.md skills + owned Brain v2.** Business logic lives in
   skills (`BLOCK.md` specs + `/blocks/`), not the framework. The harness dispatches;
   skills decide.
2. **Zero-friction first-run.** Install MCP → natural language → real hosted workspace
   on `<slug>.app.seldonframe.com` with CRM, Cal.diy booking, Formbricks intake, Brain v2,
   and a dark theme. Every word of that sentence is load-bearing.
3. **No guest mode, no `local://` paths, no "claim later" ceremony, no upfront API key.**
   These patterns are dead. If you find them anywhere, treat as a bug.
4. **Progressive key disclosure.** `SELDONFRAME_API_KEY` is only required for:
   second workspace, custom domain, full Brain v2, publishing, org-scoped secret rotation.
   Everything else is free and anonymous.
5. **Builders own their blocks.** Customized blocks can be exported and published.
6. **The Soul is the connective tissue.** Every workspace has one; everything references it.

## Architecture invariants

- **Anonymous workspaces**: `organizations.ownerId IS NULL`, claimed later via
  `POST /api/v1/workspace/[id]/link-owner`. Do NOT create shadow users.
- **Bearer tokens**: `wst_*` format, SHA256-hashed, stored in `api_keys` with
  `kind='workspace'`. Device-local at `~/.seldonframe/device.json`.
- **Auth resolution order** (in every v1 route): `Bearer wst_*` → `x-seldon-api-key` →
  NextAuth session. Use `resolveV1Identity` in `src/lib/auth/v1-identity.ts`.
- **Admin URLs** route through `/switch-workspace?to=<orgId>&next=<path>` so the
  active-org cookie is set before the admin page loads.
- **Public URLs** use the subdomain: `<slug>.app.seldonframe.com/`, `/book`, `/intake`.
  `proxy.ts` rewrites them to `/s/<slug>/home`, `/book/<slug>/<booking-slug>`, etc.
- **Settings JSONB writes must be atomic** — use `sql\`jsonb_set(...)\`` when touching
  a specific subtree of `organizations.settings`. Read-modify-write clobbers siblings.
- **Rate limits** are workspace-scoped (60/hr Seldon It, 120/hr Brain query) and
  IP-scoped for anonymous creation (3/hr, 10/day). Fall back from Redis to in-memory.
- **LLM spend cap** for anonymous (`ownerId: null`) workspaces is 100¢/day,
  enforced in `lib/billing/metering.ts`.

## Model defaults

- Default Claude model: **`claude-opus-4-7`** with `thinking: {type: "adaptive"}`.
  Never use `temperature`, `top_p`, `top_k`, or `budget_tokens` on Opus 4.7 — they 400.
- Brain v2 and Seldon It both use `tool_choice` with a fixed schema (no JSON-mode
  parsing). Cache the system prompt with `cache_control: {type: "ephemeral"}`.

## What lives where

| Concern | File/dir |
|---|---|
| Anonymous create | `lib/billing/anonymous-workspace.ts` |
| Workspace URLs | `buildWorkspaceUrls()` in the above |
| Bearer auth | `lib/auth/workspace-token.ts`, `lib/auth/v1-identity.ts` |
| Proxy / subdomain / auth gate | `src/proxy.ts` |
| Admin active-org switch | `src/app/switch-workspace/route.ts` |
| Block install (idempotent flag + settings merge) | `lib/blocks/install.ts` |
| Block default templates | `lib/blocks/templates.ts` |
| Seldon It LLM planner | `lib/seldon-it/service.ts` |
| Metering | `lib/billing/metering.ts` |
| Reserved slugs | `lib/utils/reserved-slugs.ts` |
| First-run smoke test | `packages/crm/tests/integration/first-run.spec.ts` |
| Staging runbook | `docs/STAGING_FIRST_RUN_RUNBOOK.md` |

## MCP client contract

The official MCP server lives at `skills/mcp-server/`. Its tools expect these routes:

- `POST /api/v1/workspace/create` — anonymous create, returns `bearer_token` + `urls`
- `POST /api/v1/packs/caldiy-booking/install`
- `POST /api/v1/packs/formbricks-intake/install`
- `POST /api/v1/seldon-it`
- `POST /api/v1/brain/query`
- `POST /api/v1/soul/submit`
- `GET /api/v1/workspaces`, `GET /api/v1/workspace/[id]`
- `POST /api/v1/workspace/[id]/link-owner`
- `POST /api/v1/verticals/install` (vertical packs)

If you add an MCP tool, add its endpoint. If you add an endpoint, update the MCP
tool list too — these must stay in sync.

## Rules for autonomous work

1. **Build after every slice** — `pnpm build` from repo root. Green = 6/6 tasks.
2. **Use `resolveV1Identity` for auth** — never inline the `x-seldon-api-key` parser.
3. **No `as unknown as X` double casts** — if TypeScript complains, fix the shape.
4. **Idempotent writes** — inserts should check-then-insert or use `ON CONFLICT`.
5. **Log progress tersely** — one sentence per meaningful action, user-facing.
6. **Check in on:** DB schema changes, any new external dependency, any infra
   operation (migration, DNS, Redis), any change that touches billing or auth.
7. **Honest about what's live.** Code-correct ≠ staging-verified. Say which is which.
8. **Session-level caveat: `git stash` can silently drop tracked modifications.**
   Don't use it mid-session. Use scratch commits on a throwaway branch instead.

## Recommended harness hooks (enable via `/update-config` if you want them)

```jsonc
// .claude/settings.json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "pnpm --filter @seldonframe/crm tsc -p tsconfig.json --noEmit 2>&1 | head -40" }
        ]
      }
    ]
  }
}
```

(Not enabled by default — adds ~5s per edit. Enable once you're doing sensitive work.)

## Useful links

- Staging runbook: [docs/STAGING_FIRST_RUN_RUNBOOK.md](docs/STAGING_FIRST_RUN_RUNBOOK.md)
- Smoke test: `pnpm test:first-run` (needs `API_BASE` env)
- MCP README: [skills/mcp-server/README.md](skills/mcp-server/README.md)
