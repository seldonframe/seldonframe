# Pull Firecrawl out of the SeldonFrame backend

**Date**: 2026-05-14
**Status**: Approved design; ready for implementation plan
**Brainstorm source**: live session with maximehoule100@gmail.com

## Motivation

The SeldonFrame backend currently scrapes operator-provided URLs via a
self-hosted Firecrawl instance on a Hetzner VPS. This architecture has three
chronic problems:

1. **Operational burden.** A dedicated VPS, Caddy reverse-proxy, Let's
   Encrypt cert lifecycle, UFW firewall, docker-compose maintenance — none
   of which directly serve the product. A multi-hour incident on 2026-05-14
   surfaced that the Firecrawl URL had never been wired into Vercel env at
   all; the backend silently defaulted to `http://localhost:3002` and every
   URL-based workspace creation returned `scrape_failed`.

2. **Antifragility loss.** Firecrawl is a deterministic Playwright-based
   scraper. It does not improve as LLMs improve. Every Claude release that
   gets better at extraction from raw HTML widens the gap between what
   Firecrawl gives us and what Claude can do directly.

3. **Bot-fight collisions.** Many small-business sites (HVAC, plumbing,
   dental) sit behind Cloudflare bot-fight rules. The fallback path in the
   backend's `fallbackReadability` used a `SeldonFrame/1.0 (Soul Compiler)`
   User-Agent that Cloudflare routes into a redirect loop. Firecrawl itself
   uses Playwright (real browser fingerprint), which avoids this — but
   self-hosted Firecrawl's outbound IP can land on Cloudflare reputation
   lists.

The empirical observation that motivates this spec: when the backend's
Firecrawl path failed on 2026-05-14, the Claude Code session already routed
around it — using its own `WebFetch` tool to read the page, extracting facts
manually, dialoguing with the operator for missing fields, and calling the
description-based workspace creation path. The architecture told us what it
wants to be: thin backend, fat skill, orchestration in the LLM client.

## Goals

- Move URL→business-facts extraction from the backend to the Claude Code
  client.
- Eliminate the Firecrawl dependency entirely (code + Hetzner deployment).
- Make `/api/v1/workspaces/create-full` (and the related v2 path) the only
  workspace-creation surface: structured facts in, workspace out.
- Preserve the operator-facing UX: paste a URL, get a workspace.

## Non-goals

- Softening other rigid validators (icon allowlist, output_contract). Same
  architectural principle, separate spec.
- Adding new MCP tools beyond what's needed to replace the URL flow.
- Adding a Vitest harness to `skills/mcp-server` (overdue but out of scope
  here).
- Choosing the eventual disposition of the Hetzner VPS (delete vs.
  repurpose) — deferred to decommission time.

## Architecture

### Before

```
operator: "create workspace for https://quigleyac.com"
   ↓
Claude → create_workspace_from_url({ url })
   ↓ POST /api/v1/workspace/create
backend: compileSoulService(url)
   ↓
firecrawl.ts → Firecrawl /v1/map + /v1/scrape (Hetzner via Caddy)
   ↓
soul JSON → workspace pipeline → response
   ↓
Claude relays response to operator
```

### After

```
operator: "create workspace for https://quigleyac.com"
   ↓
Claude → create_workspace_from_url({ url })
   ↓ GET /api/v1/workspace/extract-instructions?url=…
backend: returns { instructions, required_fields_schema, next_tool }
   (no fetching, no scraping, no LLM)
   ↓
Claude:
   1. WebFetch(homepage)
   2. WebFetch(up-to-2 priority sub-pages) if homepage sparse
   3. Reason → extract fields per schema
   4. Ask operator for any missing required field
   5. create_workspace_v2(...) — existing flow
   6. for each block: get_block_skill → persist_block
   7. complete_workspace_v2(...)
   8. finalize_workspace(...)
```

**Invariant**: after this change, the backend has zero URL-fetching code
paths. No Firecrawl, no readability fallback, no HEAD checks. Sites Claude
can read → workspace created. Sites Claude can't read → operator dialogue.

## Components

### New: `GET /api/v1/workspace/extract-instructions`

Pure-data response. No fetching, no LLM, no auth required (returns static
guidance; no PII). Standard abuse rate-limit acceptable.

```ts
// packages/crm/src/app/api/v1/workspace/extract-instructions/route.ts
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "missing ?url param" }, { status: 400 });
  }
  return NextResponse.json({
    status: "instructions",
    url_echo: url,
    instructions: EXTRACTION_INSTRUCTIONS,
    required_fields_schema: REQUIRED_FIELDS_SCHEMA,
    next_tool: "create_workspace_v2",
  });
}
```

