---
id: email
scope: universal
frameworks: agency,coaching,consulting,service,realestate,ecommerce,saas
status: core
---
# BLOCK: Email

**Description**
Transactional + conversational email block. BYOK Resend (with NextAuth owner-key fallback for platform sends). Send one-off emails, route inbound replies through the Conversation Primitive runtime, track opens/clicks/bounces, and auto-suppress hard bounces + complaints.

**Behavior**
Two modes share one infrastructure:
1. **Transactional** — one email to one contact, fire-and-forget. Template variables from Soul + contact context. Emits `email.sent` and, via the Resend webhook, `email.delivered` / `email.opened` / `email.clicked` / `email.bounced`.
2. **Conversational** — multi-turn replies routed through `lib/conversation/runtime.ts::handleIncomingTurn`. The runtime is channel-agnostic; Phase 4 SMS reuses it verbatim.

**Integration Points**
- **CRM** — every send targets a contact (`contact_id`) for threading + activity timeline. Outbound emails create an `activity` row of type `email`.
- **Suppression list** (`suppression_list`) — pre-send hook skips if the recipient is opted out; emits `email.suppressed` with reason.
- **Brain v2** — `email.sent`, `email.opened`, `email.replied` feed learning signals for deliverability + engagement scoring.
- **Formbricks intake** — `form.submitted` can trigger a templated transactional send via the `triggerEvent` column on `email_templates`.
- **Automations** — node type `send-email` composes transactional sends; node type `conversation-turn` composes the runtime for chat-style follow-up.

---

## Purpose

Give a workspace a real outbound channel with real deliverability signals, and a real inbound channel that can actually reason about what came in. Without this block, every other block is "collect + display but never respond." With it, agents composed in Phase 7 can close the loop — qualify a form submission, nudge a stalled deal, answer a booking question.

---

## Entities

Minimal canonical set — full schemas in `packages/crm/src/db/schema/{emails,email-events,conversations,conversation-turns,suppression-list}.ts`.

- **Email** (`emails`): `fromEmail`, `toEmail`, `subject`, `bodyHtml`, `bodyText`, `status`, `externalMessageId`, `openCount`, `clickCount`, `sentAt`, `openedAt`, `lastClickedAt`.
- **EmailEvent** (`email_events`): `emailId`, `eventType`, `provider`, `providerEventId` (unique for idempotency), `payload`.
- **Conversation** (`conversations`): `contactId`, `channel` (`email` | `sms`), `status` (`active` | `closed` | `paused`), `subject`, `assistantState` (JSONB, runtime-maintained memory), `lastTurnAt`.
- **ConversationTurn** (`conversation_turns`): `conversationId`, `direction` (`inbound` | `outbound`), `channel`, `content`, `emailId?`, `smsMessageId?`, `metadata`.
- **Suppression** (`suppression_list`): `email`, `reason` (`manual` | `unsubscribe` | `bounce` | `complaint`), `source`.

---

## Events

### Emits (canonical `SeldonEvent` vocabulary)
- `email.sent` — outbound email accepted by the provider. Payload: `{ emailId, contactId }`.
- `email.delivered` — provider confirmed delivery via webhook. Payload: `{ emailId, contactId }`.
- `email.opened` — tracking pixel hit OR webhook `email.opened`. Payload: `{ emailId, contactId }`.
- `email.clicked` — tracked link hit OR webhook `email.clicked`. Payload: `{ emailId, contactId, url }`.
- `email.bounced` — hard bounce or complaint. Payload: `{ emailId, contactId, reason }`. Auto-suppresses the address.
- `email.replied` — reply to a trackable alias (nice-to-have). Payload: `{ emailId, contactId, conversationId }`.
- `email.suppressed` — pre-send hook skipped. Payload: `{ email, reason, contactId }`.
- `conversation.turn.received` — runtime wrote an inbound turn. Payload: `{ conversationId, turnId, contactId, channel }`.
- `conversation.turn.sent` — runtime wrote an outbound turn. Payload: `{ conversationId, turnId, contactId, channel }`.

