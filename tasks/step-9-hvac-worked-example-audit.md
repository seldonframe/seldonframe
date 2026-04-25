# SLICE 9 Audit — HVAC Arizona worked example + composability validation

**Date:** 2026-04-25
**Predecessor:** SLICE 8 (workspace test mode), closed in commit `5b06c7cf` (Vercel-verified).
**Drafted by:** Claude Opus 4.7 against HEAD (branch `claude/fervent-hermann-84055b`).

**Shape note:** SLICE 9 is the capstone — composition + polish, not new primitives. The audit's calibration math inverts: less LOC for new functionality, more LOC for hand-curated content + polish + documentation. Where prior slices' L-17 multipliers predicted test/prod ratios for new code, SLICE 9's success metric is "do shipped primitives compose into a real product?"

---

## §1 Scenario specification

### 1.1 Fictional business: **Desert Cool HVAC** (Phoenix, AZ)

- **Name:** Desert Cool HVAC
- **Location:** Phoenix metro area, Arizona (service radius ~40mi)
- **Size:** 14 technicians, 2 office staff, 1 owner-operator (mid-SMB ICP)
- **Services offered:**
  - Emergency AC repair (24/7 on-call rotation, summer-critical)
  - Scheduled maintenance (twice-yearly tune-ups: spring + fall)
  - New install jobs (residential AC/furnace replacement, multi-day)
  - Warranty / service-contract management
- **Customer base:** ~1,800 active residential + ~120 commercial accounts
- **Revenue mix:** ~60% maintenance + repair, ~30% installs, ~10% commercial contracts
- **Operations rhythm:**
  - Summer (May-Sep): emergency calls dominate; 4-6 hour SLA expected
  - Winter (Nov-Feb): proactive maintenance + furnace work
  - Shoulder (Mar-Apr, Oct): pre-season campaigns + install jobs

### 1.2 Why HVAC Arizona specifically (per Max's spec)

- **High-stakes seasonality** — Phoenix summers reach 110°F+; AC failure is a genuine emergency, not a convenience
- **Realistic SMB ICP** — 14-tech business is the ideal builder profile: enough scale to need automation, small enough to operate without dedicated IT
- **Rich primitive workout** — every SLICE 5/6/7/8 primitive has an obvious HVAC use case (see §1.3)
- **Differentiated** from generic "appointment booking" demos that other agent platforms ship

### 1.3 Primitive coverage map

| Primitive | HVAC use case | Slice introduced |
|---|---|---|
| Event triggers | `booking.created` → install-job kickoff workflow | Pre-existing |
| Schedule triggers | Daily 6am: scan customers due for tune-up → batched outreach | SLICE 5 |
| Message triggers | Customer texts "EMERGENCY" → priority routing + SMS confirmation | SLICE 7 |
| Branch (predicate) | Branch on `customer.tier == "commercial"` → priority queue routing | SLICE 6 |
| Branch (external_state) | Heat-advisory check via NWS API → branch on temperature → cascade outreach | SLICE 6 |
| Subscriptions | `payment.completed` → wait 1 day → satisfaction SMS | SLICE 1 |
| Workspace test mode | Owner toggles test mode + tests new flow without dispatching to real customers | SLICE 8 |
| Soul state read/write | Read last-service date per customer; write equipment-confirmed status | SLICE 3 |
| Conversation runtime | Multi-turn SMS thread for emergency triage | SLICE 2c |
| Loop guard | Prevent runaway auto-reply on emergency confirmation | SLICE 7 PR 2 |

**10 primitives × 6 agent flows demonstrates the full composition surface.**

---

## §2 Ground-truth findings at HEAD

Verified by direct inspection at commit `5b06c7cf` (post-SLICE 8 close). Six dimensions covered. **The audit's headline finding: HVAC is greenfield + scaffolder is operational but unused-for-blocks + real-estate-agency vertical pack is the structural precedent + Summit Coaching demo is the hand-curated seed model.**

### §2.1 Scaffolder — operational, never used for blocks

[`packages/crm/src/lib/scaffolding/orchestrator.ts`](packages/crm/src/lib/scaffolding/orchestrator.ts) ships `scaffoldBlock(input)` that generates from a JSON `BlockSpec`:

- BLOCK.md (composition contract: produces / consumes / verbs / compose_with)
- tools.ts (MCP tool schemas + handlers stubs)
- Subscription handler stubs (per declared event)
- Test spec stub
- Admin schema + page TSX (per declared entity)
- Customer display view + action form TSX (per declared customer-facing surface)

**Status:** zero blocks currently bear scaffolder header comments — all 7 core blocks (`crm`, `caldiy-booking`, `email`, `sms`, `payments`, `formbricks-intake`, `landing-pages`) are hand-authored. The scaffolder is fully wired but has not been exercised on a real block creation. SLICE 9 is the **first production exercise of the scaffolder** for HVAC-specific blocks — important data point for the scaffolder's production readiness.

**Limitation:** the NL-to-BlockSpec intent parser is documented in scaffolder audit but not implemented. SLICE 9 must construct BlockSpec JSON manually (or via an interactive Claude Code session that emits JSON), then feed to the scaffolder CLI (`pnpm scaffold:block --spec hvac-equipment.json`).

### §2.2 Real-estate-agency vertical pack — the structural model

[`packages/crm/src/lib/openclaw/vertical-packs.ts:105-191`](packages/crm/src/lib/openclaw/vertical-packs.ts:105) — the only shipped vertical pack:

```typescript
{
  schema_version: "1.0",
  id: "real-estate-agency",
  industry: "real_estate",
  soul_hints: { audience_type, tone, tagline_suggestion },
  objects: [listing, showing, offer],          // 3 custom entities
  relations: [4 one-to-many relations],
  views: [3 views: table/calendar/kanban],
  permissions: [agent + end_client roles],
  workflows: [3 workflows — template-level, not implemented],
  block_ids: ["pages", "forms", "emails", "bookings"],
}
```

**Install path:** `POST /api/v1/verticals/install` → `installVerticalPack(orgId, pack)` → atomic Soul update + block enable + permission setup.

