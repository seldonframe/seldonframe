---
id: crm
scope: universal
frameworks: agency,coaching,consulting,service,realestate,ecommerce,saas
status: core
---
# BLOCK: CRM

**Description**
Core CRM primitive auto-installed on every SeldonFrame workspace. Contacts, deals, pipelines, activities — the foundation every other block links against. Not optional; cannot be uninstalled.

**Behavior**
CRM is different from pluggable blocks like `caldiy-booking` or `formbricks-intake`: it's the substrate the other blocks compose into, not a replaceable feature. The engine at `packages/crm/src/components/crm/*` reads this BLOCK.md's views + scoped overrides + end_client_mode gating, and renders table / kanban / record / timeline surfaces from the metadata. Customization happens in BLOCK.md itself, not by forking the engine.

**Integration Points**
- Every block — contact_id is the universal join key.
- Brain v2 — `contact.created`, `deal.stage_changed` recorded per activity.
- Formbricks intake — form submissions upsert contacts.
- Cal.diy booking — bookings link to contacts via attendee email.
- Email / SMS (Phase 3+) — sends target contact_id.
- Payments (Phase 5+) — invoices resolve contact → stripe customer.

---

## Purpose

Be the universal spine of the workspace: every inbound signal (form, booking, email reply, payment, conversation) lands on a contact; every outbound action (send, invoice, book) targets a contact. Pipelines + stages + custom objects are downstream of this spine. Agent synthesis (Phase 7) treats CRM as the default "state store" when composing agents — the block synthesized agents compose against when they need to remember something about a lead.

---

## Entities

Minimal canonical set — full schemas live in `packages/crm/src/db/schema/{contacts,deals,pipelines,activities}.ts`.

- **Contact** (`contacts`): `firstName`, `lastName`, `email`, `phone`, `status` (lead/prospect/customer/churned), `source`, `orgId`, `createdAt`, `updatedAt`.
- **Deal** (`deals`): `title`, `value`, `stage`, `probability`, `contactId`, `pipelineId`, `closedAt`.
- **Pipeline** (`pipelines`): `name`, `stages: [{name, color, probability}]`, `isDefault`.
- **Activity** (`activities`): `type` (task|note|email|call|meeting|stage_change), `subject`, `body`, `contactId?`, `dealId?`, `scheduledAt?`, `completedAt?`.

Custom objects (agencies extending to `clients`, `projects`, etc.) are stored in the same engine via `custom_objects` + `custom_object_records` with BLOCK.md view metadata per object.

---

## Events

### Emits (canonical `SeldonEvent` vocabulary)
- `contact.created` — new row in `contacts`. Payload: `{ contactId }`.
- `contact.updated` — any field change. Payload: `{ contactId }`.
- `deal.stage_changed` — `deals.stage` transitions. Payload: `{ dealId, from, to }`.

### Listens
- `form.submitted` (from formbricks-intake) — upsert contact by email.
- `booking.created` (from caldiy-booking) — upsert contact by attendee email.
- `email.replied` (from Phase 3 email block) — log activity of type `email` against contact.
- `payment.succeeded` (from Phase 5 payments) — transition deal to `won` if linked.

---

## Composition Contract

Machine-readable contract for Phase 7 agent synthesis. CRM is the most-composed-with block in the system — every agent touches it in some way.

produces: [contact.created, contact.updated, deal.stage_changed]
consumes: [workspace.soul.business_type, workspace.soul.customer_fields, workspace.soul.pipeline_stages, contact.email]
verbs: [track, remember, save, store, record, contact, deal, pipeline, stage, move, assign, tag, lead, customer, crm]
compose_with: [caldiy-booking, formbricks-intake, email, sms, payments, landing-pages, automation, brain-v2]

---

## Notes for agent synthesis

When composing an agent that "remembers" things about a person — lead qualification state, last outreach date, pipeline stage, custom attributes — CRM contact or deal custom_fields are the default persistence target. Don't invent a parallel store. When the agent reasons about a person, load from `contact` + `deal.active_for(contactId)` + last N `activities`; write updates back via `update_contact` / `update_deal` / `create_activity` MCP tools.

---

## Navigation

- `/contacts` — table view (BLOCK.md-driven)
- `/contacts/[id]` — record page
- `/deals` — table view
- `/deals/pipeline` — kanban view
- `/objects/[objectSlug]` — custom-object surfaces
