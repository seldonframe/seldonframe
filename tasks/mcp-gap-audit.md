# MCP tool-surface gap audit

**Phase 2 slice 2.a — output per `tasks/v1-master-plan.md §B`.**
**Date:** 2026-04-20
**Mode:** read-only audit. No code changes.

## Method

1. Enumerate current tools in `skills/mcp-server/src/tools.js` (exports).
2. Enumerate v1 write endpoints under `packages/crm/src/app/api/v1/**/route.ts`.
3. Enumerate dashboard write-action surfaces under `packages/crm/src/app/(dashboard)/**`.
4. Cross-reference: every dashboard action → does an MCP tool exist that can do the same thing?
5. Identify gaps, duplicates, and anti-patterns.

## Current tool inventory (22 tools in `seldonframe` MCP namespace)

| Tool | Domain | Shape | Comment |
|---|---|---|---|
| `create_workspace` | workspace | write | anonymous-safe, returns bearer |
| `list_workspaces` | workspace | read | |
| `switch_workspace` | workspace | write | client-side active-org cookie |
| `clone_workspace` | workspace | write | copies blocks + soul |
| `link_workspace_owner` | workspace | write | claim flow + magic link |
| `revoke_bearer` | workspace | write | bearer rotation |
| `update_landing_content` | landing | write | headline/subhead/cta |
| `customize_intake_form` | intake | write | replaces fields whole-cloth |
| `configure_booking` | booking | write | title/duration/description |
| `update_theme` | theme | write | mode/primary/accent/font |
| `list_automations` | automation | read | soul-derived list |
| `install_vertical_pack` | blocks | write | pack installer |
| `install_caldiy_booking` | blocks | write | block installer + template seed |
| `install_formbricks_intake` | blocks | write | block installer + template seed |
| `get_workspace_snapshot` | workspace | read | JSON dump of state |
| `fetch_source_for_soul` | soul | read | scrape URL |
| `submit_soul` | soul | write | full soul replace |
| `connect_custom_domain` | domains | write | Vercel add-domain |
| `export_agent` | export | read | Claude-code skill export |
| `store_secret` | secrets | write | workspace-scoped BYO key |
| `list_secrets` | secrets | read | no values returned |
| `rotate_secret` | secrets | write | |

## Gap analysis by domain

### CRM — contacts (**gap: 0 write tools in MCP today**)

Dashboard actions that exist:
- Create contact at `/contacts/new` → POST `/api/v1/contacts` (endpoint exists)
- Edit contact at `/contacts/[id]` → PATCH `/api/v1/contacts/[id]` (endpoint exists)
- Delete contact → DELETE `/api/v1/contacts/[id]` (endpoint exists)
- Inline-edit stage in TableView → `updateContactFieldAction` server-action
- Import via CSV → `/contacts?import=csv` flow
- Add note / activity → POST `/api/v1/activities`

**Missing MCP tools:**
- `create_contact({ firstName, lastName?, email?, phone?, stage?, ... })`
- `update_contact({ contactId, patch })`
- `delete_contact({ contactId })`
- `list_contacts({ stage?, search?, limit?, offset? })`
- `get_contact({ contactId, include?: ["activities","deals","bookings"] })`
- `import_contacts_csv({ csv, mapping })` — stretch; CSV stays dashboard-only if too complex
- `add_contact_note({ contactId, body })`

### CRM — deals (**gap: 0 write tools in MCP today**)

Dashboard actions that exist:
- Create deal at `/deals/pipeline` (CreateDealForm) → POST `/api/v1/deals`
- Move stage via Kanban drag → `moveDealStageAction` server-action + PATCH `/api/v1/deals/[id]`
- Edit deal → PATCH `/api/v1/deals/[id]`
- Delete deal → DELETE `/api/v1/deals/[id]`