**SLICE 9 ships `hvac-arizona` as the second vertical pack** — same shape, hand-curated bundle. Objects: `equipment`, `service_call`, `technician`, `service_contract`. Relations: customer→equipment, customer→service_call, technician→service_call, equipment→service_call. Views: "Today's emergency queue" (table+priority), "This week's maintenance" (calendar), "Equipment due for service" (table+filter).

### §2.3 Summit Coaching demo seed — the data fixture model

[`packages/crm/src/db/seed-demo.ts`](packages/crm/src/db/seed-demo.ts) is 408 LOC creating:
- 1 org (Summit Coaching, pro plan, soulCompletedAt set)
- 1 owner user
- 8 hand-curated contacts (realistic names: Sarah Chen, Marcus Johnson, Elena Petrova, ...)
- 8 deals across 5 pipeline stages
- 8 activities (sessions, notes, calls, emails, tasks, meetings) with relative-date offsets
- 6 bookings (Zoom, mix of completed + scheduled)
- 7 emails (Resend, contextualized subjects, open/click counts)
- 2 landing pages (published, hero+benefits+testimonials+CTA)
- 1 intake form + 3 submissions
- 5 portal messages
- 6 portal resources

**Patterns:**
- All names + emails hand-typed (no Faker)
- Phone numbers absent (test mode handles SMS in dev)
- Timestamps use `daysAgo` / `daysOffset` math from `now`
- Soul tone fields populated inline (vocabulary, sample-phrases, avoid-words)

**SLICE 9 ships `seed-hvac-arizona.ts` modeled on this** — 1 org (Desert Cool HVAC), 1 owner, ~30 contacts (mix of residential + commercial, with HVAC-specific custom fields like equipment_type, install_date, last_service), ~12 active service calls, ~50 equipment records, ~14 technician users, ~25 portal messages.

### §2.4 Theme system — minimal but sufficient

[`packages/crm/src/lib/theme/types.ts`](packages/crm/src/lib/theme/types.ts):
- 6 fonts (Inter, DM Sans, Playfair Display, Space Grotesk, Lora, Outfit)
- primaryColor + accentColor (any hex)
- mode: light / dark
- borderRadius: sharp / rounded / pill
- logoUrl: optional

**Desert Cool HVAC theme proposal:**
- `primaryColor: "#dc2626"` (red — heat/urgency)
- `accentColor: "#0891b2"` (cyan — cooling/relief)
- `fontFamily: "Outfit"` (modern sans, conveys reliability)
- `mode: "light"` (HVAC technicians use phones in bright sunlight)
- `borderRadius: "rounded"`
- `logoUrl: "/seed/desert-cool-hvac-logo.png"` (small SVG fixture)

### §2.5 SLICE 4a admin composition — 7 reusable primitives

PageShell, EntityTable, EntityFormDrawer, BlockListPage, BlockDetailPage, ActivityFeed, CompositionCard. All Zod-schema-driven, server-component-by-default.

**HVAC entity views compose cleanly:**
- `/equipment` page = `<BlockListPage schema={EquipmentSchema} rows={...} />`
- `/equipment/[id]` page = `<BlockDetailPage tabs=[overview, service-history, customer]>`
- `/technicians` page = `<BlockListPage schema={TechnicianSchema} rows={...} />`
- Customer-detail page gets `<CompositionCard title="Equipment" schema={EquipmentSchema} rows={...}>` embed

### §2.6 SLICE 4b customer portal composition — 4 primitives

PortalLayout, CustomerLogin, CustomerDataView, CustomerActionForm. All themed via `--sf-*` CSS vars from PublicThemeProvider.

**Desert Cool customer portal compose:**
- Login: `<CustomerLogin>` (unchanged)
- Dashboard: 3-card overview (next service, equipment status, recent messages)
- Equipment page: `<CustomerDataView layout="cards" schema={EquipmentSchema}>`
- Service history: `<CustomerDataView layout="table">`
- Schedule maintenance: `<CustomerActionForm mode="multi" schema={ScheduleMaintenanceSchema}>`

### §2.7 Inherited vs net-new

| Surface | Status | Notes |
|---|---|---|
| Scaffolder | **Operational, unused for blocks** | SLICE 9 is first real exercise |
| Vertical pack system | **Inherited (real-estate model)** | `hvac-arizona` second pack, hand-curated like real-estate |
| Demo seed pattern | **Inherited (seed-demo.ts)** | `seed-hvac-arizona.ts` modeled on it |
| Theme system | **Inherited (organizations.theme)** | Per-workspace JSONB, sufficient for Desert Cool brand |
| Admin composition | **Inherited (SLICE 4a 7 primitives)** | All HVAC entity views compose |
| Customer portal | **Inherited (SLICE 4b 4 primitives)** | All HVAC customer surfaces compose |
| Test mode | **Inherited (SLICE 8)** | Operator iterates in test mode then ships (G-9-7) |
| All 6 trigger types | **Inherited** | event / schedule / message / external_state / subscription / manual |
| Loop guard | **Inherited (SLICE 7 PR 2)** | Auto-reply emergency loop prevention |
| HVAC-specific entities | **Net new** | equipment, service_call, technician, service_contract |
| HVAC archetypes (4-6 flows) | **Net new** | Hand-authored agent specs |
| HVAC seed data | **Net new** | ~110 entity rows hand-curated |
| HVAC vertical pack manifest | **Net new** | Mirror real-estate-agency shape |
| Sidebar navigation entries | **Net new (manual)** | Sidebar is hardcoded; no block-driven nav yet |
| Documentation + launch artifacts | **Net new** | Markdown + screenshot fixtures |

---

## §3 Composability validation criteria

Per Max's §2 spec: SLICE 9's success isn't "primitives work" but "primitives compose without unexpected interactions."

### 3.1 Primitive interactions that must demonstrate clean composition

For each agent flow in §4, the audit asserts these interactions work end-to-end:

