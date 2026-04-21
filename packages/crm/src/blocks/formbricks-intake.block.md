---
id: formbricks-intake
scope: universal
frameworks: agency,coaching,consulting,service,realestate,ecommerce,saas
source_repo: https://github.com/formbricks/formbricks
source_version_verified: main (2026-04-18)
---
# BLOCK: Formbricks Intake

**Description**
Drop-in replacement for the basic SeldonFrame intake form with a full Formbricks-parity survey/intake system: 15 question types, conditional logic, multi-step branching, hidden fields, variables, quotas, link + in-app surveys, webhooks, embed SDK, and response analytics — all schema-driven through this BLOCK.md, installable via the existing block installer (`blockType: "form"`), client-scopable via `end_client_mode`, and Brain-integrated.

**Trigger Phrases**
- "Install the Formbricks intake"
- "Upgrade my intake form to Formbricks"
- "Replace the intake form with Formbricks"
- "Give me a Typeform-style intake with conditional logic"
- "Add a multi-step survey to my site"

**Behavior**
Materialize a Formbricks-equivalent intake subsystem on top of SeldonFrame's existing `form` primitive without breaking any existing form route. The block installer already supports `blockType: "form"`; this skill defines the schema, pages, events, and customization contract agents MUST follow when creating or updating intake entities via Seldon It. When installed in `end_client_mode`, all entities are scoped to `client_id` via the existing `writeClientScopedOverride` path — no new scoping mechanism is introduced.

**Integration Points**
- CRM (Contact ← Response, Deal ← Response when converted)
- Brain v2 (`form_submitted`, `formbricks_block_configured`)
- Email (autoresponder on submit, internal notification)
- Pages (public link survey `/s/[orgSlug]/[surveySlug]`, embedded in any landing page)
- Automation (post-submit workflows: tag contact, assign deal, trigger booking)
- Cal.diy Booking (via the `cal` question type, no circular dependency introduced)

**Self Improve**
self_improve: true

---

## Purpose
Provide any vertical a production-grade intake/survey system that matches Formbricks (AGPLv3 core, verified main branch 2026-04-18) in question types, conditional logic, and distribution options, while staying native to the SeldonFrame architecture: thin harness, fat BLOCK.md, owned Brain v2, client-scoped overrides, schema-driven everything. Replaces the current basic intake without touching existing `form` primitive code.

---

## Entities

### Survey
A published intake/survey instance.
Fields: `name` (text, required), `slug` (text, unique-per-workspace, required), `type` (enum: `link` | `app`, default `link`), `status` (enum: `draft` | `in_progress` | `paused` | `completed`, default `draft`), `welcome_card` (json: `{headline, html, buttonLabel, timeToFinish, showResponseCount}`), `questions` (json: ordered array of Question objects — see below), `endings` (json: ordered array of Ending objects), `hidden_fields` (json: `{enabled: bool, field_ids: string[]}`), `variables` (json: `{id, name, type: text|number, default}[]`), `display_option` (enum: `display_once` | `display_multiple` | `display_some` | `respond_multiple`, default `display_once`), `display_limit` (int, nullable), `recontact_days` (int, nullable), `delay_seconds` (int, default 0), `auto_close_seconds` (int, nullable), `styling` (json: theme overrides — colors, radius, font), `languages` (json: `{code, default}[]`), `is_verify_email_enabled` (bool, default false), `is_single_response_per_email_enabled` (bool, default false), `pin` (text, nullable — PIN gate), `metadata` (json, free).

