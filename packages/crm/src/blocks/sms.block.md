---
id: sms
scope: universal
frameworks: agency,coaching,consulting,service,realestate,ecommerce,saas
status: core
---
# BLOCK: SMS

**Description**
Transactional + conversational SMS block. BYOK Twilio. Send one-off texts, route inbound replies through the Conversation Primitive runtime (same module as email), track delivery + failures, and auto-suppress on STOP / carrier permanent-failure codes.

**Behavior**
Two modes share one infrastructure — identical shape to email:
1. **Transactional** — one SMS to one contact, fire-and-forget. Emits `sms.sent` immediately; `sms.delivered` / `sms.failed` arrive via the Twilio status callback.
2. **Conversational** — multi-turn replies routed through `lib/conversation/runtime.ts::handleIncomingTurn` with `channel: "sms"`. The runtime is the same module email uses; no SMS-specific reasoning code exists. Channel-specific tone guidance (≤320 chars, no subject line, plain text) is already baked into the runtime's system prompt.

**Integration Points**
- **CRM** — every outbound send targets a contact by id when known. Inbound webhook resolves contact by phone match against `contacts.phone` (normalized to E.164).
- **Suppression list** (`suppression_list`, channel='sms') — STOP keyword + carrier block 30003/30005/30006 + manual opt-outs all land here. Pre-send hook skips suppressed numbers with `sms.suppressed`.
- **Brain v2** — `sms.sent`, `sms.delivered`, `sms.replied` feed engagement signals.
- **Automations** — node type `send-sms` composes transactional sends; node type `conversation-turn` composes the runtime.
- **Email block** — shares `conversations` + `conversation_turns` tables. Both channels can exist on the same contact concurrently.

---

## Purpose

Give the workspace a second always-on channel — this time one with much higher engagement rates and a much stricter compliance surface. The "speed-to-lead chatbot that actually books the call" agent demo (Corey-Ganim pattern) composes `formbricks-intake.form.submitted` → `sms.send_conversation_turn` → (optionally) `caldiy-booking.booking.created`. That demo is the v1 hero moment; the SMS block is load-bearing for it.

---

## Entities

Minimal canonical set — full schemas in `packages/crm/src/db/schema/{sms-messages,sms-events,suppression-list,conversations,conversation-turns}.ts`.

- **SmsMessage** (`sms_messages`): `direction` (`inbound` | `outbound`), `fromNumber`, `toNumber`, `body`, `status`, `externalMessageId`, `segments`, `errorCode`, `errorMessage`, `sentAt`, `deliveredAt`.
- **SmsEvent** (`sms_events`): `smsMessageId`, `eventType`, `provider`, `providerEventId` (unique for idempotency), `payload`.
- **Conversation** + **ConversationTurn** — reused from Phase 3 with `channel: "sms"`. No SMS-specific table.
- **Suppression** (`suppression_list`, `channel='sms'`, `phone` column): `reason` (`manual` | `stop_keyword` | `carrier_block` | `complaint`), `source`.

---

## Events

### Emits (canonical `SeldonEvent` vocabulary)
- `sms.sent` — outbound accepted by Twilio. Payload: `{ smsMessageId, contactId }`.
- `sms.delivered` — Twilio status callback `MessageStatus=delivered`. Payload: `{ smsMessageId, contactId }`.
- `sms.replied` — inbound SMS persisted. Payload: `{ smsMessageId, contactId, conversationId }` (conversationId populated if the runtime opened a thread).
- `sms.failed` — Twilio status callback `MessageStatus=failed|undelivered`, OR synchronous send error. Payload: `{ smsMessageId, contactId, reason }`. Auto-suppresses the number on error codes 30003 / 30005 / 30006.
- `sms.suppressed` — pre-send hook skipped OR STOP keyword received. Payload: `{ phone, reason, contactId }`.
- `conversation.turn.received` — runtime wrote an inbound turn. Payload: `{ conversationId, turnId, contactId, channel: "sms" }`.
- `conversation.turn.sent` — runtime wrote an outbound turn. Payload: `{ conversationId, turnId, contactId, channel: "sms" }`.

### Listens
- `form.submitted` — speed-to-lead flow: immediately text the submitter with a qualifying question.
- `booking.created` — appointment confirmation + reminder.
- `deal.stage_changed` — optional stage-transition outreach.

---

## Composition Contract

Machine-readable contract for Phase 7 agent synthesis.

**v2 shape** (migrated 2026-04-22 as block 3 of 6 in 2b.2, after Email). Typed `produces` + `consumes` reference the `SeldonEvent` union and the workspace Soul schema; the emitted JSON Schema for all 6 SMS-native MCP tool args + returns lives between the `TOOLS` markers. The emission source is `packages/crm/src/blocks/sms.tools.ts` (Zod schemas); regenerate via `pnpm emit:blocks`.