1. **Trigger → Soul read → branch → action**: scheduled trigger fires → agent reads Soul state (last_service date) → branches on threshold → emits SMS
2. **External state → conditional cascade**: weather API check → branch on temperature → vulnerable-customer outreach
3. **Subscription chain**: `payment.completed` → satisfaction SMS → branch on response → review request OR support escalation
4. **Message trigger → loop guard → multi-turn conversation**: customer texts "EMERGENCY" → priority routing → loop-guard prevents reply storm → multi-turn triage
5. **Test mode + observability**: owner toggles test mode → all 6 flows route to sandbox → workflow_event_log shows `payload.testMode: true` tags → /agents/runs distinguishes test vs live runs

### 3.2 Failure-mode composition

Equally important — the audit asserts these failure modes are handled:

1. **Provider failure mid-flow**: Twilio fails inside a multi-step flow → does the run mark failed cleanly + observability surfaces it?
2. **External API timeout**: weather API 5xx → does external_state branch use `false_on_timeout` → fallback path?
3. **Concurrent triggers**: 5 emergency calls in 30 seconds → does dispatcher handle correctly + loop guard works per conversation?
4. **Stale Soul state**: agent reads last_service date that's >2 years old → does the workflow handle the data-skew case?

These edge cases are first-class in the integration tests (G-9-2).

---

## §4 Required agent flows — 6 archetypes

**G-9-3 decision: lock at 6 archetypes** (Max suggested 4-6 range; 6 maximizes primitive coverage without over-scoping).

### 4.1 `hvac-emergency-triage` — message trigger + loop guard

- **Trigger:** message (sms, contains "EMERGENCY" / "URGENT" / case-insensitive)
- **Steps:**
  1. read_state — lookup customer's tier (residential/commercial)
  2. branch (predicate: `customer.tier == "commercial"`) → on_match=priority queue, on_no_match=normal queue
  3. send_sms — confirmation: "Got your emergency. Tech dispatched. ETA 2 hours. Reply CONFIRM if still urgent."
  4. await_event (sms.received from same contact, timeout 1hr) → on_resume=mark_high_priority, on_timeout=auto_dispatch
- **Edge cases:** loop guard prevents reply storm if customer keeps texting; no-tier-data path
- **Primitives exercised:** message trigger, read_state, branch (predicate), send_sms, await_event, loop guard

### 4.2 `hvac-pre-season-maintenance` — schedule trigger + Soul query + batched outreach

- **Trigger:** schedule (cron `0 6 * * *` America/Phoenix — 6am daily)
- **Steps:**
  1. read_state — query customers with `last_service_at < now() - 6mo` AND `tier != "commercial"`
  2. mcp_tool_call — `list_due_customers` returns batched candidates
  3. wait — natural delay 30s between batches to avoid Twilio burst limits
  4. mcp_tool_call — `send_sms` per customer ("Time for your AC tune-up — reply YES to schedule")
- **Edge cases:** empty-data day (no due customers); seasonal mode toggle
- **Primitives exercised:** schedule trigger, read_state, mcp_tool_call, wait

### 4.3 `hvac-heat-advisory-outreach` — external_state branch + cascade

- **Trigger:** schedule (cron `0 5 * * *` — 5am daily)
- **Steps:**
  1. branch (external_state: GET NWS Phoenix forecast → `forecast.maxTempF >= 110`) → on_match=continue, on_no_match=end
  2. read_state — query "vulnerable" customers (elderly, no recent service, equipment >10 years old)
  3. send_sms (cascade) — "Heads up, 110°+ forecast tomorrow. Want a free AC check?"
- **Edge cases:** weather API timeout (`false_on_timeout=true` → end, retry tomorrow); empty vulnerable-customer list
- **Primitives exercised:** schedule trigger, branch (external_state), read_state, send_sms

### 4.4 `hvac-post-service-followup` — subscription + conversation

- **Trigger:** subscription on `payment.completed` event (from payments block)
- **Steps:**
  1. wait 24 hours
  2. send_sms — "How was your service today? Reply 1-5 stars or any feedback."
  3. await_event (sms.received from same contact, timeout 7d) → on_resume=branch on rating, on_timeout=end
  4. branch (predicate: `rating >= 4`) → on_match=request review, on_no_match=escalate to support queue
- **Edge cases:** customer doesn't reply; rating "3" (boundary); reply with non-rating text
- **Primitives exercised:** subscription, wait, send_sms, await_event, branch (predicate)

### 4.5 `hvac-equipment-due-personalized` — Soul query + per-customer context

- **Trigger:** schedule (cron `0 7 * * 1` — 7am Mondays)
- **Steps:**
  1. read_state — query equipment records due for service in next 14 days, joined to customer
  2. branch (predicate: equipment exists) → continue
  3. write_state — mark equipment as `outreach_pending`
  4. mcp_tool_call — `send_sms` with equipment-specific copy ("Your 2018 Trane XR16 is due for a tune-up. Reply YES to schedule.")
- **Edge cases:** equipment with no contact (orphan); contact opted out (suppression handled at send level)
- **Primitives exercised:** schedule trigger, read_state, branch, write_state, mcp_tool_call

### 4.6 `hvac-install-job-coordination` — booking + multi-step

- **Trigger:** event `booking.created` (filtered to install-type appointments)
- **Steps:**
  1. read_state — load customer + equipment-to-install details
  2. send_email — confirmation w/ install details + 2-day-prior reminder schedule
  3. wait until 2 days before install
  4. send_sms reminder
  5. wait until install day
  6. mcp_tool_call — create portal_message: "Tech arriving today between 9-11am. Photos uploaded post-install."
  7. await_event `booking.completed` → emit `payment.expected` event for downstream payment-followup chain
- **Edge cases:** customer reschedules mid-chain; install-day weather event; tech no-show
- **Primitives exercised:** event trigger, read_state, send_email, wait, send_sms, mcp_tool_call (portal), await_event, emit_event

---

## §5 Polish criteria per surface

### 5.1 Admin UI quality bar