### Question
A single step inside `Survey.questions`. Rendered via existing form renderer.
Common fields: `id` (string, required, kebab), `type` (enum — see Question Types), `headline` (i18n string, required), `subheader` (i18n string, nullable), `required` (bool, default true), `button_label` (i18n string, nullable), `back_button_label` (i18n string, nullable), `logic` (array of LogicRule — see below).
Type-specific fields live under the `type`:
- `open_text`: `input_type` (`text` | `email` | `url` | `number` | `phone`), `placeholder`, `long_answer` (bool), `char_limit` (`{min, max}` nullable)
- `multiple_choice_single` / `multiple_choice_multi`: `choices` (`{id, label, i18n}[]`), `shuffle_option` (`none` | `all` | `except_last`), `other_option_placeholder` (nullable)
- `nps`: `lower_label`, `upper_label`, `is_colored_scale` (bool)
- `rating`: `range` (3 | 4 | 5 | 7 | 10), `scale` (`number` | `smiley` | `star`), `lower_label`, `upper_label`
- `cta`: `button_label`, `button_url` (nullable), `dismiss_button_label` (nullable), `html`
- `consent`: `html`, `label`
- `picture_selection`: `choices` (`{id, image_url}[]`), `allow_multi` (bool)
- `cal`: `cal_event_type_slug` (refs `caldiy-booking` event type — optional cross-block link)
- `date`: `format` (`M-d-y` | `d-M-y` | `y-M-d`)
- `matrix`: `rows` (string[]), `columns` (string[]), `shuffle` (`none` | `rows`)
- `address`: `address_line1`, `address_line2`, `city`, `state`, `zip`, `country` (each with `show` + `required`)
- `ranking`: `choices` (`{id, label}[]`)
- `contact_info`: `first_name`, `last_name`, `email`, `phone`, `company` (each with `show` + `required`)
- `file_upload`: `allow_multiple_files` (bool), `max_size_in_mb` (int), `allowed_file_extensions` (string[] nullable)

### LogicRule
Conditional branching attached to a Question.
Fields: `id` (string, required), `conditions` (`{connector: "and" | "or", children: ConditionLeaf[]}`), `actions` (Action[]).
`ConditionLeaf`: `{left: {type: "question"|"variable"|"hidden_field", value: string}, operator: LogicOperator, right: {type: "static"|"question"|"variable", value: any} | null}`.
`LogicOperator` allowlist: `equals`, `does_not_equal`, `contains`, `does_not_contain`, `starts_with`, `does_not_start_with`, `ends_with`, `does_not_end_with`, `is_valid_email`, `is_valid_url`, `matches_regex`, `is_greater_than`, `is_greater_than_or_equal`, `is_less_than`, `is_less_than_or_equal`, `is_longer_than`, `is_shorter_than`, `equals_one_of`, `includes_all_of`, `includes_one_of`, `is_submitted`, `is_skipped`, `is_clicked`, `is_accepted`, `is_booked`, `is_empty`, `is_not_empty`, `is_before`, `is_after`.
`Action`: `{type: "jump_to_question" | "jump_to_ending" | "require_answer" | "calculate_variable", target: string, value?: any, operator?: "assign"|"add"|"subtract"|"multiply"|"divide"|"concat"}`.

### Response
A single submission for a Survey.
Fields: `survey_id` → Survey, `contact_id` → contact (nullable for anonymous link surveys), `finished` (bool), `data` (json: `{[question_id]: answer}`), `variables` (json snapshot at finish), `ttc` (json: `{[question_id]: seconds}`), `meta` (json: `{source, url, userAgent, country, device}`), `single_use_id` (text, nullable), `language` (text, nullable), `tags` (string[]).

### Webhook
External delivery target for response events.
Fields: `name`, `url`, `source` (enum: `user` | `zapier` | `make` | `n8n`), `triggers` (array of: `response_created` | `response_updated` | `response_finished`), `survey_ids` (string[] — empty means all surveys), `secret` (text — HMAC header `x-formbricks-signature`).

### ActionClass
Trigger definition for `type: "app"` surveys (in-app SDK).
Fields: `name`, `key` (stable client-side event key), `type` (`code` | `no_code`), `no_code_config` (json: `{type: "click"|"pageview"|"exit_intent"|"50_percent_scroll", urlFilters, selector}`).

---

## Relations
- contact → response (one-to-many): a contact may submit many responses across surveys
- survey → response (one-to-many)
- survey → webhook (many-to-many via `webhook.survey_ids`)
- survey → action_class (many-to-many): triggers that show an app-type survey
- response → deal (optional one-to-one via post-submit automation — not auto-linked)

---

## Dependencies
Required: `Contact` (core), `Identity` (core).
Optional: `caldiy-booking` (enables the `cal` question type).
Do NOT introduce new dependencies.

---

## Events

### Emits
- `form_submitted` — on `Response.finished == true`. Payload: `{survey_id, survey_slug, survey_name, response_id, contact_id | null, finished: true, question_count, ttc_total_seconds, source, language}`. Hashed by existing `writeEvent` pipeline.
- `formbricks_block_configured` — on any create/update via Seldon It. Payload: `{survey_id, survey_slug, action: "created"|"updated"|"published"|"paused", question_count, has_logic: bool, type: "link"|"app"}`.