**Conversation Primitive note:** `send_conversation_turn` is NOT declared in `sms.tools.ts`. The Zod schema for that tool lives in `email.tools.ts` per the convention established during Email migration (tool names are globally unique in the registry). The runtime at `lib/conversation/runtime.ts` is channel-agnostic and routes via `channel: email | sms` on the tool call, so both Email and SMS blocks can compose through it without duplicating the declaration. SMS still lists `conversation.turn.received` / `conversation.turn.sent` in `produces` because both channels emit these events at runtime; only the tool DECLARATION lives on Email. See `email.tools.ts` header comment for the full convention.

**Drops vs v1:** the v1 `consumes:` carried `contact.id`, `contact.phone`, `contact.firstName` as bare strings. Same class of drop as CRM, Booking, Email — contact-field access is inherent to `send_sms`'s contract (phone number is the effective recipient identifier, already encoded in the Zod args schema). Removed in migration.

produces: [{"event": "sms.sent"}, {"event": "sms.delivered"}, {"event": "sms.replied"}, {"event": "sms.failed"}, {"event": "sms.suppressed"}, {"event": "conversation.turn.received"}, {"event": "conversation.turn.sent"}]
consumes: [{"kind": "soul_field", "soul_field": "workspace.soul.business_type", "type": "string"}, {"kind": "soul_field", "soul_field": "workspace.soul.tone", "type": "string"}, {"kind": "soul_field", "soul_field": "workspace.soul.mission", "type": "string"}, {"kind": "soul_field", "soul_field": "workspace.soul.offer", "type": "string"}]
verbs: [text, sms, message, reply, chat, qualify, speed to lead, follow up, reminder, confirm, book via text]
compose_with: [crm, formbricks-intake, caldiy-booking, email, automation, brain-v2, payments]