**Required HVAC-specific entity views:**
- Customers list (extend existing contacts) — adds equipment_count, last_service_date, tier columns
- Equipment list (new `/equipment` page) — type, install_date, last_service_at, customer link
- Service Calls list (new `/service-calls` page) — priority, status, technician, customer, scheduled_at
- Technicians list (new `/technicians` page) — name, on_call_today flag, current_assignment, service_area
- Operational dashboard at `/dashboard` — "Today's emergency queue" + "This week's installs" + "Maintenance due this month"

**Composition discipline:**
- All entity views use `<BlockListPage>` (composes PageShell + EntityTable)
- All detail pages use `<BlockDetailPage>` with tabs
- Cross-entity embeds use `<CompositionCard>` (e.g., "Recent Service" card on customer detail)
- Mobile breakpoints functional (technicians use phones in field) — verify Tailwind `sm:`, `md:` breakpoints working

### 5.2 Customer-facing portal quality bar

**Customer surfaces themed for Desert Cool HVAC:**
- Logo: small SVG fixture
- Theme: red/cyan (heat/cool) per §2.4
- Portal pages:
  - Login (`<CustomerLogin>`)
  - Dashboard (3-card overview: next service, equipment status, recent messages)
  - My Equipment (list with service due dates)
  - Service History (table)
  - Schedule Maintenance (`<CustomerActionForm mode="multi">`)
  - Messages

**Composition discipline:**
- All surfaces wrap in `PortalLayout`
- All forms use `<CustomerActionForm>`
- All entity lists use `<CustomerDataView layout="cards">` for customer-friendliness
- Themed via `--sf-*` CSS vars (no hard-coded brand colors)

### 5.3 Observability quality bar

- `/agents/runs` shows realistic HVAC traffic patterns (not all green; failure runs visible too)
- Trigger types visible (event / schedule / message / subscription badges per run)
- Test events distinguishable from live (per SLICE 8 G-8-5 tag)
- Cost attribution visible if `seldon_usage` shows demo workspace activity

---

## §6 Natural-language scaffolding documentation

Per Max's §5 spec — for each block scaffolded in SLICE 9:

### 6.1 Documentation template per block

```markdown
## Block: hvac-equipment

**NL prompt** (what the operator described):
"I need a block that tracks HVAC equipment installed at customer sites.
Each piece of equipment has a type (AC unit, furnace, heat pump, boiler),
brand + model, serial number, install date, last service date, and
warranty expiration. The block should let me list all equipment, view
equipment per customer, and update last_service_at after a tune-up."

**BlockSpec** (handed to scaffolder, see hvac-equipment.spec.json):
[file content]

**Scaffolder output**: 6 files generated (BLOCK.md, tools.ts, equipment.schema.ts,
equipment.page.tsx, equipment.view.tsx, equipment.spec.ts).

**What scaffolded vs hand-edited:**
- Scaffolded ✅: BLOCK.md composition contract, tool schemas, admin page shell,
  customer view shell, test stubs
- Hand-edited (§reasons):
  - tools.ts handler bodies (HVAC-specific business logic — equipment lookup
    by serial, warranty validation)
  - equipment.page.tsx custom column renderer (tonnage formatter)
  - subscription handler `onPaymentCompleted` (writes last_service_at + emits
    follow-up event)

**Failures encountered**: (e.g., scaffolder rejected my first BlockSpec because
event names had hyphens instead of dots — fixed and re-ran)

**Time end-to-end**: ~25 min (scaffolder + hand-edits + tests).
```

This becomes **launch content** directly: "Here's how an agency operator builds an HVAC business automation in SeldonFrame in [N hours]."

### 6.2 Estimate: ~3-5 blocks scaffolded for HVAC

- `hvac-equipment` (entities + tools)
- `hvac-service-calls` (entities + tools)
- `hvac-technicians` (entities + tools)
- `hvac-service-contracts` (optional — could roll into customers tier field)
- `hvac-warranty` (optional — could roll into equipment record)

**G-9-1 decides** scaffolded vs hand-authored split. Recommend: scaffold 3 (equipment, service-calls, technicians) + hand-author 0 net-new blocks (HVAC archetypes consume existing primitives + the 3 scaffolded blocks).

---

## §7 Edge case inventory

Per Max's §6 spec. Each must be visibly handled in the worked example.

| Edge case | Where surfaced | How handled |
|---|---|---|
| Twilio SMS provider 5xx | hvac-pre-season-maintenance batched outreach | retry policy + emit failure event; visible in /agents/runs |
| Resend email provider 4xx | hvac-install-job-coordination confirmation | error logged + activity row marked failed |
| Weather API timeout | hvac-heat-advisory-outreach | branch.condition.timeout_behavior = "false_on_timeout" → end |
| Customer reply CONFIRM | hvac-emergency-triage | message trigger pattern matches; await_event resumes |
| Customer reply RESCHEDULE | hvac-equipment-due-personalized | falls through to support queue (no specific archetype handles; manual triage) |
| Customer reply STOP | (any flow) | suppression list (existing infra); next sends auto-suppressed |
| Customer reply unrecognized | hvac-emergency-triage await_event | conversation runtime fallback to Soul-aware reply |
| Empty data: no customers due | hvac-pre-season-maintenance | branch detects empty; emits `outreach.skipped` event; no SMS sent |
| Empty data: no emergencies | dashboard | "No active emergencies" empty-state in queue view |
| Concurrent triggers (2 emergency calls) | hvac-emergency-triage | dispatcher handles per-fire idempotency; loop guard per conversation |
| Test mode behavior | every flow | operator toggles test mode → all sends route to sandbox; banner visible; events tagged |

**G-9-2 decides** test depth: smoke tests (flow runs end-to-end on happy path) vs integration (covers main edge cases) vs full coverage (every edge × every flow).

**Recommendation: integration depth.** Smoke is too thin for a capstone; full coverage is exponential and risks scope creep. Integration = each flow has 2-4 tests covering the most likely failure modes.

---

## §8 Success demonstration (close-out artifacts)

At SLICE 9 close, the artifacts demonstrating success:

1. **End-to-end run of each archetype** — workflow_event_log trace per flow showing primitive composition
2. **Visual screenshots** — admin dashboard, customer portal, agent run detail view (Desert Cool HVAC themed)
3. **Sample workflow_event_log traces** — JSON exports showing primitives composing cleanly
4. **Working scaffold-to-deploy journey** — markdown doc per scaffolded block (§6)
5. **Edge case handling verified** — test outcomes per §7 inventory
6. **No new probe baselines** — SLICE 9 doesn't introduce new archetypes for synthesis testing; it composes existing primitives

**No 18-probe regression required at C7** — SLICE 9 changes zero archetype files in `packages/crm/src/lib/agents/archetypes/`. The 6 HVAC archetypes are workspace-installed (via the vertical pack), not registry-installed. **Confirm at audit-time:** the 6 HVAC archetypes do NOT register in the global archetype registry — they're scoped to the Desert Cool HVAC workspace (and any future HVAC vertical install). This avoids polluting the streak baselines with workspace-specific archetypes.

If gates resolve to register the 6 HVAC archetypes globally, full 30-probe regression (10 archetypes × 3 runs) lands at C7.

---

## §9 Launch content harvest

Per Max's §8 spec. Marketing-usable artifacts coming out of SLICE 9:

| Artifact | Estimate LOC | Format |
|---|---|---|
| Demo video script (5-8 min) | ~250-350 | Markdown |
| Screenshots (admin + customer surfaces) | — | PNG fixtures (~6-10 screenshots) |
| Documentation: "Building HVAC automation in SeldonFrame" | ~600-1000 | Markdown |
| Scaffolding transcript (Claude Code session) | ~400-800 | Markdown |
| Vertical pack JSON (`hvac-arizona`) | ~250-400 | JSON manifest |
| Comparison framing vs LangGraph/CrewAI | ~150-300 | Markdown (qualitative; G-9-6 decides) |
| **Total artifacts** | **~1,650-2,850 LOC** | Mix of MD + JSON + binary fixtures |

**G-9-5 decides** documentation format (markdown only? + video script? + screenshots?). Recommend: all three. Demo video script becomes either content for a recorded video OR doubles as a structured walkthrough doc.

---

## §10 LOC projection (calibration applied)

### 10.1 Per-component estimates

Production code:

| Component | Prod LOC | Reasoning |
|---|---|---|
| Scaffolded blocks (3): equipment, service-calls, technicians | 600-900 | ~200-300 LOC each from scaffolder output (BLOCK.md + tools.ts + admin schema/page + customer view/form + test stub); some hand-edits per §6.1 |
| HVAC archetype JSON (6 flows) | 600-900 | ~100-150 LOC per archetype (similar to weather-aware-booking 174 LOC + appointment-confirm-sms 128 LOC) |
| `hvac-arizona` vertical pack manifest | 250-400 | Mirror real-estate-agency pack (~190 LOC) + 6 HVAC entities + workflows |
| `seed-hvac-arizona.ts` | 400-600 | Modeled on seed-demo.ts (408 LOC); ~30 contacts + 50 equipment + 14 technicians + service history |
| Theme + branding fixtures | 50-100 | Theme JSON + small SVG logo |
| Polish work on admin entity views (HVAC-specific renderers, dashboards) | 300-500 | Composition over SLICE 4a primitives; per-entity custom column renderers |
| Customer portal HVAC surfaces | 200-400 | Composition over SLICE 4b primitives; equipment cards, service history table |
| Sidebar nav + dashboard route additions | 50-100 | Hardcoded nav entries + dashboard widget composition |
| Edge case handling in archetypes | 100-200 | Per §7, mostly inline in archetype steps |
| **Production subtotal** | **~2,550-4,100** | Wide range due to scaffolder uncertainty |

Test code (per L-17 calibrated multipliers):

| Component | Test LOC | Multiplier basis |
|---|---|---|
| Scaffolded blocks (test stubs from scaffolder) | 200-400 | Auto-generated; light coverage; supplemented by integration tests |
| HVAC archetype tests (6 flows) | 600-900 | ~100-150 LOC per archetype (similar to existing archetype unit tests) |
| Vertical pack install test | 80-150 | Mirror real-estate install test pattern |
| Seed integrity test | 60-100 | Verify seed data shape + relations |
| Edge case integration tests (per §7 + G-9-2 = integration depth) | 400-800 | ~30-60 LOC per edge × 12 edges |
| Theme + UI smoke tests | 50-100 | Snapshot / shape checks |
| **Test subtotal** | **~1,390-2,450** | |

Documentation / artifacts (§9):

| Item | LOC |
|---|---|
| Audit (this doc) | 800 |
| Per-block scaffolding transcripts (3 × ~150) | 450 |
| Worked example documentation | 800 |
| Demo video script | 300 |
| Comparison framing | 200 |
| Close-out report | 250 |
| **Doc subtotal** | **~2,800** |

### 10.2 Total + envelope check

- **Production:** 2,550-4,100
- **Tests:** 1,390-2,450
- **Code total:** 3,940-6,550
- **+ Docs/artifacts:** 2,800
- **Combined:** 6,740-9,350

Comparison to Max's projection (1,500-2,500 code + 1,000-2,000 docs):

**Code total upper estimate (6,550) materially exceeds Max's upper bound (2,500) — 162% over.** This is a real audit-time flag.

**Drivers of overshoot:**
1. **Scaffolded blocks are larger than Max's projection assumed** — scaffolder produces ~250 LOC per block × 3 blocks = ~750 prod LOC alone
2. **6 archetype JSONs at 100-150 LOC each = 900 LOC** — Max's projection of "150-300 LOC" per archetype was high-end-of-range; actual archetype JSONs are smaller but the 6-flow count drives total up
3. **Seed data fixture (400-600 LOC)** — modeled honestly on seed-demo.ts (408 LOC for the simpler coaching scenario; HVAC has more entity types)
4. **Edge case integration tests are 400-800 LOC** — direct per-§7 enumeration

