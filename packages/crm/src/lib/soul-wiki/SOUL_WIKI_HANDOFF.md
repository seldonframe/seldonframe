# Soul Wiki Operational Handoff

## Scope
This runbook covers Soul Wiki ingestion, compilation, retrieval, onboarding auto-ingest, event auto-ingest, and Seldon output auto-filing.

## Key Endpoints
- `POST /api/v1/soul/ingest`
  - Adds a source and triggers async compile.
  - Supports: `url`, `youtube`, `text`, `testimonial`.
  - Current guards:
    - valid source `type`
    - URL must be `http://` or `https://` for URL types
    - text/title max length clipping
    - per-org source cap (`MAX_SOURCES_PER_ORG = 500`)
- `GET /api/v1/soul/sources`
  - Returns org sources.
- `DELETE /api/v1/soul/sources`
  - Deletes a source by id.
- `GET /api/v1/soul/wiki`
  - Returns compiled wiki articles.
- `POST /api/v1/soul/wiki`
  - Triggers full recompilation for org.

## Core Runtime Flows
1. Manual ingest flow
   - API validates input and ingest limits.
   - Source normalized via `ingestSource(...)`.
   - Source inserted to `soul_sources` with `status = pending`.
   - Async compile kicks off via `compileSoulWiki(...)`.

2. Onboarding website auto-ingest flow
   - Setup wizard collects optional `websiteUrl`.
   - `installSoul(...)` calls onboarding seed helper.
   - Helper dedupes URL source for org, ingests website content, inserts source, triggers `incrementalCompile(...)`.

3. Event auto-ingest flow
   - CRM global listeners invoke `autoIngestSoulFromEvent(...)`.
   - Event resolved to org and transformed into source content.
   - Guardrails:
     - total event source cap per org (`MAX_EVENT_SOURCES_PER_ORG = 2000`)
     - per-day event source cap (`MAX_EVENT_SOURCES_PER_DAY = 120`)
     - event payload truncation (`MAX_EVENT_PAYLOAD_CHARS = 12000`)
   - New source triggers `incrementalCompile(...)`.

4. Seldon output auto-filing flow
   - After Seldon create/update result processing, successful results are filed as `type = output` in `soul_sources`.
   - Filed output includes user prompt, summary, and source metadata.
   - Each filed output triggers `incrementalCompile(...)`.

## Data Touchpoints
- Sources table: `soul_sources`
  - Ingest inputs, event snapshots, and Seldon outputs.
- Wiki table: `soul_wiki`
  - Category-scoped compiled articles with linked source ids.
- Pattern table: `seldon_patterns`
  - Anonymous aggregate behavior/outcome signal.

## AI/Env Requirements
- `ANTHROPIC_API_KEY` is required for compile/query behavior.
- Default model currently used in Soul Wiki compile/query paths:
  - `claude-sonnet-4-20250514`

## Safety and Failure Behavior
- Demo mode write guards are active on write routes/actions.
- Ingest/compile follow non-blocking behavior where possible.
- Onboarding auto-ingest and async compile fail closed (no onboarding crash).
- Event listeners use fire-and-forget with internal catch to avoid blocking primary product workflows.

## Verification Checklist (Post-Deploy)
1. Setup wizard
   - Enter website URL in setup and complete install.
   - Confirm one new URL source appears in `/settings/soul-wiki`.
2. Manual ingest
   - Add URL/text source and verify source appears.
   - Trigger recompile and verify wiki articles render.
3. Seldon retrieval
   - Run Seldon prompt and verify generated output reflects wiki context.
4. Event ingestion
   - Trigger a tracked event (`contact.created`, etc.).
   - Confirm an event source appears and compiles.
5. Output filing
   - Run a successful Seldon create/update.
   - Confirm an `output` source appears and compiles.
6. Guardrails
   - Validate invalid URL/type returns 400 from ingest route.
   - Validate caps stop additional ingest when limits are exceeded.

## Ownership Pointers
- Ingest route: `packages/crm/src/app/api/v1/soul/ingest/route.ts`
- Source route: `packages/crm/src/app/api/v1/soul/sources/route.ts`
- Wiki route: `packages/crm/src/app/api/v1/soul/wiki/route.ts`
- Ingest utils: `packages/crm/src/lib/soul-wiki/ingest.ts`
- Compile/query: `packages/crm/src/lib/soul-wiki/compile.ts`, `packages/crm/src/lib/soul-wiki/query.ts`
- Onboarding hook: `packages/crm/src/lib/soul/install.ts`, `packages/crm/src/components/soul/setup-wizard.tsx`
- Event auto-ingest/pattern capture: `packages/crm/src/lib/soul-wiki/event-auto-ingest.ts`, `packages/crm/src/lib/soul-wiki/pattern-capture.ts`
- Seldon output filing: `packages/crm/src/lib/soul-wiki/output-filing.ts`, `packages/crm/src/lib/ai/seldon-actions.ts`