<!-- TOOLS:START -->
[
  {
    "name": "send_sms",
    "description": "Send an SMS via the workspace's Twilio integration. Checks the SMS suppression list first (STOP keyword + carrier blocks + manual opt-outs) and skips with {suppressed: true} if the recipient has opted out.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "to": {
          "type": "string",
          "pattern": "^\\+?[0-9]{10,15}$",
          "description": "Recipient phone number. E.164 or 10-digit US will be normalized."
        },
        "body": {
          "type": "string",
          "minLength": 1,
          "description": "SMS body. Twilio will segment if over 160 chars; charges per segment."
        },
        "contact_id": {
          "description": "Optional. Links the message to a CRM contact for threading.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        },
        "workspace_id": {
          "description": "Optional. Falls back to the active workspace.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "required": [
        "to",
        "body"
      ],
      "additionalProperties": false
    },
    "returns": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "data": {
          "anyOf": [
            {
              "type": "object",
              "properties": {
                "message": {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "string",
                      "format": "uuid",
                      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                    },
                    "contactId": {
                      "anyOf": [
                        {
                          "type": "string",
                          "format": "uuid",
                          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                        },
                        {
                          "type": "null"
                        }
                      ]
                    },
                    "direction": {
                      "type": "string",
                      "enum": [
                        "inbound",
                        "outbound"
                      ]
                    },
                    "fromPhone": {
                      "type": "string"
                    },
                    "toPhone": {
                      "type": "string"
                    },
                    "body": {
                      "type": "string"
                    },
                    "status": {
                      "type": "string",
                      "enum": [
                        "queued",
                        "sent",
                        "delivered",
                        "failed",
                        "undelivered",
                        "received"
                      ]
                    },
                    "providerMessageSid": {
                      "anyOf": [
                        {
                          "type": "string"
                        },
                        {
                          "type": "null"
                        }
                      ]
                    },
                    "segments": {
                      "type": "integer",
                      "minimum": 0,
                      "maximum": 9007199254740991
                    },
                    "sentAt": {
                      "anyOf": [
                        {
                          "type": "string",
                          "format": "date-time",
                          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                        },
                        {
                          "type": "null"
                        }
                      ]
                    },
                    "deliveredAt": {
                      "anyOf": [
                        {
                          "type": "string",
                          "format": "date-time",
                          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                        },
                        {
                          "type": "null"
                        }
                      ]
                    },
                    "failedAt": {
                      "anyOf": [
                        {
                          "type": "string",
                          "format": "date-time",
                          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                        },
                        {
                          "type": "null"
                        }
                      ]
                    },
                    "failureCode": {
                      "anyOf": [
                        {
                          "type": "string"
                        },
                        {
                          "type": "null"
                        }
                      ]
                    },
                    "createdAt": {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    }
                  },
                  "required": [
                    "id",
                    "contactId",
                    "direction",
                    "fromPhone",
                    "toPhone",
                    "body",
                    "status",
                    "providerMessageSid",
                    "segments",
                    "sentAt",
                    "deliveredAt",
                    "failedAt",
                    "failureCode",
                    "createdAt"
                  ],
                  "additionalProperties": false
                },
                "suppressed": {
                  "type": "boolean"
                }
              },
              "required": [
                "message"
              ],
              "additionalProperties": false
            },
            {
              "type": "object",
              "properties": {
                "suppressed": {
                  "type": "boolean",
                  "const": true
                },
                "reason": {
                  "type": "string",
                  "enum": [
                    "manual",
                    "stop_keyword",
                    "carrier_block",
                    "complaint"
                  ]
                }
              },
              "required": [
                "suppressed",
                "reason"
              ],
              "additionalProperties": false
            }
          ]
        }
      },
      "required": [
        "data"
      ],
      "additionalProperties": false
    },
    "emits": [
      "sms.sent"
    ]
  },
  {
    "name": "list_sms",
    "description": "List recent SMS messages (inbound + outbound) for the workspace, newest first.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "limit": {
          "description": "Max rows to return (default 50, max 200).",
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 200
        },
        "workspace_id": {
          "description": "Optional. Falls back to the active workspace.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "additionalProperties": false
    },
    "returns": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "data": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "format": "uuid",
                "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
              },
              "contactId": {
                "anyOf": [
                  {
                    "type": "string",
                    "format": "uuid",
                    "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "direction": {
                "type": "string",
                "enum": [
                  "inbound",
                  "outbound"
                ]
              },
              "fromPhone": {
                "type": "string"
              },
              "toPhone": {
                "type": "string"
              },
              "body": {
                "type": "string"
              },
              "status": {
                "type": "string",
                "enum": [
                  "queued",
                  "sent",
                  "delivered",
                  "failed",
                  "undelivered",
                  "received"
                ]
              },
              "providerMessageSid": {
                "anyOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "segments": {
                "type": "integer",
                "minimum": 0,
                "maximum": 9007199254740991
              },
              "sentAt": {
                "anyOf": [
                  {
                    "type": "string",
                    "format": "date-time",
                    "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "deliveredAt": {
                "anyOf": [
                  {
                    "type": "string",
                    "format": "date-time",
                    "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "failedAt": {
                "anyOf": [
                  {
                    "type": "string",
                    "format": "date-time",
                    "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "failureCode": {
                "anyOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "createdAt": {
                "type": "string",
                "format": "date-time",
                "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
              }
            },
            "required": [
              "id",
              "contactId",
              "direction",
              "fromPhone",
              "toPhone",
              "body",
              "status",
              "providerMessageSid",
              "segments",
              "sentAt",
              "deliveredAt",
              "failedAt",
              "failureCode",
              "createdAt"
            ],
            "additionalProperties": false
          }
        }
      },
      "required": [
        "data"
      ],
      "additionalProperties": false
    },
    "emits": []
  },
  {
    "name": "get_sms",
    "description": "Fetch a single SMS with its full provider-event history (queued / sent / delivered / failed / undelivered).",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "sms_id": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
          "description": "SMS ID returned from send_sms or list_sms."
        },
        "workspace_id": {
          "description": "Optional. Falls back to the active workspace.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "required": [
        "sms_id"
      ],
      "additionalProperties": false
    },
    "returns": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "data": {
          "type": "object",
          "properties": {
            "message": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "contactId": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "uuid",
                      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "direction": {
                  "type": "string",
                  "enum": [
                    "inbound",
                    "outbound"
                  ]
                },
                "fromPhone": {
                  "type": "string"
                },
                "toPhone": {
                  "type": "string"
                },
                "body": {
                  "type": "string"
                },
                "status": {
                  "type": "string",
                  "enum": [
                    "queued",
                    "sent",
                    "delivered",
                    "failed",
                    "undelivered",
                    "received"
                  ]
                },
                "providerMessageSid": {
                  "anyOf": [
                    {
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "segments": {
                  "type": "integer",
                  "minimum": 0,
                  "maximum": 9007199254740991
                },
                "sentAt": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "deliveredAt": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "failedAt": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "failureCode": {
                  "anyOf": [
                    {
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "createdAt": {
                  "type": "string",
                  "format": "date-time",
                  "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                }
              },
              "required": [
                "id",
                "contactId",
                "direction",
                "fromPhone",
                "toPhone",
                "body",
                "status",
                "providerMessageSid",
                "segments",
                "sentAt",
                "deliveredAt",
                "failedAt",
                "failureCode",
                "createdAt"
              ],
              "additionalProperties": false
            },
            "events": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "enum": [
                      "queued",
                      "sent",
                      "delivered",
                      "failed",
                      "undelivered",
                      "received"
                    ]
                  },
                  "at": {
                    "type": "string",
                    "format": "date-time",
                    "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                  },
                  "providerStatus": {
                    "anyOf": [
                      {
                        "type": "string"
                      },
                      {
                        "type": "null"
                      }
                    ]
                  },
                  "errorCode": {
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
                  "type",
                  "at",
                  "providerStatus",
                  "errorCode"
                ],
                "additionalProperties": false
              }
            }
          },
          "required": [
            "message",
            "events"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "data"
      ],
      "additionalProperties": false
    },
    "emits": []
  },
  {
    "name": "list_sms_suppressions",
    "description": "List all suppressed phone numbers for the workspace — who is opted out and why (manual / stop_keyword / carrier_block / complaint).",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "workspace_id": {
          "description": "Optional. Falls back to the active workspace.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "additionalProperties": false
    },
    "returns": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "data": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "phone": {
                "type": "string"
              },
              "reason": {
                "type": "string",
                "enum": [
                  "manual",
                  "stop_keyword",
                  "carrier_block",
                  "complaint"
                ]
              },
              "source": {
                "anyOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "createdAt": {
                "type": "string",
                "format": "date-time",
                "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
              }
            },
            "required": [
              "phone",
              "reason",
              "source",
              "createdAt"
            ],
            "additionalProperties": false
          }
        }
      },
      "required": [
        "data"
      ],
      "additionalProperties": false
    },
    "emits": []
  },
  {
    "name": "suppress_phone",
    "description": "Add a phone number to the SMS suppression list so future SMS sends skip it. STOP replies + carrier permanent-failure codes auto-suppress via the Twilio webhook; use this for manual opt-outs.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "phone": {
          "type": "string",
          "pattern": "^\\+?[0-9]{10,15}$",
          "description": "Phone number to suppress. E.164 or 10-digit US will be normalized."
        },
        "reason": {
          "description": "Reason code. Default: 'manual'.",
          "type": "string",
          "enum": [
            "manual",
            "stop_keyword",
            "carrier_block",
            "complaint"
          ]
        },
        "source": {
          "description": "Optional free-form provenance tag.",
          "type": "string"
        },
        "workspace_id": {
          "description": "Optional. Falls back to the active workspace.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "required": [
        "phone"
      ],
      "additionalProperties": false
    },
    "returns": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "data": {
          "type": "object",
          "properties": {
            "phone": {
              "type": "string"
            },
            "reason": {
              "type": "string",
              "enum": [
                "manual",
                "stop_keyword",
                "carrier_block",
                "complaint"
              ]
            },
            "source": {
              "anyOf": [
                {
                  "type": "string"
                },
                {
                  "type": "null"
                }
              ]
            },
            "createdAt": {
              "type": "string",
              "format": "date-time",
              "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
            }
          },
          "required": [
            "phone",
            "reason",
            "source",
            "createdAt"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "data"
      ],
      "additionalProperties": false
    },
    "emits": [
      "sms.suppressed"
    ]
  },
  {
    "name": "unsuppress_phone",
    "description": "Remove a phone number from the SMS suppression list so future sends go through again.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "phone": {
          "type": "string",
          "pattern": "^\\+?[0-9]{10,15}$",
          "description": "Phone number to un-suppress."
        },
        "workspace_id": {
          "description": "Optional. Falls back to the active workspace.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "required": [
        "phone"
      ],
      "additionalProperties": false
    },
    "returns": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "ok": {
          "type": "boolean",
          "const": true
        },
        "removed": {
          "type": "string"
        }
      },
      "required": [
        "ok",
        "removed"
      ],
      "additionalProperties": false
    },
    "emits": []
  }
]
<!-- TOOLS:END -->