**Stop-and-reassess trigger** per Max: 30% over upper code projection (2,500 × 1.3 = 3,250). Code total 3,940-6,550 → **lower bound is already 21% over trigger; upper bound is 102% over trigger.**

### 10.3 Audit-time flag with explicit decision framing

**Per L-17 audit-time trigger overshoot rule:** when projection exceeds the stop-trigger at audit time, surface explicitly with options for the gate decisions to tighten scope.

**Three scope-tightening levers, in increasing cost:**

**Lever A — Reduce archetype count from 6 → 4** (drop hvac-install-job-coordination + hvac-equipment-due-personalized):
- Saves ~300 LOC archetype + ~300 LOC tests
- Loses: install-job composition demo + per-customer-equipment personalization demo
- **Cost:** loses 2 of the most "real product" composition demos

**Lever B — Reduce scaffolded blocks from 3 → 2** (drop hvac-technicians; roll into customers as a tier):
- Saves ~250 LOC prod + ~100 LOC tests
- Loses: dedicated technicians entity view + dispatch routing semantics
- **Cost:** dilutes the "rich primitive workout" framing; technicians are thematically core to HVAC

**Lever C — Reduce seed data scope (30 contacts → 12, 50 equipment → 20, 14 techs → 6)**:
- Saves ~250 LOC seed
- Loses: realistic-feeling demo for screenshots
- **Cost:** demo looks thin; "polished" quality bar slips

**Lever D — Defer edge case integration tests to post-launch** (per G-9-2 set to smoke-only):
- Saves ~600 LOC tests
- Loses: empirical evidence that primitives compose under failure
- **Cost:** breaks SLICE 9's stated success criterion (composability validation)

**Recommendation:** **don't tighten.** SLICE 9's value is in the polish + empirical composability evidence. The 30% trigger is a heuristic — for a capstone validation slice, it should bend. **Decision option: ship at projected scope (~6,000-7,500 combined) and accept the audit-time overshoot in the close-out.**

If Max prefers tightening, **Lever A is least costly** (4 archetypes still demonstrate full primitive coverage; 2 dropped flows are nice-to-have, not essential).

---

## §11 Proposed PR split

Code total ~3,940-6,550 + docs ~2,800 = ~6,740-9,350 LOC. **Single-PR approach is risky** at this scale; recommend **2-PR split** even if Max's recommendation was single PR for prior slices.

### Recommended: 2-PR split

**PR 1 — Foundation (~3,000-4,500 LOC):**

- C0: Methodology updates (L-17 calibration, scaffolder-first-real-use, capstone-shape considerations) (~80 LOC doc)
- C1: HVAC vertical pack manifest + tests (~400 LOC)
- C2: Scaffolded blocks (equipment, service-calls, technicians) — invoke scaffolder, hand-edit, commit each block atomically (~900 LOC + ~250 LOC tests)
- C3: Theme + branding fixtures + Desert Cool HVAC org fixture (~150 LOC)
- C4: HVAC seed script (`seed-hvac-arizona.ts`) + tests (~600 LOC)
- C5: Sidebar nav + dashboard widget compositions for HVAC surfaces (~400 LOC + ~100 LOC tests)

**PR 2 — Archetypes + integration + close-out (~2,500-4,000 LOC):**

- C0: Methodology updates if any surface (~30 LOC doc)
- C1: 6 HVAC archetype JSONs + per-archetype unit tests (~1,500 LOC)
- C2: Per-flow integration tests covering edge cases per §7 (~800 LOC)
- C3: Customer portal HVAC surfaces (composition over SLICE 4b) + tests (~400 LOC)
- C4: Test-mode demonstration walkthrough (operator iterates in test mode then ships) — code + doc
- C5: Documentation harvest — scaffolding transcripts, worked example, demo video script, comparison framing (~1,500-2,500 LOC docs)
- C6: SLICE 9 close-out + Vercel preview verified per L-27

### Alternative: single PR with Lever A scope tightening

If Max prefers single PR, applying Lever A (4 archetypes instead of 6) lands at ~5,500-7,000 combined. Still 2-3x Max's high-end audit projection but fits in a single coherent PR.

---

## §12 Gate items

Seven substantive decisions (Max projected 3-5; HVAC capstone has more design surface than primitive slices). **Bold = decision blocks PR start.**

### **G-9-1: Scaffolder vs hand-authored block split**

- **Option A (recommended):** Scaffold 3 blocks (equipment, service-calls, technicians); hand-author 0 net-new blocks; HVAC archetypes consume existing primitives + scaffolded blocks
- **Option B:** Scaffold 2 blocks (equipment, service-calls); fold technicians into customers as a `tier=technician` flag; reduces scope per Lever B
- **Option C:** Scaffold 5 blocks (add service-contracts + warranty); maximizes scaffolder real-world exercise but inflates LOC

**Recommendation: A.** Real exercise of the scaffolder on 3 blocks is high-value SLICE 9 evidence. Option C inflates without proportional value; Option B saves only ~250 LOC but loses thematic authenticity.

### **G-9-2: Edge case test depth**

- **Option A:** Smoke tests only (each flow runs happy path)
- **Option B (recommended):** Integration depth — each flow has 2-4 tests covering main edge cases per §7
- **Option C:** Full coverage — every edge × every flow

**Recommendation: B.** Smoke is too thin for capstone; full coverage is exponential. Integration is the right discipline for "do primitives actually compose under failure?"

### **G-9-3: Number of agent flows**

- **Option A:** 4 flows (drop install-job-coordination + equipment-due-personalized per Lever A)
- **Option B (recommended):** 6 flows (full set per §4)
- **Option C:** 8 flows (add seasonal commercial-contract renewal + technician dispatch optimization)

**Recommendation: B.** 6 flows hits the "rich primitive workout" framing from Max's spec. Lever A available if scope-tightening becomes necessary.

### **G-9-4: Documentation format**

- **Option A:** Markdown only (worked example doc + scaffolding transcripts + comparison framing)
- **Option B (recommended):** Markdown + demo video script (~300 LOC) — script becomes either video content or structured walkthrough doc
- **Option C:** Markdown + video script + screenshot fixtures (~6-10 PNGs)