### Listens
- `form.submitted` — triggered-template flow via `sendTriggeredEmailsForContactEvent`.
- `booking.created` — workspace-owner-configured confirmation template.
- `deal.stage_changed` — optional stage-transition outreach (automation).

---

## Composition Contract

Machine-readable contract for Phase 7 agent synthesis.

**v2 shape** (migrated 2026-04-22 as block 2 of 6 in 2b.2, after Booking). Typed `produces` + `consumes` reference the `SeldonEvent` union and the workspace Soul schema; the emitted JSON Schema for all 7 Email MCP tool args + returns lives between the `TOOLS` markers. The emission source is `packages/crm/src/blocks/email.tools.ts` (Zod schemas); regenerate via `pnpm emit:blocks`.

**Conversation Primitive note:** `send_conversation_turn` is shared between Email and SMS blocks — the runtime at `lib/conversation/runtime.ts` is channel-agnostic. The Zod schema for the tool lives in `email.tools.ts` (Email migrates first); SMS's tools.ts will NOT re-declare it. Both blocks still list `conversation.turn.received` / `conversation.turn.sent` in `produces` — both channels can produce conversation events even though only one block ships the tool declaration.

**Drops vs v1:** the v1 `consumes:` carried `contact.id`, `contact.email`, `contact.firstName` as bare strings. Same class of drop as CRM and Booking — contact field access is inherent to the block's function (email sends by definition target a contact), and the bare strings didn't fit any v2 typed-consume variant. Removed in migration; `send_email`'s args schema already requires `to: z.string().email()` as the effective contract.

produces: [{"event": "email.sent"}, {"event": "email.delivered"}, {"event": "email.opened"}, {"event": "email.clicked"}, {"event": "email.bounced"}, {"event": "email.replied"}, {"event": "email.suppressed"}, {"event": "conversation.turn.received"}, {"event": "conversation.turn.sent"}]
consumes: [{"kind": "soul_field", "soul_field": "workspace.soul.business_type", "type": "string"}, {"kind": "soul_field", "soul_field": "workspace.soul.tone", "type": "string"}, {"kind": "soul_field", "soul_field": "workspace.soul.mission", "type": "string"}, {"kind": "soul_field", "soul_field": "workspace.soul.offer", "type": "string"}]
verbs: [send, email, reply, notify, message, conversation, qualify, nurture, reach out, speed to lead, follow up, welcome]
compose_with: [crm, caldiy-booking, formbricks-intake, sms, automation, brain-v2, payments]

