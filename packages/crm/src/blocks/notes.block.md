---
id: notes
scope: universal
frameworks: universal
status: draft
---

# BLOCK: Notes

**Description**
Simple note-taking on contacts. Scaffolded smoke-test block proving the SLICE 2 PR 1 pipeline end-to-end.

**Trigger Phrases**
- "Add a notes block"
- "Install notes"
- "Let me jot notes on contacts"

**Behavior**
Simple note-taking on contacts. Scaffolded smoke-test block proving the SLICE 2 PR 1 pipeline end-to-end.

**Integration Points**
- CRM

**Self Improve**
self_improve: true

---

## Purpose

Simple note-taking on contacts. Scaffolded smoke-test block proving the SLICE 2 PR 1 pipeline end-to-end.

<!-- TODO (scaffold-default): expand this section with the 1-3 paragraphs explaining WHY this block exists, WHAT problem it solves, and WHO it's for. -->

---

## Entities

<!-- TODO (scaffold-default): describe the persistent objects this block owns (e.g., Note, Category, Tag). Omit if this block is a pure reactive/utility block with no own storage. -->

---

## Events

This block emits the following events:

- `note.created` — noteId: string, contactId: string

---

## Composition Contract

produces: [{"event":"note.created"}]
consumes: []
verbs: [create]
compose_with: [crm]

<!-- TOOLS:START -->
[
  {
    "name": "create_note",
    "description": "Create a note on a contact.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "contactId": {
          "type": "string"
        },
        "body": {
          "type": "string"
        }
      },
      "required": [
        "contactId",
        "body"
      ],
      "additionalProperties": false
    },
    "returns": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "noteId": {
          "type": "string"
        }
      },
      "required": [
        "noteId"
      ],
      "additionalProperties": false
    },
    "emits": [
      "note.created"
    ]
  }
]
<!-- TOOLS:END -->

---

## Notes for agent synthesis

<!-- TODO (scaffold-default): add any block-specific hints Claude should know when composing an agent that uses this block. Examples: preferred tool ordering, state-persistence guidance, common mistakes to avoid. -->