**Recommendation: B.** Screenshots can come from preview deploys; binary fixtures in repo are heavy. Video script doubles as walkthrough doc + future-recording reference.

### **G-9-5: Comparison framing**

- **Option A:** No explicit comparison (primitives speak for themselves)
- **Option B (recommended):** Qualitative comparison ("vs LangGraph/CrewAI: SeldonFrame composes primitives without a separate orchestration framework"; ~150-300 LOC markdown)
- **Option C:** Quantitative benchmark (LOC-per-flow, time-to-deploy in each framework — requires actual benchmark work, scope creep)

**Recommendation: B.** Qualitative framing is launch-content-ready without scope explosion. Quantitative benchmarks belong in a follow-up post-launch.

### **G-9-6: Test mode demonstration**

- **Option A:** No explicit demo (test mode shipped in SLICE 8; SLICE 9 can ignore)
- **Option B (recommended):** Demonstrate operator iterating in test mode then shipping (~50 LOC code path + ~100 LOC walkthrough doc)
- **Option C:** Full test-mode automation (auto-run all 6 flows in test mode as part of seed-data-load) — over-engineered

**Recommendation: B.** SLICE 8's value lands when shown in context. The walkthrough doc demonstrates the SLICE 8 → SLICE 9 product story.

### **G-9-7: HVAC archetype registry scope**

- **Option A (recommended):** HVAC archetypes are workspace-scoped (ship via vertical pack install, not global registry)
- **Option B:** Register HVAC archetypes globally → 30-probe regression at C7
- **Option C:** Register a subset (the 2-3 most general, like emergency-triage); workspace-scope the HVAC-specific ones

**Recommendation: A.** Keeps the 27-streak hash baseline clean. HVAC archetypes are vertical-specific; registering globally pollutes the registry with vertical assumptions (e.g., the heat-advisory-outreach hardcodes Phoenix forecast endpoint). Vertical pack install is the right scope.

---

## §13 Dependencies

**Blocks SLICE 9 — all shipped:**
- Scaffolding capability (SLICE 2 — operational, this is first real exercise)
- Vertical pack system (real-estate-agency precedent)
- Soul state read/write (SLICE 3)
- All UI composition primitives (SLICE 4a + 4b)
- Schedule triggers (SLICE 5)
- Branch + external_state (SLICE 6)
- Message triggers + loop guard (SLICE 7)
- Workspace test mode (SLICE 8)
- Subscription primitive (SLICE 1)
- Conversation runtime (SLICE 2c)
- Demo seed pattern (Summit Coaching `seed-demo.ts`)
- Theme system (per-workspace JSONB)

**Independent of:**
- Marketing landing page polish (post-launch separately)
- Pricing page implementation (post-launch)
- Onboarding flow polish (post-launch UX)
- The actual launch announcement / distribution work

---

## §14 Out of scope (explicit deferrals)

Per Max's §11 spec:

- Marketing landing page polish (post-launch work, separate from this slice)
- Pricing page implementation
- Sales materials beyond the demo video script
- Onboarding flow polish (separate post-launch UX work)
- Customer support documentation generally
- The actual launch announcement / distribution
- New primitive development (any architectural gap surfaced by HVAC composability becomes a post-launch slice, NOT a SLICE 9 patch)
- Quantitative benchmarks vs LangGraph/CrewAI (per G-9-5 Option B)

---

## §15 Risk register

Per Max's §13 spec.

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Primitive composition surfaces unexpected interaction bugs | Medium | High | Integration tests per G-9-2 catch early; if bugs surface, document as post-launch slice (not SLICE 9 patch) |
| Polish work expands scope unboundedly (perfectionism) | High | Medium | Quality bar specifics in §5 (admin + customer + observability); LOC budget per §10 |
| Documentation quality bar judgment-based | Medium | Medium | §9 enumerates artifact + LOC budget; §6.1 templates per-block scaffolding doc |
| Edge cases reveal architectural gaps requiring new primitive | Low | Critical | Document gap → post-launch follow-up slice; do NOT build new primitives in SLICE 9 |
| Scaffolder fails on real BlockSpec for HVAC (first production exercise) | Medium | Medium | If scaffolder gaps surface, hand-author the block + flag scaffolder follow-up slice; document outcome in §6 transcripts |
| Vertical pack install fails (real-estate is the only precedent) | Low | Medium | Run install path in CI integration test; rollback semantics already shipped |
| Theme system insufficient for "polished" Desert Cool brand | Low | Low | 6 fonts + 2 colors + 3 radius + light/dark covers most workspaces; if insufficient, raise as theme-system follow-up |
| Vercel preview build regression at SLICE 9 close | Medium | High | Per L-27, Vercel verification mandatory at every PR close; `pnpm typecheck` baseline diff before push |
| LOC overshoot per §10.3 | High | Medium | Audit-time flag; gate decisions per §12 lock at audit time; close-out documents actual vs projected |
| Seed data realism (hand-curated, no Faker) under-delivers | Low | Low | Modeled on Summit Coaching seed pattern (which is sufficient for that demo) |

---

## §16 §11 End-to-end flow continuity

### 16.1 How HVAC archetypes use the primitive surface

Each archetype follows the same lifecycle:
1. Trigger fires (event / schedule / message / subscription)
2. Workflow runtime creates `workflow_runs` row with HVAC-specific archetypeId + payload
3. Steps execute via dispatchers (read_state, branch, send_sms, etc.)
4. Each step writes to `workflow_step_results` for observability
5. Test mode (G-8-7) routes external dispatches to sandbox if `org.testMode = true`
6. workflow_event_log captures every emission with `payload.testMode` tag

### 16.2 How the vertical pack install integrates

1. Operator (or `claim_guest_workspace` flow) invokes `install_vertical_pack({ packId: "hvac-arizona" })`
2. Pack manifest's `block_ids` enable each block atomically (per `enableWorkspaceBlock`)
3. Pack's `objects` + `relations` populate Soul (custom entity definitions)
4. Pack's `views` materialize as dashboard sidebar entries (currently hardcoded — manual nav entry per G-9-3)
5. Pack's `workflows` provision as workflow_runs (pre-existing infra)
6. Pack's `permissions` apply to org-members table

