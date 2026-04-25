---
id: vehicle-service-history
scope: universal
frameworks: universal
status: draft
---

# BLOCK: Vehicle Service History

**Description**
Tracks vehicles owned by contacts and the service events performed on them. Built for auto repair shops to maintain a per-customer-per-vehicle maintenance log.

**Trigger Phrases**
- "Add a vehicle service history block"
- "Install vehicle service tracking"
- "Track service events on my customers' vehicles"

**Behavior**
Tracks vehicles owned by contacts and the service events performed on them. Built for auto repair shops to maintain a per-customer-per-vehicle maintenance log.

**Integration Points**
- CRM

**Self Improve**
self_improve: true

---

## Purpose

Tracks vehicles owned by contacts and the service events performed on them. Built for auto repair shops to maintain a per-customer-per-vehicle maintenance log.

<!-- TODO (scaffold-default): expand this section with the 1-3 paragraphs explaining WHY this block exists, WHAT problem it solves, and WHO it's for. -->

---

## Entities

<!-- TODO (scaffold-default): describe the persistent objects this block owns (e.g., Note, Category, Tag). Omit if this block is a pure reactive/utility block with no own storage. -->

---

## Events

This block emits the following events:

- `vehicle.added` — vehicleId: string, contactId: string, vin: string | null
- `service.logged` — serviceEventId: string, vehicleId: string, contactId: string, serviceType: string

---

## Composition Contract

produces: [{"event":"vehicle.added"},{"event":"service.logged"}]
consumes: []
verbs: [add, log, list, get]
compose_with: [crm]

<!-- TOOLS:START -->
[
  {
    "name": "add_vehicle",
    "description": "Register a new vehicle against a contact. Requires year/make/model; VIN is optional.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "contactId": {
          "type": "string"
        },
        "year": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        },
        "make": {
          "type": "string"
        },
        "model": {
          "type": "string"
        },
        "vin": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "contactId",
        "year",
        "make",
        "model"
      ],
      "additionalProperties": false
    },
    "returns": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "vehicleId": {
          "type": "string"
        }
      },
      "required": [
        "vehicleId"
      ],
      "additionalProperties": false
    },
    "emits": [
      "vehicle.added"
    ]
  },
  {
    "name": "log_service",
    "description": "Record a service event performed on a vehicle. Service type is a free-form label (oil change, brake pads, inspection, etc.).",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "vehicleId": {
          "type": "string"
        },
        "serviceType": {
          "type": "string"
        },
        "mileage": {
          "anyOf": [
            {
              "type": "integer",
              "minimum": -9007199254740991,
              "maximum": 9007199254740991
            },
            {
              "type": "null"
            }
          ]
        },
        "notes": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ]
        },
        "cost": {
          "anyOf": [
            {
              "type": "number"
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "vehicleId",
        "serviceType"
      ],
      "additionalProperties": false
    },
    "returns": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "serviceEventId": {
          "type": "string"
        }
      },
      "required": [
        "serviceEventId"
      ],
      "additionalProperties": false
    },
    "emits": [
      "service.logged"
    ]
  },
  {
    "name": "list_service_history",
    "description": "List all service events for a given vehicle, newest first.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "vehicleId": {
          "type": "string"
        }
      },
      "required": [
        "vehicleId"
      ],
      "additionalProperties": false
    },
    "returns": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {},
      "additionalProperties": false
    },
    "emits": []
  },
  {
    "name": "get_vehicle",
    "description": "Fetch a single vehicle by id.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "vehicleId": {
          "type": "string"
        }
      },
      "required": [
        "vehicleId"
      ],
      "additionalProperties": false
    },
    "returns": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {},
      "additionalProperties": false
    },
    "emits": []
  }
]
<!-- TOOLS:END -->

---

## Subscriptions

Block-level reactive handlers. When these events fire in a workspace,
the cron dispatcher invokes the named handler (see
`packages/crm/src/blocks/vehicle-service-history/subscriptions/` for implementations).

<!-- SUBSCRIPTIONS:START -->
[{"event":"caldiy-booking:booking.completed","handler":"logServiceStubOnBookingComplete","idempotency_key":"{{data.appointmentId}}"}]
<!-- SUBSCRIPTIONS:END -->

---

## Notes for agent synthesis

<!-- TODO (scaffold-default): add any block-specific hints Claude should know when composing an agent that uses this block. Examples: preferred tool ordering, state-persistence guidance, common mistakes to avoid. -->
