# RunContext architecture

**Status:** Live (shipped 2026-05-19, Phases 0-7 of the implementation plan)
**Spec:** `docs/superpowers/specs/2026-05-19-runcontext-architecture-design.md`
**Plan:** `docs/superpowers/plans/2026-05-19-runcontext-architecture.md`

## The 30-second pitch

Every workflow run carries an identity snapshot — `RunContext` — stamped at `startRun()` and persisted on `workflow_runs.context`. Every downstream step reads from it. Customer name, workspace name, today's date, source event — single source of truth.

Without RunContext, each step looked up identity independently. They disagreed. The dogfood sessions of 2026-05-18 → 2026-05-19 produced 7 distinct bugs that all collapsed onto that one architectural flaw.

## Reading the type

`lib/workflow/run-context.ts` — the canonical shape.

`lib/workflow/run-context-customer.ts` — `CustomerRunContext = Omit<RunContext, "agency">`. Customer-facing surfaces (tool invokers, email branding, SMS routing) import this. They cannot leak agency identity into customer comms because the field doesn't exist on the type.

`lib/workflow/run-context-admin.ts` — full shape, used only by the dashboard render pipeline.

## Where it gets stamped

`runtime.startRun` (in `lib/workflow/runtime.ts`) calls `buildRunContext()` which:

1. Loads workspace + soul + theme + (optional active partner agency) from DB.
2. Resolves customer identity from the trigger payload (`resolveCustomerFromTriggerPayload` — pure, no DB).
3. Builds clock in workspace timezone.
4. Persists onto `workflow_runs.context`.

For runs created before Phase 1 shipped (no context column), `loadRunContext()` rebuilds lazily on first read.

## Where it gets read

Every step dispatcher receives `runContext: CustomerRunContext` as the 4th parameter:

```ts
async function dispatchXxx(run, step, context, runContext) {
  // ...
}
```

`mcp-tool-call` forwards it to the tool invoker, which forwards it to each tool handler. `send_sms`, `send_email`, `create_booking`, `create_activity` all read `runContext.customer.*` as the source of truth — never re-query the contacts table mid-run.

## The "clock" refresh

`loadRunContext()` re-stamps the `clock` field on EVERY call (not just at run start). Long-paused conversations (next-day reply) see accurate "today" / "tomorrow" without re-querying workspace data.

Other fields (customer, workspace, agency) snapshot once at startRun and don't refresh.

## Adding a new archetype — checklist

1. Define the archetype in `lib/agents/archetypes/<name>.ts`.
2. For each `kind: "user_input"` placeholder, include a sensible `example` value. Empty `example` = hard-required (synthesis throws if missing). Non-empty `example` = optional with default. Operator-edit story: leave $formId without example (must be set), leave $maxTurns WITH example (operator can override or accept the default).
3. For tool calls inside the spec, prefer `{{interpolation}}` for fields that come from RunContext (e.g., `contact_id: "{{contactId}}"`). The interpolator reads from variableScope which is seeded from runContext at startRun. For fields the LLM extracts mid-conversation (e.g., `starts_at: "{{preferred_start}}"`), the conversation step's `on_exit.extract` schema must declare the field.
4. Use `parseInWorkspaceTimezone(iso, runContext.workspace.timezone)` whenever parsing an LLM-emitted date string. Never `new Date(naiveIso)`.
5. Booking creation MUST go through `createBookingForCustomer` (in `lib/bookings/create-for-customer.ts`) — the shared helper used by both the public booking page AND agent tools. Don't write your own booking insert.

## The Karpathy frame

Harness (immutable code) handles plumbing: RunContext resolution, predicate eval, tool signatures, exit-block parsing, persistence, idempotency, date grounding.

Prose (operator-editable archetype placeholders): opener tone, qualification criteria, forbidden-phrase list, tool-error hints, max turns, brand voice. Operators edit at `/automations/[id]/configure`.

When Claude N+1 ships, the prose gets smarter — no code change. The `tests/integration/antifragility-model-bump.spec.ts` test pins the contract: future model bumps must not break the extraction shape.

## Operator-facing surfaces

- `/automations/[id]/runs` — every run's expanded drawer shows the RunContext snapshot (customer + workspace + clock + source) the agent saw at run-start. Debugging surface.
- `/automations/[id]/configure` — operator edits placeholders. Live preview shows the fully-resolved system prompt with sample placeholders filled. Config-history panel lets the operator revert a bad edit with one click.

## What this architecture explicitly does NOT do

- Cross-workspace identity sharing — each workspace's contacts are siloed by `org_id`. The Rain Pros leak from May 2026 was stale dogfood test data, not a code-level cross-contamination.
- Multi-language i18n — English + IANA TZ only.
- Streaming LLM responses — the conversation engine batches one Claude call per inbound SMS.
- trace_id propagation across the event bus — deferred. RunContext gives us identity observability; trace propagation is a future phase.