### 16.3 Operator iteration loop (test mode demo per G-9-6)

1. Operator clones Desert Cool HVAC fixture into their own test workspace
2. Operator toggles workspace test mode ON in `/settings/test-mode`
3. Operator triggers each archetype manually (via /agents/runs "trigger now" — if shipped, else via sample data)
4. All sends route to sandbox; banner visible; events tagged
5. Operator iterates on archetype JSON until satisfied
6. Operator toggles test mode OFF; first live run dispatches real outbound

This is the canonical product story: **scaffolded blocks + composed primitives + test-mode iteration = polished business automation.**

### 16.4 Observability trace per archetype

Each archetype's run produces a workflow_event_log trace visible at `/agents/runs/<runId>`:
- Step-by-step `workflow.step.completed` events
- External dispatch events (`sms.sent`, `email.sent`, `payment.captured`)
- Branch evaluations (`workflow.branch.evaluated`, `workflow.external_state.evaluated`)
- Message-trigger fires (`workflow.message.matched`)
- Loop-guard engagements (`workflow.message_trigger.loop_guard_engaged`)

This trace is the empirical evidence of primitive composition.

---

## §17 Calibration methodology summary

Per CLAUDE.md and L-17 lineage:

- **L-17 cross-ref Zod gate-breadth (validated 5-datapoint, settled rule per SLICE 8):** SLICE 9 ships HVAC archetype JSONs (no Zod schemas); UI composition (no Zod schemas). N/A.
- **L-17 dispatcher orthogonal interleaving (validated 3-datapoint refined band 1.5-2.5x per SLICE 8):** SLICE 9 ships no new dispatchers. N/A.
- **L-17 UI composition multiplier (sub-band refinement noted at SLICE 8 close):** SLICE 9 admin + customer surfaces use 0.94x balanced composition. Apply.
- **L-23 N/A:** no new archetype baselines (G-9-7 Option A keeps HVAC archetypes workspace-scoped).
- **L-26 applied:** any regression run uses canonical structural-hash (existing 6 baselines preserved by SLICE 9's no-archetype-registry-change posture).
- **L-27 applied:** every PR close requires verified Vercel green (push + observe + document at HEAD).
- **L-28 applied:** any new test fixtures (HVAC seed data with phone numbers, equipment serial numbers) use format-breaking variants per L-28.

---

## §18 Audit-time green-bar requirements per L-27

The PR close-out MUST include this explicit table format (mirrors SLICE 8 close-out):

| Check | Command/Source | Result |
|---|---|---|
| `pnpm typecheck` | (run locally) | N errors (matches pre-existing baseline of 4) |
| `pnpm test:unit` | | NNNN/NNNN (X todo, 0 fail) |
| `pnpm emit:blocks:check` | | no drift |
| `pnpm emit:event-registry:check` | | no drift |
| 6-archetype baseline regression (existing, NOT 30-archetype) | `node scripts/phase-7-spike/run-regression-3x.mjs slice-9-regression` | 18/18 PASS, 27-streak holds |
| HVAC vertical pack install integration test | (per C7 test) | install succeeds + 6 archetypes registered to workspace |
| Seed integrity test | | all relations valid, ~110 entity rows created |
| Edge case integration tests per §7 | | per-flow PASS rate documented |
| **Vercel preview build** | **observe at HEAD post-push** | **✅ green (verified at <commit-sha>)** OR **🟡 PENDING USER CONFIRMATION** |

**Vercel row may NOT be marked ✅ via inference.** Per L-27.

---

## §19 Stopping point

Per L-21: audit committed + pushed. **Stop. Wait for Max to resolve gates G-9-1 through G-9-7 + scope envelope decision (single PR with Lever A vs 2-PR split vs accept-overshoot) before any code commits.**

If gates resolve to recommended-Option-A path across the board:
- **2-PR split LOC:** PR 1 ~3,750 + PR 2 ~3,250 = ~7,000 combined (lands at audit-time projection lower bound)
- L-17 + L-23 + L-26 + L-27 + L-28 all applied
- Demonstrates capstone composability + ships launch content artifacts

If gates resolve differently (especially G-9-1/3 tightening to Lever A or Lever B), audit can be revised in 1-2 rounds before code starts.

---

## Appendix A — Audit-time deviations from Max's pre-audit framing

1. **Scaffolder is the first-time-real-use** — Max's spec implied the scaffolder would just produce HVAC blocks; ground-truth shows zero blocks have ever been scaffolded. SLICE 9 is the production exercise that validates scaffolder readiness. Surface this explicitly in §6 transcripts as data point.

2. **HVAC archetypes should NOT register globally** — Max's spec didn't address registry scoping. Per G-9-7 Option A: HVAC archetypes ship via vertical pack install (workspace-scoped), not via the global archetype registry. Keeps the 27-streak hash baseline clean + avoids vertical-specific assumptions polluting future synthesis.

3. **LOC projection materially exceeds Max's range** — code total 3,940-6,550 vs Max's upper bound 2,500. Drivers detailed in §10.3. Audit recommends accepting overshoot at projected scope (capstone value > strict LOC adherence) OR Lever A tightening (drop 2 archetypes, save ~600 LOC).

4. **2-PR split recommended over single PR** — Max's spec didn't pre-commit; audit recommends split given the LOC scale and natural seam (foundation in PR 1, archetypes + integration + close-out in PR 2).

5. **Sidebar nav is hardcoded** — adding HVAC entity routes (Equipment, Technicians, Service Calls) requires manual sidebar.tsx edits. Block-driven nav is a post-launch enhancement, not a SLICE 9 dependency.

6. **No Faker, no procedural data generation** — seed pattern is hand-curated per Summit Coaching precedent. Names, dates, and entity counts must be hand-authored. Documented in §2.3 + §10.

These deviations explain why the audit's projection lands well above Max's range while still ground-truth-justified.