The `EXTRACTION_INSTRUCTIONS` constant is the verbatim prose Claude follows.
The `REQUIRED_FIELDS_SCHEMA` mirrors what `create_workspace_v2` accepts.

#### `EXTRACTION_INSTRUCTIONS` content

```
You are extracting business facts from a website to create a SeldonFrame workspace.

URL: {url_echo}

Step 1 — Fetch homepage.
  Use the WebFetch tool to read {url_echo}. Look for: business name, services
  offered, phone, city/state, business description, hours, emergency/same-day,
  certifications, service area.

Step 2 — Decide if sub-pages are needed.
  If the homepage has all the REQUIRED fields below, skip to Step 3.
  Otherwise, fetch up to 2 of these in this priority order (only if they exist
  as links on the homepage): /about, /services, /contact, /pricing.
  HARD LIMIT: 3 total WebFetch calls. Stop fetching after that even if
  fields are still missing.

Step 3 — Reason and extract.
  Produce a JSON object matching the schema below. Use confident extractions
  only; do not invent. If a REQUIRED field can't be determined from what you
  fetched, leave it as null.

Step 4 — Fill the gaps with operator dialog.
  For every REQUIRED field that's still null, ask the operator ONE targeted
  question per missing field, in the simplest form. Examples:
    - "What's the business phone number?"
    - "What city is the business based in?"
  Don't ask for fields you already extracted with high confidence.

Step 5 — Create the workspace.
  Once every REQUIRED field is non-null, call create_workspace_v2 with the
  full object. Then follow the v2 flow: for each block in
  v2.recommended_blocks, call get_block_skill(name), generate props, call
  persist_block. Then call complete_workspace_v2, then finalize_workspace.

Failure modes:
  - WebFetch returns empty/error: try the next priority page. If all 3 fetches
    fail or return empty, tell the operator "I can't read the site — can you
    paste a description of the business?" and route to description-based flow.
  - WebFetch returns a Cloudflare/anti-bot challenge page (signs: "Just a
    moment...", "Verifying you are human", < 500 chars of meaningful content):
    same as empty — fall back to the operator-description dialog.
  - JS-only SPA (HTML shell with no content): same — fall back to dialog.

Do NOT:
  - Pre-validate URLs (no HEAD requests, no probes — just WebFetch).
  - Fetch more than 3 pages.
  - Fabricate any field. If unsure, ask.
  - Call create_full_workspace from this flow. Always use create_workspace_v2.
```

#### `REQUIRED_FIELDS_SCHEMA` content

```json
{
  "type": "object",
  "required": ["business_name", "city", "state", "phone", "services", "business_description"],
  "properties": {
    "business_name":        { "type": "string", "minLength": 1 },
    "city":                 { "type": "string", "minLength": 1 },
    "state":                { "type": "string", "minLength": 1, "description": "2-letter or full name" },
    "phone":                { "type": "string", "minLength": 1 },
    "services":             { "type": "array", "items": { "type": "string" }, "minItems": 1 },
    "business_description": { "type": "string", "minLength": 1 },
    "review_count":         { "type": ["number", "null"] },
    "review_rating":        { "type": ["number", "null"] },
    "certifications":       { "type": ["array", "null"], "items": { "type": "string" } },
    "trust_signals":        { "type": ["array", "null"], "items": { "type": "string" } },
    "emergency_service":    { "type": ["boolean", "null"] },
    "same_day":             { "type": ["boolean", "null"] },
    "service_area":         { "type": ["array", "null"], "items": { "type": "string" } },
    "email":                { "type": ["string", "null"] },
    "address":              { "type": ["string", "null"] },
    "weekly_hours":         { "type": ["object", "null"] },
    "testimonials":         { "type": ["array", "null"] }
  }
}
```

### Changed: `create_workspace_from_url` MCP tool

Input schema unchanged (single `url` field). Output schema changes from a
finished workspace to the "playbook" payload above. Handler becomes a thin
pass-through GET to `/api/v1/workspace/extract-instructions`. New
description:

> "Entry point for URL-based workspace creation. Returns instructions Claude
> follows: WebFetch the URL, optionally WebFetch up to 2 priority sub-pages,
> extract structured business facts, ask operator for any required field
> that can't be determined, then call `create_workspace_v2`. THIS TOOL does
> NOT create a workspace — it returns the playbook."