<!-- TOOLS:START -->
[
  {
    "name": "send_email",
    "description": "Send a one-off email through the workspace's configured provider (Resend by default). Checks the suppression list before sending and skips with {suppressed: true} if the recipient has opted out.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "to": {
          "type": "string",
          "format": "email",
          "pattern": "^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$",
          "description": "Recipient email address."
        },
        "subject": {
          "type": "string",
          "minLength": 1,
          "description": "Email subject line."
        },
        "body": {
          "type": "string",
          "minLength": 1,
          "description": "Plain-text body — rendered into the default HTML shell."
        },
        "contact_id": {
          "description": "Optional. Links the email to a CRM contact for threading.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        },
        "provider": {
          "description": "Optional. Force a specific provider (default: resend).",
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
        "to",
        "subject",
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
                "email": {
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
                    "to": {
                      "type": "string",
                      "format": "email",
                      "pattern": "^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"
                    },
                    "subject": {
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
                        "opened",
                        "clicked",
                        "bounced",
                        "replied",
                        "failed"
                      ]
                    },
                    "provider": {
                      "type": "string"
                    },
                    "providerMessageId": {
                      "anyOf": [
                        {
                          "type": "string"
                        },
                        {
                          "type": "null"
                        }
                      ]
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
                    "openedAt": {
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
                    "clickedAt": {
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
                    "bouncedAt": {
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
                    "suppressedReason": {
                      "anyOf": [
                        {
                          "type": "string",
                          "enum": [
                            "manual",
                            "unsubscribe",
                            "bounce",
                            "complaint"
                          ]
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
                    "to",
                    "subject",
                    "body",
                    "status",
                    "provider",
                    "providerMessageId",
                    "sentAt",
                    "deliveredAt",
                    "openedAt",
                    "clickedAt",
                    "bouncedAt",
                    "suppressedReason",
                    "createdAt"
                  ],
                  "additionalProperties": false
                },
                "suppressed": {
                  "type": "boolean"
                }
              },
              "required": [
                "email"
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
                    "unsubscribe",
                    "bounce",
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
      "email.sent"
    ]
  },
  {
    "name": "list_emails",
    "description": "List recent emails sent from the workspace, newest first. Useful for checking delivery status before following up.",
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
              "to": {
                "type": "string",
                "format": "email",
                "pattern": "^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"
              },
              "subject": {
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
                  "opened",
                  "clicked",
                  "bounced",
                  "replied",
                  "failed"
                ]
              },
              "provider": {
                "type": "string"
              },
              "providerMessageId": {
                "anyOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ]
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
              "openedAt": {
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
              "clickedAt": {
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
              "bouncedAt": {
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
              "suppressedReason": {
                "anyOf": [
                  {
                    "type": "string",
                    "enum": [
                      "manual",
                      "unsubscribe",
                      "bounce",
                      "complaint"
                    ]
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
              "to",
              "subject",
              "body",
              "status",
              "provider",
              "providerMessageId",
              "sentAt",
              "deliveredAt",
              "openedAt",
              "clickedAt",
              "bouncedAt",
              "suppressedReason",
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
    "name": "get_email",
    "description": "Fetch a single email with its full provider-event history (sent / delivered / opened / clicked / bounced).",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "email_id": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
          "description": "Email ID returned from send_email or list_emails."
        },
        "workspace_id": {
          "description": "Optional. Falls back to the active workspace.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "required": [
        "email_id"
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
            "email": {
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
                "to": {
                  "type": "string",
                  "format": "email",
                  "pattern": "^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"
                },
                "subject": {
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
                    "opened",
                    "clicked",
                    "bounced",
                    "replied",
                    "failed"
                  ]
                },
                "provider": {
                  "type": "string"
                },
                "providerMessageId": {
                  "anyOf": [
                    {
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ]
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
                "openedAt": {
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
                "clickedAt": {
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
                "bouncedAt": {
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
                "suppressedReason": {
                  "anyOf": [
                    {
                      "type": "string",
                      "enum": [
                        "manual",
                        "unsubscribe",
                        "bounce",
                        "complaint"
                      ]
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
                "to",
                "subject",
                "body",
                "status",
                "provider",
                "providerMessageId",
                "sentAt",
                "deliveredAt",
                "openedAt",
                "clickedAt",
                "bouncedAt",
                "suppressedReason",
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
                      "sent",
                      "delivered",
                      "opened",
                      "clicked",
                      "bounced",
                      "complained"
                    ]
                  },
                  "at": {
                    "type": "string",
                    "format": "date-time",
                    "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                  },
                  "metadata": {
                    "type": "object",
                    "propertyNames": {
                      "type": "string"
                    },
                    "additionalProperties": {}
                  }
                },
                "required": [
                  "type",
                  "at"
                ],
                "additionalProperties": false
              }
            }
          },
          "required": [
            "email",
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
    "name": "list_suppressions",
    "description": "List all suppressed email addresses for the workspace — who is opted out and why (manual / unsubscribe / bounce / complaint).",
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
              "email": {
                "type": "string",
                "format": "email",
                "pattern": "^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"
              },
              "reason": {
                "type": "string",
                "enum": [
                  "manual",
                  "unsubscribe",
                  "bounce",
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
              "email",
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
    "name": "suppress_email",
    "description": "Add an email address to the workspace suppression list so future sends skip it. Use for manual unsubscribes or policy blocks.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "email": {
          "type": "string",
          "format": "email",
          "pattern": "^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$",
          "description": "Email address to suppress."
        },
        "reason": {
          "description": "Reason code. Default: 'manual'.",
          "type": "string",
          "enum": [
            "manual",
            "unsubscribe",
            "bounce",
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
        "email"
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
            "email": {
              "type": "string",
              "format": "email",
              "pattern": "^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"
            },
            "reason": {
              "type": "string",
              "enum": [
                "manual",
                "unsubscribe",
                "bounce",
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
            "email",
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
      "email.suppressed"
    ]
  },
  {
    "name": "unsuppress_email",
    "description": "Remove an email address from the workspace suppression list so future sends go through again.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "email": {
          "type": "string",
          "format": "email",
          "pattern": "^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$",
          "description": "Email address to un-suppress."
        },
        "workspace_id": {
          "description": "Optional. Falls back to the active workspace.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "required": [
        "email"
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
          "type": "string",
          "format": "email",
          "pattern": "^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"
        }
      },
      "required": [
        "ok",
        "removed"
      ],
      "additionalProperties": false
    },
    "emits": []
  },
  {
    "name": "send_conversation_turn",
    "description": "Route an incoming message through the Conversation Primitive runtime. Loads prior turns for (contact, channel), generates a Soul-aware reply with Claude, writes both inbound + outbound turns, and emits conversation.turn.received / sent events. Use when building an always-on conversational agent (speed-to-lead, qualification chatbot).",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "contact_id": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
          "description": "CRM contact to converse with."
        },
        "channel": {
          "type": "string",
          "enum": [
            "email",
            "sms"
          ],
          "description": "Transport channel."
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "description": "Incoming message content to reason about."
        },
        "conversation_id": {
          "description": "Optional existing conversation id. Omit to let the runtime reuse the most recent active thread or open a new one.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        },
        "subject": {
          "description": "Optional subject for email threads.",
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
        "contact_id",
        "channel",
        "message"
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
            "conversationId": {
              "type": "string",
              "format": "uuid",
              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
            },
            "inboundTurn": {
              "type": "object",
              "properties": {
                "turnId": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "conversationId": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "direction": {
                  "type": "string",
                  "enum": [
                    "inbound",
                    "outbound"
                  ]
                },
                "channel": {
                  "type": "string",
                  "enum": [
                    "email",
                    "sms"
                  ]
                },
                "content": {
                  "type": "string"
                },
                "createdAt": {
                  "type": "string",
                  "format": "date-time",
                  "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                }
              },
              "required": [
                "turnId",
                "conversationId",
                "direction",
                "channel",
                "content",
                "createdAt"
              ],
              "additionalProperties": false
            },
            "outboundTurn": {
              "type": "object",
              "properties": {
                "turnId": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "conversationId": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "direction": {
                  "type": "string",
                  "enum": [
                    "inbound",
                    "outbound"
                  ]
                },
                "channel": {
                  "type": "string",
                  "enum": [
                    "email",
                    "sms"
                  ]
                },
                "content": {
                  "type": "string"
                },
                "createdAt": {
                  "type": "string",
                  "format": "date-time",
                  "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                }
              },
              "required": [
                "turnId",
                "conversationId",
                "direction",
                "channel",
                "content",
                "createdAt"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "conversationId",
            "inboundTurn",
            "outboundTurn"
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
      "conversation.turn.received",
      "conversation.turn.sent"
    ]
  }
]
<!-- TOOLS:END -->

---

## Notes for agent synthesis

When an agent needs to "send an email" in response to a trigger, compose `email.block` after the trigger-emitting block (`formbricks-intake.form.submitted`, `caldiy-booking.booking.created`, `crm.deal.stage_changed`, etc.). Prefer template-driven sends for repeatable outreach — store templates on `organizations.settings.emailTemplates` with a `triggerEvent` field so the event bus fan-out handles routing. For multi-turn reasoning ("answer the prospect's question, then book a call"), compose through `send_conversation_turn` which uses the Conversation Primitive runtime and shares state with Phase 4 SMS.

Always check the suppression list before a manual send (the pre-send hook does this automatically, but agents should consult `list_suppressions` when generating outreach strategy to avoid proposing a sequence to addresses that will be skipped).

---

## Navigation

- `/emails` — dashboard send + template management
- `/emails/compose` — compose drawer (per-contact, Soul-aware template picker)
- `/contacts/[id]` — per-contact thread view (Phase 3.j)
- `/settings/integrations/resend` — Resend connection card + webhook URL
- `/settings/suppression` — suppression list manager
