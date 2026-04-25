---
id: hvac-equipment
scope: universal
frameworks: hvac-arizona
status: draft
---

# BLOCK: HVAC Equipment

**Description**
Tracks HVAC equipment installed at customer sites. Each piece carries type, brand, model, serial number, install date, last service date, and warranty expiration. Powers per-customer equipment lists, replacement-candidate flags (>15 years old), and the pre-season-maintenance archetype's Soul query for due customers.

**Trigger Phrases**
- "track HVAC equipment per customer"
- "I need to see what AC units each customer has installed"
- "log when equipment was installed and when it was last serviced"

**Behavior**
Tracks HVAC equipment installed at customer sites. Each piece carries type, brand, model, serial number, install date, last service date, and warranty expiration. Powers per-customer equipment lists, replacement-candidate flags (>15 years old), and the pre-season-maintenance archetype's Soul query for due customers.

**Integration Points**
- CRM

**Self Improve**
self_improve: true

---

## Purpose

Tracks HVAC equipment installed at customer sites. Each piece carries type, brand, model, serial number, install date, last service date, and warranty expiration. Powers per-customer equipment lists, replacement-candidate flags (>15 years old), and the pre-season-maintenance archetype's Soul query for due customers.

<!-- TODO (scaffold-default): expand this section with the 1-3 paragraphs explaining WHY this block exists, WHAT problem it solves, and WHO it's for. -->

---

## Entities

<!-- TODO (scaffold-default): describe the persistent objects this block owns (e.g., Note, Category, Tag). Omit if this block is a pure reactive/utility block with no own storage. -->

---

## Events

This block emits the following events:

- `equipment.installed` — equipmentId: string, customerId: string, brand: string, model: string, type: string
- `equipment.serviced` — equipmentId: string, customerId: string, servicedAt: string, technicianId: string

---

## Composition Contract

produces: [{"event":"equipment.installed"},{"event":"equipment.serviced"}]
consumes: [{"kind":"soul_field","soul_field":"workspace.soul.technicians","type":"array"}]
verbs: [list, create, update]
compose_with: [crm]

<!-- TOOLS:START -->
[]
<!-- TOOLS:END -->

---

## Notes for agent synthesis

<!-- TODO (scaffold-default): add any block-specific hints Claude should know when composing an agent that uses this block. Examples: preferred tool ordering, state-persistence guidance, common mistakes to avoid. -->
