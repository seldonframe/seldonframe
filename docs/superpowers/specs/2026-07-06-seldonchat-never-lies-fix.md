# 2026-07-06 — SeldonChat never-lies fix (copilot edits hit the live r1 model + vision gates the reply)

## Objective
SeldonChat edits actually change the live site, and it never says "Done ✅" when
they didn't. Two layers:
- **L1 (correctness):** the 3 copilot tools that write the dead `slug='home'`
  model are migrated to the live `slug='r1'` payload seam; success means a real
  field changed, not "a row was written."
- **L2 (never-lies):** a genuine `vision_check pass:false` rewrites the assistant
  reply to the truth (and self-corrects once), instead of trailing a contradictory
  "Heads up" note under a false "Done ✅."

## Root cause (from the 2026-07-07 trace)
`update_section_field(section=hero, field=headline)` mutated the legacy
`general-service-v1` blueprint at `slug='home'` (`tools.ts:79 LANDING_SLUG="home"`)
and returned `ok:true`; the live SRP site renders `slug='r1'`
(`blueprint_json.payload`, R1 React renderer). Change went to a void → model
truthfully said "Done ✅" → `vision_check` (reads the real r1 page) returned
`pass:false`. Third instance of this class (see tasks/lessons.md L-XX,
[[seldonchat-media-editing]]).

## Recon facts (grounded)
- **Live r1 seam** (media tools already use it): `defaultLoad(orgId)` /
  `loadLandingPayload` (`lib/landing/set-r1-media.ts:60`, `lib/landing/r1-save.ts:164`)
  returns `{payload: R1LandingPayload, archetype}` for `slug='r1', status='published'`;
  `saveLandingPayload(orgId, payload, archetype)` (`lib/landing/r1-save.ts:45`)
  upserts the row + revalidates. DB shape: `blueprint_json = {_r1:true, payload, archetype}`.
- **r1 payload = fixed named sections** (NO `sections[]` array): `hero, services,
  testimonials, faq, footer, emergency?, sticky?, leadForm?, servicePages?, nav?, theme?`
  (`lib/landing/r1-payload-prompt.ts:195`). Hero fields: `businessName, tagline,
  subhead, primaryCTA{label,href}, secondaryCTA?, trustBadges[], reviewRating?,
  reviewCount?, emergencyService?, heroImage?, heroOverlay?, leadFormInHero?,
  backgroundImage?, backgroundVideo?`. **The headline is `hero.tagline`.**
- **`edit_site` is already r1-native** → `customizeLandingR1` (`lib/landing/r1-customize.ts:178`):
  loads r1 row, calls Anthropic, validates `isR1LandingPayload`, snapshots OLD
  payload into `landing_payload_versions`, updates `slug='r1'`. Reused by the
  in-app route + MCP. **Reuse for structural edits — do not rebuild.**
- **Reusable primitive:** `setByPath(obj, dotPath, value)` (`lib/blueprint/mutate.ts:158`)
  — numeric segments = array indices, else object keys. The *section-by-type* entry
  point (`mutateSectionField`) does NOT port (r1 has no typed `sections[]`), but
  `setByPath` does.
- **Vision gate** (`app/api/copilot/turn/route.ts`): non-streaming; `text =
  result.assistantMessage` finalized at L100-104; vision runs L157-242; response
  assembled L244-251 with `visionCheck` as a **sibling key, never merged into
  `text`.** Doubly flag-gated: route 404s unless `SF_WIN_LADDER=1` (L59), vision
  fires only if `SF_VISION_VERIFY=1` (L172,186). **Fail-soft is absolute:** skips
  (`skipped:"timeout"|"render_failed"`) and all errors default to `{pass:true}`.
  `shouldVisionVerify` fires on tool-name prefix `/^(edit_|update_|move_|delete_|add_|undo_)/`.
- UI note assembled at `seldon-chat.tsx:462-471` from `message.visionCheck`, under
  the bubble; `message.content` (the "Done ✅") is never touched.

---

## L1 — migrate the 3 lying tools to the live r1 model

### New file `packages/crm/src/lib/landing/set-r1-field.ts` (DI, pure-core testable)
- `R1_SECTION` = union of top-level payload keys (`hero|services|testimonials|faq|footer|emergency|sticky|leadForm`).
- **Field-alias map** (`resolveR1FieldPath(section, field): string | null`) — maps
  common LLM guesses to the real r1 path so a reasonable instruction still lands:
  - `hero`: `headline|title|heading` → `tagline`; `subheadline|subtitle` → `subhead`;
    `cta|button` → `primaryCTA.label`; passthrough for real fields.
  - other sections: `title|headline` → `heading`; passthrough. Unknown → return the
    field as-is (let validation below catch a truly bad path).
- `setR1Field(orgId, section, field, value, deps=DEFAULT): Promise<Result>`:
  1. `deps.load(orgId)` → if null → `{ok:false, error:"no_r1_page"}` (caller may
     legacy-fallback).
  2. resolve alias → `path`. Deep-clone `payload`. `setByPath(payload[section], path, value)`.
  3. **Validate the write took:** re-read the value at that path; if the path did
     not exist before OR the value is unchanged/undefined → `{ok:false,
     error:"field_not_found", section, field}`. (This is the tool-level never-lies:
     `ok` ⇒ a real field changed.)
  4. `deps.save(orgId, payload, archetype)`, `deps.revalidate(orgId)`.
  5. `{ok:true, applied:{section, path, value}}`.