---

## Notes for agent synthesis

Compliance comes first: STOP keyword handling is **not optional**. The webhook receiver enforces it; agents must never attempt to re-engage a STOP-responded number. Check `list_sms_suppressions` before proposing any SMS sequence so synthesis doesn't design a flow that will be silently skipped.

Prefer SMS over email for any interaction where response-time matters (speed-to-lead, appointment reminders, booking confirmations). Prefer email over SMS for content-heavy sends (newsletters, long explanations, attachments — SMS has no attachment support here). When composing agents that route between channels, the Conversation Primitive runtime handles both — a thread can start via form intake, reply via SMS, continue via email when the contact engages with a link, all on the same `conversations` row with channel-switched turns.

Twilio segment count (`segments` column on `sms_messages`) is populated from the API response. Each segment is independently billed by Twilio. Keep generated replies under 160 chars when cost matters; the runtime's SMS system prompt already enforces ≤320 chars as a soft upper bound.

---

## Navigation

- `/sms` — dashboard list + send surface (deferred; use MCP `send_sms` + `list_sms` for v1)
- `/contacts/[id]` — per-contact SMS thread appears in the shared conversation view
- `/settings/integrations/twilio` — Twilio connection card + webhook URL
- `/settings/suppression` — email suppression list (SMS-side UI deferred; `list_sms_suppressions` covers v1)