### Listens
- `contact.created` — prefill `hidden_fields.contact_id` when a known contact opens a link survey via magic-link.
- `booking.created` — when paired with `caldiy-booking`, mark matching `cal` question as `is_booked` in the existing response.
- `integration.credential_connected` — enable webhook delivery (Zapier/Make/n8n) when the relevant credential lands.

Do NOT emit events not listed above from this block.

---

## Composition Contract

Machine-readable contract consumed by Phase 7 agent synthesis. Event names use the canonical dot-notation vocabulary from `packages/core/src/events/index.ts` (`SeldonEvent` union) — distinct from the `BrainEventType` names in the `## Events` section above, which are the legacy Brain v2 operator-log names. Both coexist; synthesis reads only this section.

produces: [form.submitted, contact.created]
consumes: [workspace.soul.business_type, workspace.soul.customer_fields, contact.id, contact.email]
verbs: [intake, capture, collect, qualify, survey, ask, onboard, nps, feedback]
compose_with: [crm, caldiy-booking, email, sms, automation, brain-v2]

---

## Pages

### Admin (builder_mode)
- `/forms` — existing index; Formbricks surveys appear in the same list, discriminated by a `formbricks: true` marker in the form's `metadata`.
- `/forms/[id]/edit` — existing editor; when `formbricks: true`, renders the full question-type palette + logic editor + endings editor. Do NOT fork into a second route.
- `/forms/[id]/logic` — (new sub-route, optional) dedicated logic graph view. Only added if Seldon It requests it; default is inline on the edit page.
- `/forms/[id]/responses` — existing responses table; adds `ttc`, `language`, `meta.source` columns when `formbricks: true`.
- `/forms/[id]/webhooks` — (new sub-route) webhook CRUD.
- `/forms/[id]/settings` — (new sub-route) display options, recontact days, PIN, verify-email, single-response-per-email.

### Public
- `/s/[orgSlug]/[surveySlug]` — link survey (replaces the current basic intake path for Formbricks-backed forms; the old `/forms/[id]/[formSlug]` route remains untouched for non-Formbricks forms).
- `/s/[orgSlug]/[surveySlug]/thanks` — default ending.
- `/s/[orgSlug]/[surveySlug]/closed` — shown when `status != in_progress`.

### Embed
- Script tag `/embed/formbricks.js` — lightweight loader that opens a survey inside an iframe via `data-formbricks-survey="<slug>"`.
- Do NOT introduce a separate SDK npm package.

---

## Navigation
- Icon: `ClipboardList`
- Order: 20 (above `caldiy-booking` at 30)
- Label: "Forms"
- Already in the sidebar — DO NOT add a duplicate entry.

---

## Customization Rules (for Seldon It agents)
When a user asks to customize a Formbricks intake, agents MUST:
1. Resolve the target Survey by `slug` or `id`. If neither is given, ask once, then stop.
2. Mutate only `questions`, `endings`, `styling`, `display_option`, `recontact_days`, `delay_seconds`, `welcome_card`, `languages`, or webhook entries — never the `id`, `environmentId`, or `slug` after publish.
3. Validate the resulting Survey against the Entities schema above before persisting. Reject silently and report the specific field on failure.
4. Emit `formbricks_block_configured` with `action: "updated"` after a successful write.
5. Respect end-client scope (see below) — no cross-client reads or writes.

---

## End-client self-service contract (`end_client_mode`)

### Allowed
- Add/remove/reorder questions on a Survey owned by the client (`writeClientScopedOverride` scope).
- Edit question `headline`, `subheader`, `choices`, `placeholder`, `required`, `button_label`.
- Add simple logic (`equals`, `does_not_equal`, `is_submitted`, `is_skipped`) with `jump_to_question` or `jump_to_ending` actions.
- Change `welcome_card` copy and endings copy.
- Toggle `status` between `draft` and `in_progress` on their own surveys.
- Edit `styling` within the theme's allowed palette.

### NOT allowed (builder-only)
- Create/delete `Webhook` entries.
- Add/remove `ActionClass` triggers.
- Change `type` (`link` ↔ `app`) after creation.
- Modify `hidden_fields.field_ids` or `variables`.
- Set `pin`, `is_verify_email_enabled`, `is_single_response_per_email_enabled`.
- Touch any survey not owned by `client_id` (blocked by existing OpenClaw scope guard — NO new mechanism).
- Connect third-party integrations (Zapier/Make/n8n credentials).