- Reuse `setByPath` from `lib/blueprint/mutate.ts` (import the primitive).

### `tools.ts` edits
- `update_section_field.execute` → `setR1Field(ctx.orgId, section, field, value)`;
  on `error:"no_r1_page"` ONLY, fall back to the existing legacy home path
  (`updateSectionFieldForWorkspace`) so non-r1 orgs still work. On `field_not_found`,
  return the error to the model (so it can retry with a correct field) — do NOT
  report success.
- **Tool description + jsonSchema (context-layer fix):** enumerate the real r1
  sections; state the real field names ("hero headline is `tagline`; `subhead`;
  `primaryCTA.label`…"). This stops the model guessing `headline`.
- `get_site_structure` → new `getR1Structure(orgId)` reading `loadR1Payload` →
  return the live sections + their current field values (so the model edits against
  reality). Legacy home read only if no r1 page.
- `move_section` / `delete_section` → on an r1 org, delegate to `customizeLandingR1`
  with a synthesized NL instruction ("Remove the {section} section." / "Move the
  {section} section above {target}.") — one working pipeline for structural edits.
  Legacy path only if no r1 page. (r1 has no arbitrary section array to index, so a
  deterministic reorder is not meaningful; NL handles it against the real payload.)

### L1 tests (`tests/unit/landing/set-r1-field.spec.ts`)
- alias: `hero/headline` writes `payload.hero.tagline`; value round-trips.
- deterministic nested: `hero/primaryCTA.label`, `services/services.0.name`,
  `faq/items.1.answer` all setByPath correctly.
- `field_not_found`: a bogus field (`hero/nonsense`) → `{ok:false}`, payload NOT saved.
- `no_r1_page`: `load` returns null → `{ok:false, error:"no_r1_page"}` (caller falls back).
- save/revalidate called exactly once on success, never on failure (spies).

---

## L2 — vision gates the reply (never-lies)

### New file `packages/crm/src/lib/vision/reconcile-reply.ts` (pure, unit-tested)
`reconcileReplyWithVision(replyText, visionCheck): { text, corrected }`:
- If `!visionCheck` OR `visionCheck.skipped` OR `visionCheck.pass === true` OR
  `gaps.length === 0` → `{text: replyText, corrected:false}` (**fail-soft: skips and
  passes never alter text**).
- Else (genuine `pass:false` with gaps) → replace the reply with an honest message:
  `"That didn't fully land yet — the visual check shows: {gaps.join('; ')}. I'll
  need to try that differently."` → `{text, corrected:true}`. (Never emit a "Done ✅"
  alongside a failed check.)

### `route.ts` wiring
- After `visionCheck` is computed, before the `return`:
  `const reconciled = reconcileReplyWithVision(result.assistantMessage, visionCheck);`
  return `text: reconciled.text` (keep `visionCheck` sibling for the UI ✓/note).
- **L2b single self-correction retry** (the "as good as talking to you" part; same
  flag gate; bounded to exactly ONE): if an edit-type tool fired AND
  `visionCheck.pass===false` AND not skipped → re-invoke `executeTurn` once with an
  appended instruction carrying the gaps + the real r1 field names
  ("Your last edit didn't appear on the live page: {gaps}. On this site the hero
  headline is the `tagline` field… Use update_section_field with the correct field.")
  → re-run vision on the retry. Use the retry's result. If it STILL fails, emit the
  honest message via reconcile. Guardrails: max 1 retry; only when the first turn's
  tool calls were edit-type; fully inside the existing `try/catch` fail-soft; if the
  retry or its vision errors/times out, fall back to the first result's reconciled
  text. **If the retry proves too entangled to do safely, ship L2a alone and file
  L2b as a follow-up — never weaken fail-soft to force it.**

### L2 tests (`tests/unit/vision/reconcile-reply.spec.ts`)
- pass:true → text unchanged, corrected:false.
- skipped:"timeout"/"render_failed" (even with pass:false-shaped) → unchanged (fail-soft).
- genuine pass:false + gaps → text replaced, corrected:true, gaps included.
- no visionCheck → unchanged.

---

## Constraints / invariants
- Org-scope every query (orgId). No new deps. No migration (reuses existing tables).
- **Never weaken fail-soft:** only a completed, non-skipped `pass:false` may alter a
  reply or trigger a retry. A flaky screenshot must never turn a real "Done" into a
  false "that didn't work."
- Forbidden set (regression grep must be empty): `bookings/`, `messaging/`,
  `set-r1-media.ts` (media path unchanged), `r1-customize.ts` core (reuse, don't edit
  its write logic), `resolve-url.ts`.
- Flags unchanged (SF_WIN_LADDER / SF_VISION_VERIFY already ON in the target env).

## Validation (stop condition)
`/verify-build` (unit + tsc + use-server + no-migration + regression grep + live
smoke) PASS, `vision-verify` on a real edit (set a headline via the copilot path →
render → grade `pass:true`), independent **opus** review APPROVE (hot path: the
copilot write surface + the reply-truth contract). Then merge gate (Max).
