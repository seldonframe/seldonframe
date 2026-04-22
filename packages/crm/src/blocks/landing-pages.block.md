---
id: landing-pages
scope: universal
frameworks: agency,coaching,consulting,service,realestate,ecommerce,saas
status: core
---
# BLOCK: Landing Pages

**Description**
Puck-based landing-page editor + public renderer + Claude-powered generator. Pages are JSON (Puck's `{content, root, zones}` shape), validated against a typed component registry before save, statically rendered via Next ISR at `/l/<orgSlug>/<pageSlug>`, and tracked via client-side visit beacons so ISR caching doesn't skip analytics.

**Behavior**
Composition-driven, not turn-driven (email/sms) and not state-machine-driven (payments). The block is a thin wrapper over Puck's editor + data model, with three additions:
1. **Validator** (`lib/puck/validator.ts`) — introspects `puckConfig` and rejects payloads that mis-use enums, miss required ids, reference unknown components, or drift from documented props. Runs on every save from every source.
2. **Claude generation path** (`lib/puck/generate-with-claude.ts`) — Soul-aware page drafting. Phase 7 Agent Synthesis will drive this; Phase 6 ships the endpoint.
3. **Visit beacon** (`components/landing/visit-beacon.tsx`) — fires `navigator.sendBeacon` on public-page load so cached pages still emit analytics.

**Integration Points**
- **CRM** — `landing.converted` writes a contact on submit via `FormContainer` → `/api/v1/forms/submit`.
- **Formbricks intake** — Puck's `FormContainer` + typed input components are the rendered surface for a form block living inside a page.
- **Brain v2** — `landing.visited` + `landing.converted` feed conversion-funnel learning.
- **Automations** — `landing.published` is a trigger (launch-day email blast, etc.). `landing.visited` with a scored threshold is a trigger for retargeting flows.
- **Email / SMS** — `FormContainer` scoring thresholds redirect qualified leads to booking; downstream automations send confirmation messages.
- **Payments** — `PaymentButton` Puck component embeds a checkout link per page; payment completion emits `payment.completed` attributed to the landing source.

---

## Purpose

The builder-facing face of the workspace for cold traffic. The SMB's ads, social posts, business-card QR codes all point here. Quality of the generated page is the deciding factor in whether a booked lead becomes a first-touch conversion. Claude-driven drafting + Soul-aware copy is the differentiator vs GoHighLevel's drag-and-drop-only editor — but the editor still exists for builders who want to hand-tune.

---

## Entities

- **LandingPage** (`landing_pages`): `title`, `slug`, `status` (draft | published), `pageType`, `source` (scratch | template | soul | api), `puckData` (the Puck payload), `sections` (legacy; kept for backward compat), `contentHtml`+`contentCss` (legacy rendered output for pre-Puck pages), `seo`, `settings`.

The Puck payload is the source of truth for new pages. Legacy `sections`/`contentHtml` stays populated for pages authored before Puck was enabled; the public renderer checks for `contentHtml` first, falls back to `sections`, then falls back to `puckData` via `PageRenderer`.

---

## Events

### Emits
- `landing.published` — `{pageId, slug, orgId}`. Fires on publish via `publishLandingPageFromApi` + the server-action equivalent. Also busts ISR via `revalidatePath` and dispatches a workspace webhook.
- `landing.unpublished` — `{pageId, orgId}`. Reverse of publish.
- `landing.updated` — `{pageId, orgId}`. Emitted from any `updateLandingPageFromApi` call; re-triggers cache bust if the page is currently published.
- `landing.visited` — `{pageId, visitorId}`. Emitted from the client beacon on each real browser view. Throttled per-session via `sessionStorage` + per-visitor via an `sf_vid` cookie (400-day Max-Age, SameSite=Lax).
- `landing.converted` — `{pageId, contactId}`. Emitted when a visitor submits a FormContainer on a page; writes the contact, links it to the source page in metadata.

### Listens
- None directly — landing pages are a publishing surface. Soul updates + theme changes are read on-demand, not reactively.

---

## Composition Contract

Machine-readable contract for Phase 7 agent synthesis. Migrated to v2
(Scope 3 Step 2b.2 block 6 — the FINAL 2b.2 block). `produces` +
`consumes` are JSON arrays of typed objects. `verbs` + `compose_with`
remain string arrays (v1 shape intentionally preserved — they're
human-authored hints, not type-checked).

**Webhook/beacon-produced events:** `landing.visited` fires from the
client-side `sendBeacon` (not from any MCP tool); `landing.converted`
fires from FormContainer submission (not from any MCP tool either).
Both are in `produces` but aren't in any tool's `emits` — same
pattern as Payments (block.produces ⊃ Σ tool.emits, with the
validator enforcing `tool.emits ⊆ block.produces`).

**Containment** (per L-17 + L-18):
The 32 Puck components across 5 categories (layout / content / forms
/ business / interactive) live in `lib/puck/config.impl.tsx` (client)
and `lib/puck/config-fields.ts` (server-safe). The MCP tool schemas
in `landing.tools.ts` surface Puck payloads as
`z.record(z.string(), z.unknown())` at the boundary — the full typed
shape is owned by the Puck validator, not duplicated into each tool.
Any agent authoring a Puck payload should go through
`generate_landing_page` (Claude-drafted + pre-validated) or a
template's payload. Rich Puck authoring is a UI concern, not an MCP
concern.

**L-18 discipline** (see `tasks/lessons.md`):
`landing.tools.ts` imports only `zod` and the `contract-v2` types.
No imports from `lib/puck/config.impl` (client-only React). Server-
routes that import `landing.tools.ts` transitively are safe to build
on Vercel.

**Archetype coverage:** ZERO shipped archetypes (Speed-to-Lead,
Win-Back, Review-Requester) reference any landing tool or landing.*
event. Landing pages are a publishing surface for cold traffic;
agents drive through `create_landing_page` / `generate_landing_page`
at onboarding time, not inside archetype workflows. Hash preservation
on the 9-probe regression is a pure negative-control check.

produces: [{"event": "landing.published"}, {"event": "landing.unpublished"}, {"event": "landing.updated"}, {"event": "landing.visited"}, {"event": "landing.converted"}]
consumes: [{"kind": "soul_field", "soul_field": "workspace.soul.business_type", "type": "string"}, {"kind": "soul_field", "soul_field": "workspace.soul.services", "type": "string"}, {"kind": "soul_field", "soul_field": "workspace.soul.tone", "type": "string"}, {"kind": "soul_field", "soul_field": "workspace.soul.mission", "type": "string"}, {"kind": "soul_field", "soul_field": "workspace.soul.offer", "type": "string"}, {"kind": "soul_field", "soul_field": "workspace.soul.entity_labels", "type": "string"}, {"kind": "soul_field", "soul_field": "workspace.soul.journey_stages", "type": "string"}, {"kind": "soul_field", "soul_field": "workspace.theme.primary_color", "type": "string"}]
verbs: [page, landing, website, publish, generate page, copy, homepage, squeeze, hero, cta, funnel, optin]
compose_with: [formbricks-intake, crm, caldiy-booking, email, sms, payments, automation, brain-v2]

<!-- TOOLS:START -->
[
  {
    "name": "list_landing_pages",
    "description": "List the workspace's landing pages (draft + published), newest-updated first.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "limit": {
          "description": "Max rows (default 50, max 200).",
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
              "title": {
                "type": "string"
              },
              "slug": {
                "type": "string"
              },
              "status": {
                "type": "string",
                "enum": [
                  "draft",
                  "published"
                ]
              },
              "pageType": {
                "anyOf": [
                  {
                    "type": "string",
                    "enum": [
                      "home",
                      "landing",
                      "custom"
                    ]
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "source": {
                "type": "string",
                "enum": [
                  "scratch",
                  "template",
                  "soul",
                  "api"
                ]
              },
              "puckData": {
                "anyOf": [
                  {
                    "type": "object",
                    "propertyNames": {
                      "type": "string"
                    },
                    "additionalProperties": {},
                    "description": "Puck payload { content: [], root: {props}, zones: {} }. Validated against the typed Puck config on every save. Prefer generate_landing_page or a template's payload over hand-authoring."
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "publicUrl": {
                "anyOf": [
                  {
                    "type": "string",
                    "format": "uri"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "publishedAt": {
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
              "createdAt": {
                "type": "string",
                "format": "date-time",
                "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
              },
              "updatedAt": {
                "type": "string",
                "format": "date-time",
                "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
              }
            },
            "required": [
              "id",
              "title",
              "slug",
              "status",
              "pageType",
              "source",
              "puckData",
              "publicUrl",
              "publishedAt",
              "createdAt",
              "updatedAt"
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
    "name": "get_landing_page",
    "description": "Fetch a single landing page with its full Puck payload + metadata.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "page_id": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
          "description": "Landing page ID from list_landing_pages."
        },
        "workspace_id": {
          "description": "Optional. Falls back to the active workspace.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "required": [
        "page_id"
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
            "id": {
              "type": "string",
              "format": "uuid",
              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
            },
            "title": {
              "type": "string"
            },
            "slug": {
              "type": "string"
            },
            "status": {
              "type": "string",
              "enum": [
                "draft",
                "published"
              ]
            },
            "pageType": {
              "anyOf": [
                {
                  "type": "string",
                  "enum": [
                    "home",
                    "landing",
                    "custom"
                  ]
                },
                {
                  "type": "null"
                }
              ]
            },
            "source": {
              "type": "string",
              "enum": [
                "scratch",
                "template",
                "soul",
                "api"
              ]
            },
            "puckData": {
              "anyOf": [
                {
                  "type": "object",
                  "propertyNames": {
                    "type": "string"
                  },
                  "additionalProperties": {},
                  "description": "Puck payload { content: [], root: {props}, zones: {} }. Validated against the typed Puck config on every save. Prefer generate_landing_page or a template's payload over hand-authoring."
                },
                {
                  "type": "null"
                }
              ]
            },
            "publicUrl": {
              "anyOf": [
                {
                  "type": "string",
                  "format": "uri"
                },
                {
                  "type": "null"
                }
              ]
            },
            "publishedAt": {
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
            "createdAt": {
              "type": "string",
              "format": "date-time",
              "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
            },
            "updatedAt": {
              "type": "string",
              "format": "date-time",
              "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
            }
          },
          "required": [
            "id",
            "title",
            "slug",
            "status",
            "pageType",
            "source",
            "puckData",
            "publicUrl",
            "publishedAt",
            "createdAt",
            "updatedAt"
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
    "name": "create_landing_page",
    "description": "Create a landing page from an optional Puck payload. Without puck_data, creates a blank draft. With puck_data, validates the payload against the Puck schema and rejects on mismatch. Set published=true to publish immediately.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "title": {
          "type": "string",
          "minLength": 1,
          "description": "Page title (used for the dashboard; not the public URL)."
        },
        "slug": {
          "description": "Optional URL slug. Derived from title if omitted.",
          "type": "string"
        },
        "puck_data": {
          "description": "Optional Puck payload. Prefer generate_landing_page output or a template's payload.",
          "type": "object",
          "propertyNames": {
            "type": "string"
          },
          "additionalProperties": {}
        },
        "published": {
          "description": "If true, publish immediately. Default: draft.",
          "type": "boolean"
        },
        "workspace_id": {
          "description": "Optional. Falls back to the active workspace.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "required": [
        "title"
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
            "id": {
              "type": "string",
              "format": "uuid",
              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
            },
            "title": {
              "type": "string"
            },
            "slug": {
              "type": "string"
            },
            "status": {
              "type": "string",
              "enum": [
                "draft",
                "published"
              ]
            },
            "pageType": {
              "anyOf": [
                {
                  "type": "string",
                  "enum": [
                    "home",
                    "landing",
                    "custom"
                  ]
                },
                {
                  "type": "null"
                }
              ]
            },
            "source": {
              "type": "string",
              "enum": [
                "scratch",
                "template",
                "soul",
                "api"
              ]
            },
            "puckData": {
              "anyOf": [
                {
                  "type": "object",
                  "propertyNames": {
                    "type": "string"
                  },
                  "additionalProperties": {},
                  "description": "Puck payload { content: [], root: {props}, zones: {} }. Validated against the typed Puck config on every save. Prefer generate_landing_page or a template's payload over hand-authoring."
                },
                {
                  "type": "null"
                }
              ]
            },
            "publicUrl": {
              "anyOf": [
                {
                  "type": "string",
                  "format": "uri"
                },
                {
                  "type": "null"
                }
              ]
            },
            "publishedAt": {
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
            "createdAt": {
              "type": "string",
              "format": "date-time",
              "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
            },
            "updatedAt": {
              "type": "string",
              "format": "date-time",
              "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
            }
          },
          "required": [
            "id",
            "title",
            "slug",
            "status",
            "pageType",
            "source",
            "puckData",
            "publicUrl",
            "publishedAt",
            "createdAt",
            "updatedAt"
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
      "landing.published"
    ]
  },
  {
    "name": "update_landing_page",
    "description": "Update a landing page's title and/or Puck payload. Validates puck_data on the way through. Does not change publish status — use publish_landing_page for that.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "page_id": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
          "description": "Landing page to update."
        },
        "title": {
          "description": "Optional new title.",
          "type": "string",
          "minLength": 1
        },
        "puck_data": {
          "description": "Optional new Puck payload. Pass null to clear.",
          "anyOf": [
            {
              "type": "object",
              "propertyNames": {
                "type": "string"
              },
              "additionalProperties": {},
              "description": "Puck payload { content: [], root: {props}, zones: {} }. Validated against the typed Puck config on every save. Prefer generate_landing_page or a template's payload over hand-authoring."
            },
            {
              "type": "null"
            }
          ]
        },
        "workspace_id": {
          "description": "Optional. Falls back to the active workspace.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "required": [
        "page_id"
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
            "id": {
              "type": "string",
              "format": "uuid",
              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
            },
            "title": {
              "type": "string"
            },
            "slug": {
              "type": "string"
            },
            "status": {
              "type": "string",
              "enum": [
                "draft",
                "published"
              ]
            },
            "pageType": {
              "anyOf": [
                {
                  "type": "string",
                  "enum": [
                    "home",
                    "landing",
                    "custom"
                  ]
                },
                {
                  "type": "null"
                }
              ]
            },
            "source": {
              "type": "string",
              "enum": [
                "scratch",
                "template",
                "soul",
                "api"
              ]
            },
            "puckData": {
              "anyOf": [
                {
                  "type": "object",
                  "propertyNames": {
                    "type": "string"
                  },
                  "additionalProperties": {},
                  "description": "Puck payload { content: [], root: {props}, zones: {} }. Validated against the typed Puck config on every save. Prefer generate_landing_page or a template's payload over hand-authoring."
                },
                {
                  "type": "null"
                }
              ]
            },
            "publicUrl": {
              "anyOf": [
                {
                  "type": "string",
                  "format": "uri"
                },
                {
                  "type": "null"
                }
              ]
            },
            "publishedAt": {
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
            "createdAt": {
              "type": "string",
              "format": "date-time",
              "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
            },
            "updatedAt": {
              "type": "string",
              "format": "date-time",
              "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
            }
          },
          "required": [
            "id",
            "title",
            "slug",
            "status",
            "pageType",
            "source",
            "puckData",
            "publicUrl",
            "publishedAt",
            "createdAt",
            "updatedAt"
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
      "landing.updated"
    ]
  },
  {
    "name": "publish_landing_page",
    "description": "Flip a landing page between draft and published. Publishing busts the public-URL cache immediately and emits landing.published. Pass published=false to unpublish.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "page_id": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
          "description": "Landing page to publish."
        },
        "published": {
          "description": "true = publish (default), false = unpublish.",
          "type": "boolean"
        },
        "workspace_id": {
          "description": "Optional. Falls back to the active workspace.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "required": [
        "page_id"
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
            "id": {
              "type": "string",
              "format": "uuid",
              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
            },
            "title": {
              "type": "string"
            },
            "slug": {
              "type": "string"
            },
            "status": {
              "type": "string",
              "enum": [
                "draft",
                "published"
              ]
            },
            "pageType": {
              "anyOf": [
                {
                  "type": "string",
                  "enum": [
                    "home",
                    "landing",
                    "custom"
                  ]
                },
                {
                  "type": "null"
                }
              ]
            },
            "source": {
              "type": "string",
              "enum": [
                "scratch",
                "template",
                "soul",
                "api"
              ]
            },
            "puckData": {
              "anyOf": [
                {
                  "type": "object",
                  "propertyNames": {
                    "type": "string"
                  },
                  "additionalProperties": {},
                  "description": "Puck payload { content: [], root: {props}, zones: {} }. Validated against the typed Puck config on every save. Prefer generate_landing_page or a template's payload over hand-authoring."
                },
                {
                  "type": "null"
                }
              ]
            },
            "publicUrl": {
              "anyOf": [
                {
                  "type": "string",
                  "format": "uri"
                },
                {
                  "type": "null"
                }
              ]
            },
            "publishedAt": {
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
            "createdAt": {
              "type": "string",
              "format": "date-time",
              "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
            },
            "updatedAt": {
              "type": "string",
              "format": "date-time",
              "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
            }
          },
          "required": [
            "id",
            "title",
            "slug",
            "status",
            "pageType",
            "source",
            "puckData",
            "publicUrl",
            "publishedAt",
            "createdAt",
            "updatedAt"
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
      "landing.published",
      "landing.unpublished"
    ]
  },
  {
    "name": "list_landing_templates",
    "description": "List the pre-built vertical landing-page templates. Each has a validated Puck payload ready to seed a new page via create_landing_page({puck_data: template.payload}).",
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
              "id": {
                "type": "string"
              },
              "name": {
                "type": "string"
              },
              "description": {
                "anyOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "vertical": {
                "anyOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "description": "Optional vertical tag (e.g., 'dental', 'coaching', 'realestate')."
              },
              "payload": {
                "type": "object",
                "propertyNames": {
                  "type": "string"
                },
                "additionalProperties": {},
                "description": "Pre-validated Puck payload ready to seed create_landing_page."
              }
            },
            "required": [
              "id",
              "name",
              "description",
              "vertical",
              "payload"
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
    "name": "get_landing_template",
    "description": "Fetch a single landing-page template including its Puck payload. Pair with create_landing_page to seed a new page from the template.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "template_id": {
          "type": "string",
          "description": "Template ID from list_landing_templates."
        },
        "workspace_id": {
          "description": "Optional. Falls back to the active workspace.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "required": [
        "template_id"
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
            "id": {
              "type": "string"
            },
            "name": {
              "type": "string"
            },
            "description": {
              "anyOf": [
                {
                  "type": "string"
                },
                {
                  "type": "null"
                }
              ]
            },
            "vertical": {
              "anyOf": [
                {
                  "type": "string"
                },
                {
                  "type": "null"
                }
              ],
              "description": "Optional vertical tag (e.g., 'dental', 'coaching', 'realestate')."
            },
            "payload": {
              "type": "object",
              "propertyNames": {
                "type": "string"
              },
              "additionalProperties": {},
              "description": "Pre-validated Puck payload ready to seed create_landing_page."
            }
          },
          "required": [
            "id",
            "name",
            "description",
            "vertical",
            "payload"
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
    "name": "generate_landing_page",
    "description": "Generate a Puck landing-page payload from a natural-language prompt using Claude + the workspace's Soul + theme. Returns a pre-validated payload but does NOT persist — pair with create_landing_page to save the result.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "prompt": {
          "type": "string",
          "minLength": 1,
          "description": "One-sentence page description. The more specific, the better."
        },
        "existing": {
          "description": "Optional existing Puck payload to revise rather than start fresh.",
          "type": "object",
          "propertyNames": {
            "type": "string"
          },
          "additionalProperties": {}
        },
        "workspace_id": {
          "description": "Optional. Falls back to the active workspace.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "required": [
        "prompt"
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
            "payload": {
              "type": "object",
              "propertyNames": {
                "type": "string"
              },
              "additionalProperties": {},
              "description": "Puck payload { content: [], root: {props}, zones: {} }. Validated against the typed Puck config on every save. Prefer generate_landing_page or a template's payload over hand-authoring."
            },
            "validationNotes": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "description": "Empty array when generation produced a schema-valid payload first-shot."
            }
          },
          "required": [
            "payload",
            "validationNotes"
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
  }
]
<!-- TOOLS:END -->

---

## Notes for agent synthesis

**UI-composition is Puck's job, not the contract.** `compose_with` is block-slug level — it says "landing pairs with payments" but not *how*. The how lives in `lib/puck/config.impl.tsx`: the `PaymentButton` component is what actually gets embedded. Agents composing a landing page read both:
1. This BLOCK.md for which blocks the page can pair with (event + data-flow level).
2. `puckConfig` for which Puck components exist and their typed fields (UI-composition level).

A `ui_components` field in the contract is queued for V1.1 — see the 6.a audit.

**Validator is load-bearing.** Any agent producing a Puck payload must route it through `validatePuckPayload` before calling `create_landing_page` / `update_landing_page`. The MCP tool bindings do this already. Custom agent code should too.

**Generation is Phase 7's job; this block exposes the endpoint.** `generate_landing_page` returns a validated payload without persisting. The Phase 7 Agent Synthesis loop calls this endpoint, optionally revises with a second prompt, then calls `create_landing_page` to save. Keeping generation out of this block preserves the thin-harness separation — the block primitives know nothing about agent loops.

**Component coverage:** 32 Puck components across layout / content / forms / business / interactive categories. More than v1 needs; do not add more without a concrete use case. Agents should prefer combining existing components over requesting new ones.

**Cache + beacon semantics:** Public pages cache for 3600s (1 hour) and bust on publish/update. The client beacon fires once per session per page per visitor; double-counting from React StrictMode or SPA re-mounts is suppressed via `sessionStorage`.

---

## Navigation

- `/editor/[pageId]` — Puck editor (dashboard, session-authed)
- `/landing` — dashboard list of pages
- `/l/[orgSlug]/[slug]` — public URL (ISR-cached, client-beaconed)
- `/api/v1/landing` — MCP surface (GET + POST)
- `/api/v1/landing/[id]` — GET + PATCH
- `/api/v1/landing/[id]/publish` — POST
- `/api/v1/landing/generate` — POST (Claude-driven draft)
- `/api/v1/landing/track-visit` — public POST (client beacon)
