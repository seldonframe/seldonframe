---
id: hvac-service-calls
scope: universal
frameworks: hvac-arizona
status: draft
---

# BLOCK: HVAC Service Calls

**Description**
Tracks service calls (emergency, scheduled maintenance, install jobs) at customer sites. Each call has a customer, optional equipment reference, technician assignment, status, priority, and disposition. Powers emergency-triage routing, technician dispatch, and post-service-followup archetypes.

**Trigger Phrases**
- "track every service call we run"
- "I need to assign techs to jobs and track status"
- "log emergency vs scheduled vs install jobs separately"

**Behavior**
Tracks service calls (emergency, scheduled maintenance, install jobs) at customer sites. Each call has a customer, optional equipment reference, technician assignment, status, priority, and disposition. Powers emergency-triage routing, technician dispatch, and post-service-followup archetypes.

**Integration Points**
- CRM

**Self Improve**
self_improve: true

---

## Purpose

Tracks service calls (emergency, scheduled maintenance, install jobs) at customer sites. Each call has a customer, optional equipment reference, technician assignment, status, priority, and disposition. Powers emergency-triage routing, technician dispatch, and post-service-followup archetypes.

<!-- TODO (scaffold-default): expand this section with the 1-3 paragraphs explaining WHY this block exists, WHAT problem it solves, and WHO it's for. -->

---

## Entities

<!-- TODO (scaffold-default): describe the persistent objects this block owns (e.g., Note, Category, Tag). Omit if this block is a pure reactive/utility block with no own storage. -->

---

## Events

This block emits the following events:

- `service_call.created` — serviceCallId: string, customerId: string, priority: string, callType: string
- `service_call.assigned` — serviceCallId: string, technicianId: string, etaMinutes: integer
- `service_call.completed` — serviceCallId: string, customerId: string, technicianId: string, outcome: string

---

## Composition Contract

produces: [{"event":"service_call.created"},{"event":"service_call.assigned"},{"event":"service_call.completed"}]
consumes: [{"kind":"soul_field","soul_field":"workspace.soul.technicians","type":"array"},{"kind":"event","event":"equipment.serviced"}]
verbs: [create, assign, complete, list]
compose_with: [crm]

<!-- TOOLS:START -->
[]
<!-- TOOLS:END -->

---

## Notes for agent synthesis

<!-- TODO (scaffold-default): add any block-specific hints Claude should know when composing an agent that uses this block. Examples: preferred tool ordering, state-persistence guidance, common mistakes to avoid. -->