**Missing MCP tools:**
- `create_deal({ contactId, title, value?, currency?, stage?, pipelineId? })`
- `move_deal_stage({ dealId, toStage })` — the one the kanban calls
- `update_deal({ dealId, patch })`
- `delete_deal({ dealId })`
- `list_deals({ stage?, pipeline?, contactId?, minValue?, maxValue?, limit? })`
- `get_deal({ dealId, include?: ["contact","activities"] })`

### CRM — pipelines (**gap: no MCP tools at all**)

- `list_pipelines()`
- `create_pipeline({ name, stages: [{name, color, probability}] })`
- `update_pipeline_stages({ pipelineId, stages })`

Low priority — builders rarely need a second pipeline. Ship after Phase 11 if demand emerges.

### CRM — activities

- `list_activities({ contactId?, dealId?, type?, limit? })`
- `create_activity({ type, contactId?, dealId?, body?, scheduledAt? })`
- `complete_activity({ activityId })`

### Booking

Current MCP has `configure_booking` (title/duration/description on the default template) + `install_caldiy_booking`. That's the block config, not the appointment-type surface.

**Missing:**
- `create_appointment_type({ title, durationMinutes, price?, description?, bufferBeforeMinutes?, bufferAfterMinutes?, maxBookingsPerDay? })` — mirrors the `/bookings` admin Create Type drawer.
- `update_appointment_type({ bookingSlug, patch })`
- `delete_appointment_type({ bookingSlug })`
- `list_appointment_types()`
- `list_bookings({ status?, fromDate?, toDate?, contactId? })`
- `cancel_booking({ bookingId, reason? })`
- `reschedule_booking({ bookingId, newStartsAt })` — relevant even before Phase 3's Cal.com-style reschedule links

### Intake forms

`customize_intake_form` exists but replaces fields whole-cloth and only operates on the workspace's default form. No multi-form support.

**Missing:**
- `create_form({ name, slug, templateId?, fields? })` — uses the 6 templates shipped in 0.5.e.
- `list_forms()`
- `get_form({ formSlug })`
- `update_form({ formSlug, patch })` — changes name, slug, fields incrementally
- `add_form_field({ formSlug, field, insertAt? })`
- `remove_form_field({ formSlug, key })`
- `publish_form({ formSlug, published })` — toggles `isActive`
- `list_submissions({ formSlug, limit?, since? })`
- `get_submission({ submissionId })`

### Landing pages

`update_landing_content` exists — only handles headline/subhead/cta_label on the default `home` page. No multi-page support, no section editing, no Puck JSON round-trip.

**Missing** (defer most to Phase 6 when landing is re-scoped):
- `list_pages()`
- `get_page({ pageSlug })`
- `publish_page({ pageSlug, published })`
- Rich edit tools deferred to Phase 6 + Phase 11.

### Automation

Only `list_automations` exists (read). No edit surface.

Per the brief's Phase 7 scope, complex edits route through Claude Code (= MCP) while light edits are dashboard forms. So the MCP tool surface for automations is the **primary** authoring surface for complex workflows.

**Missing** (these are Phase 11, but listing here for future slice):
- `create_automation({ soulStage, trigger, steps: [{type, config}] })`
- `update_automation({ automationId, patch })`
- `toggle_automation({ automationId, enabled })`
- `delete_automation({ automationId })`
- `run_automation_test({ automationId, sampleInput })` — simulate a run

### Email / SMS / Payments / Integrations

Deferred to Phase 11. Not audited here (Phase 2 scope = existing blocks only).

## Duplicates / anti-patterns noticed

1. **`customize_intake_form` hardcodes the default form** — every workspace has a `home` intake at slug="intake" and this tool only touches that one. Should be deprecated in favor of `update_form({ formSlug })` with optional default-form behavior when `formSlug` omitted.
2. **`configure_booking` similarly hardcodes the default "Book a call" template** — same issue. Should become `update_appointment_type({ bookingSlug="default" })` with a sensible default.
3. **`update_landing_content` hardcodes the `home` page** — same issue, same fix: `update_page({ pageSlug="home" })`.
4. **No dry-run mode on any write tool** — D-7 mitigation from v1-master-plan §D. Phase 2.e adds this as a wrapper; must keep the contract consistent across all write tools (every write tool accepts `{ dry_run: bool }`).