### Changed: `create_workspace_v2` and `create_full_workspace`

- Remove `confirmed_no_url_available` from input schema (the guard existed
  only to force-route URL inputs through `create_workspace_from_url`).
- Rewrite descriptions: drop the "⛔ DO NOT USE WHEN A URL IS PROVIDED"
  warnings. Mention that URL inputs go through `create_workspace_from_url`
  → (extract dialog) → `create_workspace_v2`.

### Deleted

| Path | Action |
|---|---|
| `packages/crm/src/lib/soul-compiler/firecrawl.ts` | Delete |
| URL branch of `compileSoulService` in `service.ts` | Delete |
| All callers of `compileWebsiteToMarkdown` | Find + remove |
| `tests/integration/faq-from-url-smoke.md` | Update or delete |

### Modified: `/api/v1/workspace/create`

If body has `url`, return 410 Gone:

```json
{
  "status": "error",
  "code": "url_flow_moved",
  "message": "URL-based workspace creation has moved to the MCP client. Upgrade to @seldonframe/mcp v1.52+ (npx -y @seldonframe/mcp@latest) and retry."
}
```

Description path stays intact.

### Env var cleanup (Vercel)

| Var | Action |
|---|---|
| `FIRECRAWL_BASE_URL` | Remove from production, preview, development |
| `FIRECRAWL_API_KEY` | Remove from production, preview, development |

### `compileSoulService` simplification

The `scrape_failed` error code is removed from the result type (no scraping
possible → no scrape failure mode). Result narrows to:

```ts
type ServiceResult =
  | { status: "ready", ... }
  | { status: "split_required", ... }
  | { status: "error", code: "invalid_input" | "compile_failed", message: string };
```

## Data flow

1. Operator types `create workspace for https://quigleyac.com` in Claude Code.
2. Claude calls `create_workspace_from_url({ url: "https://quigleyac.com" })`.
3. MCP handler GETs
   `https://app.seldonframe.com/api/v1/workspace/extract-instructions?url=https%3A%2F%2Fquigleyac.com`.
4. Backend returns `{ status: "instructions", url_echo, instructions,
   required_fields_schema, next_tool: "create_workspace_v2" }`. Response
   size ≈ 4–6 KB.
5. Claude reads the instructions verbatim. Calls `WebFetch("https://quigleyac.com")`.
6. If homepage is sparse on REQUIRED fields, Claude WebFetches up to 2
   priority sub-pages (`/about`, `/services`, `/contact`, `/pricing` —
   stops at 3 total fetches).
7. Claude extracts fields per `required_fields_schema`. If any REQUIRED
   field remains null, Claude asks the operator one targeted question per
   missing field.
8. Claude calls `create_workspace_v2(fields)`. Existing flow.
9. For each block in `v2.recommended_blocks`: `get_block_skill` →
   `persist_block`.
10. `complete_workspace_v2({ workspace_id })`.
11. `finalize_workspace({ workspace_id, email })`.

## Error handling

| Failure | Handling |
|---|---|
| WebFetch on homepage returns error/empty | Claude tries next priority sub-page; if all 3 fetches fail, falls back to operator-description dialog |
| WebFetch returns Cloudflare challenge page (recognized by content fingerprint) | Same as empty |
| WebFetch returns JS-shell SPA with no meaningful content | Same as empty |
| Required field not extractable + operator doesn't know | Workspace creation can't proceed; Claude surfaces this to operator (no auto-fabrication) |
| Optional field not extracted | Stay null; workspace still created; operator can edit in admin |
| Old MCP client (v1.51 or earlier) posts URL to `/v1/workspace/create` | Backend returns 410 `url_flow_moved` with upgrade instructions |
| Claude exceeds 3-fetch limit | Hard rule in instructions; Claude stops, uses what it has, dialogues for gaps |

## Testing

### Backend unit tests (TDD)

New route — `GET /api/v1/workspace/extract-instructions`:

- Returns 400 when `?url` missing.
- Returns 200 with `{ status, url_echo, instructions, required_fields_schema, next_tool }` when `?url` present.
- Response is deterministic regardless of URL value (no fetching).
- `instructions` string contains "WebFetch" (sanity check).
- `required_fields_schema.required` contains the 6 required field names.

Legacy `/v1/workspace/create` with URL body:

- Returns 410 with `code: "url_flow_moved"`.
- Description body still works (no regression).

Dead-code elimination:

- `firecrawl.ts` import throws.
- `compileSoulService` no longer accepts URL input.

### MCP server tests

`skills/mcp-server` has no Vitest harness today. Minimum verification:

- `npm run check:syntax` passes.
- Manual smoke: load MCP in Claude Code, call
  `create_workspace_from_url("https://quigleyac.com")`, verify returned
  payload matches new schema.

### End-to-end smoke matrix

Run from a fresh Claude Code session with `@seldonframe/mcp@1.52.0`:

| Site | Expectation | Why |
|---|---|---|
| `https://quigleyac.com` | Workspace created, no operator-dialog needed | Cloudflare site that previously hit `scrape_failed` — proves WebFetch path |
| `https://dallasheatingac.com` | Workspace created; possibly one dialog question | Confirms multi-page flow |
| `https://haltexplumbing.com` | Workspace created from large HTML | Confirms Claude extracts from 200KB+ HTML |
| description-only (no URL) | Workspace created, no `extract-instructions` call | Confirms non-URL path untouched |
| `https://nonexistent-asdkjfh.com` | Claude WebFetches, fails, asks for description, workspace created from description | Graceful-failure path |
| Known JS-SPA (TBD at test time) | Claude WebFetches, sees empty shell, asks operator | SPA fallback |

### Production verification

- Deploy, tail function logs for 24h.
- Watch for 5xx on the new endpoint, any 410 hits (= clients on old MCP),
  any regression on description-only flow.

## Migration / decommission sequence

Each step independently safe and reversible until step 9.

1. Ship backend changes (deletions + new `extract-instructions` endpoint).
2. Ship MCP server changes (repurposed `create_workspace_from_url`, v1.52.0).
3. Verify end-to-end on prod against the smoke matrix.
4. Wait 24h watching logs.
5. Remove Vercel env vars (`FIRECRAWL_BASE_URL`, `FIRECRAWL_API_KEY`) from
   prod, preview, dev.
6. Take Hetzner VPS snapshot (cold rollback point).
7. Remove DNS A record `firecrawl.seldonframe.com` via Vercel DNS API.
8. SSH to Hetzner, `docker compose down` in `/root/firecrawl`.
9. Delete Hetzner VPS OR repurpose for another SF workload (decide at this
   step).

### Rollback plan

| Discovered after | Action |
|---|---|
| Step 3 (before 24h soak) | Revert code commits, redeploy. Backend goes back to using `FIRECRAWL_BASE_URL` (still on Vercel). |
| Step 4 (during soak, before env removal) | Same as above. |
| Step 5 (env removed, before snapshot/DNS) | Re-add env vars, code rollback. |
| Step 7+ (DNS removed, snapshot taken) | Snapshot restore + DNS re-add + env re-add + code rollback. |
| After step 9 | Not realistically reversible. Spec assumes 24h soak made this safe. |

## MCP server version + publish

- `skills/mcp-server/package.json`: `1.51.0` → `1.52.0` (MINOR — public-facing
  tool behavior changes, no breaking input schema changes from caller's
  perspective).
- `npm publish` from `skills/mcp-server`.
- MCP Registry update via `mcp-publisher` CLI.
- CHANGELOG: "v1.52.0 — URL-based workspace creation now runs in the Claude
  Code client via WebFetch, not via backend scraper. No action needed for
  callers."

## Definition of done

- [ ] All backend unit tests pass.
- [ ] `npm run check:syntax` passes in `skills/mcp-server`.
- [ ] All 6 rows of E2E smoke matrix pass.
- [ ] Deployed to prod, 24h soak with no regressions.
- [ ] Decommission sequence complete through step 9.
- [ ] `firecrawl.seldonframe.com` no longer resolves.
- [ ] No Firecrawl-related env vars on Vercel.
- [ ] `@seldonframe/mcp@1.52.0` published to npm + MCP Registry.
- [ ] CHANGELOG entry for v1.52.0.
- [ ] Tokens rotated: Vercel personal access token (shared in chat
  2026-05-14), Firecrawl bearer token (also in chat — moot if box is gone).

## Out of scope (separate specs)

1. Icon allowlist soft-validation (`icon_in_allowlist` blocking failures).
2. `output_contract` soft-validation (`landing_page_exists`,
   `cta_primary_href` blocking failures).
3. Personality cache vs. LLM resolution audit (`resolvePersonalityForBusiness`).
4. Weekly-hours regex parsing replacement with Claude-assisted normalization.
5. Vitest harness for `skills/mcp-server`.