If an end-client request crosses into the NOT-allowed list, the existing OpenClaw scope guard returns 422 with `blocked_category`. This block does NOT re-implement that guard.

---

## Brain v2 Signals
- Salience: `form_submitted` gets +0.2 from the existing heuristic; `formbricks_block_configured` rides the default 0.35.
- Insights: Brain may recommend survey improvements via `proposeBlockRewrite("formbricks-intake", suggestion)` — same contract as other blocks.
- Payload hygiene: submitted `data` MUST be passed through the existing `anonymizePayload` before `writeEvent`. Free-text answers become `{summary, char_count, field_type: "free_text"}`. Emails/phones/names get hashed. DO NOT bypass.
- DO NOT introduce a new event type beyond `formbricks_block_configured`.

---

## Seldon It Integration Notes
- Trigger phrases (top of file) route into the existing block installer with `blockType: "form"` and `variant: "formbricks"`.
- In `builder_mode`, Seldon It may create Surveys across any workspace the builder manages (uses existing `target_org_id` path from Slice #2).
- In `end_client_mode`, Seldon It MUST call `buildEndClientScopeContract(clientId)` (existing helper) and obey the Allowed/NOT-allowed lists above. No exceptions.
- Natural-language examples:
  - "Add a 5-star rating question after the email question" → insert `rating` question, set `range: 5`, logic-link to preceding.
  - "If they answer 'enterprise' jump to the demo booking step" → add LogicRule with `equals` + `jump_to_question` action.
  - "Send every finished response to my Zapier webhook" → create Webhook with `source: zapier`, `triggers: [response_finished]`.
  - "Make the intake mobile-only and show it once per user" → set `display_option: display_once`, add ActionClass with `no_code_config.urlFilters`.

---

## Karpathy Guidelines (enforced)
- **Think Before Coding**: every Seldon It run on this block MUST restate the target Survey id, the proposed diff, and the expected emitted event before mutating.
- **Simplicity First**: reuse the existing form renderer, form routes, and block installer. No new npm dependencies, no new database tables beyond what the form primitive already provides (stored in `metadata` / `settings` JSON).
- **Surgical Changes**: do not refactor existing form code to accommodate Formbricks features. Gate Formbricks behavior behind `metadata.formbricks === true`.
- **Goal-Driven Execution**: the goal is parity with Formbricks core question types + logic + webhooks + link distribution. Stop there.

---

## DO
1. DO discover and seed this block via the existing `seedInitialBlocks` registry (frontmatter above is sufficient).
2. DO register it with `blockType: "form"` in the block installer.
3. DO reuse `packages/crm/src/app/forms/**` routes and components; gate Formbricks UI behind `metadata.formbricks === true`.
4. DO anonymize response payloads through the existing `anonymizePayload` path before `writeEvent("form_submitted", …)`.
5. DO respect `end_client_mode` via the existing OpenClaw scope guard and `writeClientScopedOverride` helper.
6. DO validate every mutation against the Entities and LogicRule allowlists in this file before persisting.
7. DO emit `formbricks_block_configured` on create/update/publish/pause only — one event per write.
8. DO support the 15 question types listed — no more, no less.
9. DO keep logic operators to the allowlist in LogicRule — reject unknown operators.
10. DO expose webhooks via `/forms/[id]/webhooks` and sign deliveries with HMAC header `x-formbricks-signature` using the per-webhook `secret`.
11. DO make the public link survey accessible at `/s/[orgSlug]/[surveySlug]` and nothing else.
12. DO write cross-block integration with `caldiy-booking` only through the `cal` question type — no direct table joins.

## DO NOT
1. DO NOT touch `/forms/[id]/[formSlug]` or any existing non-Formbricks form route.
2. DO NOT add a new database table; persist Survey/Question/LogicRule/Response/Webhook inside the existing form primitive's JSON columns (`metadata`, `settings`, `response.data`).
3. DO NOT introduce a new npm dependency from the upstream Formbricks packages.
4. DO NOT port Formbricks UI code verbatim — reimplement the minimum renderer inside SeldonFrame's existing form renderer.
5. DO NOT create a second sidebar entry; reuse the existing "Forms" nav item.
6. DO NOT add new Brain event types beyond `formbricks_block_configured` (which was added in this slice) and the pre-existing `form_submitted`.
7. DO NOT bypass `anonymizePayload` for any reason, including "debug" or "admin" flags.
8. DO NOT allow end-clients to manage Webhooks, ActionClasses, integrations, or surveys outside their `client_id` scope.
9. DO NOT change the `type` (`link` ↔ `app`) after a Survey is created — force recreation.
10. DO NOT fork the block installer; register via the existing `blockType: "form"` path.
11. DO NOT emit `form_submitted` on partial responses — only on `finished == true`.
12. DO NOT implement AGPL-licensed or EE-only Formbricks features (anything under `apps/web/modules/ee/` upstream). This block is core-only.

## Success criteria (A–H)
- **A.** A new BLOCK.md file `packages/crm/src/blocks/formbricks-intake.block.md` exists with valid frontmatter (`id: formbricks-intake`, `scope: universal`, frameworks csv) and auto-seeds via `seedInitialBlocks`.
- **B.** The skill is installable via the existing block installer (`blockType: "form"`, `variant: "formbricks"`) without introducing a new installer path.
- **C.** `end_client_mode` respects the Allowed / NOT-allowed lists above, enforced through the existing OpenClaw scope guard.
- **D.** Seldon It can create, update, pause, and publish a Formbricks survey via natural language using the trigger phrases — no new Seldon It entry point.
- **E.** Brain v2 receives `form_submitted` on finish (anonymized) and `formbricks_block_configured` on configuration changes; no other event types are introduced.
- **F.** No existing intake/form route is altered or removed; all current `/forms/**` and `/forms/[id]/[formSlug]` routes continue to work untouched.
- **G.** Production-ready: no new npm deps, no new DB tables, JSON-stored schema, HMAC-signed webhooks, client-scoped overrides via existing helper, anonymized analytics.
- **H.** This BLOCK.md itself documents every natural-language customization path (see "Seldon It Integration Notes" examples) clearly enough that a new Seldon It run can execute them without opening any other file.

## Stop condition
Once all eight success criteria are materialized via this BLOCK.md and the single `BrainEventType` addition (`formbricks_block_configured`), STOP. Do not:
- Port any Formbricks TypeScript code.
- Add any route under `/api/v1/formbricks/*` — reuse `/api/v1/forms/*`.
- Refactor the existing form primitive.
- Pre-build UI components before a Seldon It run requests them.
- Touch Cal.diy, vertical packs, orchestration, or OpenClaw code.

---

## Reference mapping (Formbricks → SeldonFrame)
| Formbricks (Prisma/types) | SeldonFrame (this block) |
| --- | --- |
| `Survey` model | Survey entity (JSON in form `metadata`) |
| `TSurveyQuestionTypeEnum` (15 values) | Question.`type` allowlist |
| Survey `questions` JSON column | Survey.questions (same JSON shape) |
| `LogicRule` + operators | LogicRule entity + LogicOperator allowlist |
| `Response` model | Response entity (existing form response row) |
| `Webhook` model | Webhook entity + `/forms/[id]/webhooks` |
| `ActionClass` + `noCodeConfig` | ActionClass entity (app-type surveys only) |
| `SurveyStatus` (draft/inProgress/paused/completed) | Survey.status (same enum, snake_case) |
| `displayOptions` | Survey.display_option |
| `WebhookSource` | Webhook.source |
| `PipelineTriggers` | Webhook.triggers |
| `singleUseId` | Response.single_use_id |
| `ttc` | Response.ttc |
| Embed SDK (`@formbricks/js`) | `/embed/formbricks.js` loader (iframe) |

---

## How to customize with natural language (end-user facing)
Say any of these to Seldon It (works in both builder and end-client modes, scoped accordingly):
- "Add a question asking for their budget as a number between 1000 and 100000."
- "If they pick 'not sure', skip to the end and show a friendly thanks page."
- "Put a 1–10 NPS question before the contact info step."
- "Turn the email question into a required contact_info block with first name, last name, company."
- "Send finished responses to my webhook https://example.com/hook with secret s3cr3t."
- "Make this survey mobile-only, display once, and auto-close after 3 minutes."
- "Translate the welcome card and endings into French (fr)."
- "Pause the intake." / "Resume the intake." / "Close the intake."
- "Add a 5-star rating of their experience just before the ending."
- "Require email verification and limit to one response per email."

All edits route through the existing Seldon It action. No new commands, no new endpoints.