## Count summary

**Current: 22 tools. 13 write + 9 read.**

**Gap count for Phase 2 (existing blocks — CRM + Booking + Intake):**

| Domain | New tools | Refactors (unify + dep default) |
|---|---|---|
| CRM contacts | 6 | — |
| CRM deals | 5 | — |
| CRM pipelines | 3 | — |
| CRM activities | 3 | — |
| Booking | 7 | `configure_booking` → `update_appointment_type` |
| Intake forms | 9 | `customize_intake_form` → `update_form` |
| Landing (Phase 2 subset) | 3 | `update_landing_content` → `update_page` |
| **Phase 2 total** | **36 new** | **3 refactors** |

(Automation, pipelines sub-grouping, and CSV-import-tool are stretch — defer if cost escalates.)

## Recommended slice decomposition for Phase 2.b–d

Per v1-master-plan §B, Phase 2 slices were sketched as:
- 2.b — CRM MCP tools (contacts + deals + activities)
- 2.c — Booking MCP tools
- 2.d — Intake MCP tools
- 2.e — Dry-run mode wrapper (D-7 mitigation)

This audit confirms that decomposition is correct. Concrete next:

- **2.b (CRM MCP tools)** — 14 new tools: 6 contacts + 5 deals + 3 activities. Refactor `update_landing_content` scope-unify belongs in 2.d. Deferred: pipelines sub-group (3 tools) until Phase 11 demand.
- **2.c (Booking MCP tools)** — 7 new tools + `configure_booking` → `update_appointment_type` refactor. Preserve `configure_booking` as a thin alias for one release so in-flight MCP calls don't break.
- **2.d (Intake MCP tools)** — 9 new tools + `customize_intake_form` → `update_form` refactor + `update_landing_content` → `update_page` refactor. Preserve the old aliases as in 2.c.
- **2.e (Dry-run mode)** — wrapper pattern added to the server, every new 2.b/2.c/2.d write tool accepts `{ dry_run: true }`. Returns what it would do, no DB writes.

## Naming conventions locked for Phase 2+

To mitigate D-7 (tool overload at 50+ tools) proactively:

| Shape | Pattern | Examples |
|---|---|---|
| Read list | `list_<noun>` | `list_contacts`, `list_deals` |
| Read single | `get_<noun>` | `get_contact`, `get_deal` |
| Create | `create_<noun>` | `create_contact`, `create_deal` |
| Update | `update_<noun>` | `update_contact`, `update_deal` |
| Delete | `delete_<noun>` | `delete_contact` |
| State change | `<verb>_<noun>` | `move_deal_stage`, `cancel_booking`, `publish_form`, `toggle_automation` |
| Sub-resource | `<verb>_<parent>_<child>` | `add_contact_note`, `add_form_field`, `remove_form_field` |

All write tools take a stable-shape payload `{ ...fields, dry_run?: boolean, workspace_id?: string }`. `workspace_id` optional for user-identity calls that manage multiple workspaces; required only when the caller isn't a workspace bearer.

## Unblocks

- Phase 2.b–d can start immediately against this gap list.
- Phase 11 (cross-block MCP for new blocks) inherits the naming conventions defined here; Phase 11 kickoff re-evaluates D-7 tool-count topology per `v1-master-plan §A Phase 11`.

## Not in scope for this audit

- Read-tool coverage beyond what's already good enough. The current reads (`list_workspaces`, `get_workspace_snapshot`, `list_automations`, `list_secrets`) cover discovery; Phase 2 focuses on write gaps.
- Permission model per tool — inherited from `resolveV1Identity` + `resolveOrgIdForWrite` server-side. Tools don't need per-tool ACL.
- Rate limiting — server endpoints already handle this; MCP tools are thin wrappers.
