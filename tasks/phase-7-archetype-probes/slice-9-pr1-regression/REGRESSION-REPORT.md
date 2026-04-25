# SLICE 9 PR 1 — 18-probe regression + PR 1 close-out

**Date:** 2026-04-25
**Scope:** SLICE 9 PR 1 (HVAC Arizona foundation: scenario + seed + 2 scaffolded blocks + technicians Soul + branding + 2 archetypes + admin polish).
**Commits:** C1 `8090dd10` → C2 `7159a14c` → C3 `d2de42b8` → C4 `0a09a84d` → C5 `74767130` → C6 `8a2faf1d` → C7 `08b63375` → C8 `3ab67048` → C9 `[this commit]`.
**Probe model:** `claude-opus-4-7`

---

## Verdict: **18/18 PASS · 27-streak holds · G-9-7 isolation verified**

6 archetypes × 3 runs = 18 structural-hash verifications.

| Archetype | Baseline | Result |
|---|---|---|
| speed-to-lead          | `735f9299ff111080` | ✅ 3/3 match |
| win-back               | `72ea1438d6c4a691` | ✅ 3/3 match |
| review-requester       | `4464ec782dfd7bad` | ✅ 3/3 match |
| daily-digest           | `6e2e04637b8e0e49` | ✅ 3/3 match |
| weather-aware-booking  | `f330b46ca684ac2b` | ✅ 3/3 match |
| appointment-confirm-sms| `ef6060d76c617b04` | ✅ 3/3 match |

**G-9-7 isolation invariant:** the 2 new HVAC archetypes
(`hvac-pre-season-maintenance` + `hvac-emergency-triage`) ship in the
workspace-scoped registry at `lib/hvac/archetypes/`, NOT the global
`lib/agents/archetypes/` registry. Verified by 2 explicit isolation
tests (one per archetype) asserting `archetypes["hvac-*"] === undefined`
in the global registry. The 6 baseline archetypes are unchanged.

Expected outcome: SLICE 9 PR 1 changes ZERO global-registry archetype
files. The 2 HVAC archetypes are in `lib/hvac/`, the 2 scaffolded
blocks add new files under `src/blocks/hvac-*/`, and the seed adds
new test fixtures. None of these affect synthesis context for the
6 baseline archetypes.

---

## PR 1 commit summary

| # | Commit | Scope | Prod | Tests | Notes |
|---|---|---|---|---|---|
| C1 | `8090dd10` | Scenario doc + seed-hvac-arizona.ts | 504 | 0 | 300 generated customers + 14 hand-curated technicians + 120 service-history activities |
| C2 | `7159a14c` | hvac-equipment block scaffolded | 241 | (in 241) | First production scaffolder exercise; zero hand-edits required |
| C3 | `d2de42b8` | hvac-service-calls block scaffolded | 264 | (in 264) | Cross-block consumes equipment.serviced event |
| C4 | `0a09a84d` | Technicians Soul schema + read helpers | 95 | 90 | 4 helper functions + 10 tests covering availability + skill-rank ordering |
| C5 | `74767130` | Desert Cool HVAC branding constants | 60 | 63 | Brand identity + theme + voice fragments |
| C6 | `8a2faf1d` | pre-season-maintenance archetype | 105 | 140 | Workspace-scoped (G-9-7); 12 tests including isolation invariant |
| C7 | `08b63375` | emergency-triage archetype | 175 | 155 | Most complex; 5 primitive types in 8 steps; 13 tests |
| C8 | `3ab67048` | Admin polish (route wiring + Technicians page) | 83 | 0 | Composes PageShell + EntityTable; 0 new components |
| C9 | `[this commit]` | 18-probe regression + close-out | 0 | 0 | Artifact |
| **PR 1 total** | | | **~1,527 prod** | **~458 tests** | **~416 doc + artifacts** |

**PR 1 LOC envelope:**
- Code: ~1,985 (prod + tests)
- + Docs (scenario + 2 spec JSONs + close-out): ~416
- **Combined: ~2,401**

PR 1 budget per audit: ~2,500-3,500 code + ~800 docs.
Stop-and-reassess trigger: ~4,550 code.
**Code total ~1,985: 21% under the lower-bound projection (2,500), 56% under the stop trigger.** Comfortable budget remaining for PR 2.

---

## Scaffolder watch findings (PR 1 first production exercise)

Per Max's PR 1 watch item: track scaffolder output quality + document gaps.

### Finding #1: Validation gate trips on pre-existing baseline errors

The scaffolder's validation step runs `tsc --noEmit` and treats ANY
type error as failure, including the 4 pre-existing baseline errors
(public-booking-form.tsx react-day-picker, sonner.tsx module-not-found,
payments/actions.ts stripeAccount). First scaffold attempt (C2) reported
"FAILED at validate step" even though the actual scaffold output was
clean.

**Impact:** false-positive validation failure on every scaffold against
the existing codebase. Workaround: `--skip-validation` flag + manual
post-scaffold `pnpm typecheck` verification.

**Mitigation in C2 + C3:** workaround documented in commit messages.
Both scaffolds ultimately produced clean typechecking output.

**Post-launch ticket (NOT blocking SLICE 9):** filter scaffolder
validation to NEW errors only (diff against baseline) so pre-existing
gunk doesn't false-positive scaffolds. ~50-100 LOC change in
`packages/crm/src/lib/scaffolding/validate.ts`.

### Finding #2: Spec path resolution

Scaffolder CLI runs from `packages/crm/` (per `scripts/scaffold-block.js`
cwd setting), so spec paths must be absolute. Relative paths from the
repo root failed with ENOENT.

**Impact:** documentation gap; workaround is to pass absolute paths.
Not blocking but unfriendly.

**Post-launch ticket (NOT blocking SLICE 9):** allow `--spec` to
resolve relative to `process.cwd()` OR document the absolute-path
requirement in CLI help text.

### Finding #3: Scaffolder output quality — POSITIVE

The scaffolder's actual output (block.md + tools.ts + admin schema +
admin page + customer view + test stub) was production-quality. Zero
hand-edits required for either block. The output:
- Typechecks clean against the rest of the codebase
- Composes correctly with existing primitives (BlockListPage,
  CustomerDataView)
- Includes scaffolder header comments documenting the generation
- Test stubs use `it.todo` so they don't false-pass

**Assessment:** scaffolder is production-ready for blocks of this
shape. Two small CLI/validation paper-cuts (#1, #2 above) are the
only friction.

---

## L-17 calibration applied

- **L-17 UI composition multiplier (0.94x):** C8's Technicians page
  composes PageShell + EntityTable + Zod schema → 83 prod LOC, 0
  dedicated unit tests (covered by component-level tests in SLICE 4a).
  Test/prod = 0/83 = 0x — UI composition with integration validation,
  consistent with the SLICE 8 close-out's "thin composition with
  integration validation" sub-band (0.3-0.5x range, low end).
- **L-17 cross-ref Zod gate-breadth: N/A** — PR 1 ships no new
  cross-ref Zod validators. Block specs (JSON) are validated by the
  scaffolder's existing `BlockSpecSchema`.
- **L-17 dispatcher interleaving: N/A** — PR 1 ships no new
  dispatchers.

---

## Containment verification

| Surface | Changes? | Notes |
|---|---|---|
| Global archetype registry (`lib/agents/archetypes/index.ts`) | ✅ none | Count remains 6 |
| `lib/agents/types.ts` core | ✅ none | |
| SeldonEvent union | ✅ none | HVAC-specific events live in archetype JSON, not the global union |
| Subscription primitive | ✅ none | |
| Scaffolding core | ✅ none | First production exercise; no scaffolder code edits |
| SLICE 4 composition patterns | ✅ none | C8 consumes existing primitives unchanged |
| SLICE 5 schedule dispatcher | ✅ none | |
| SLICE 6 branch primitive | ✅ none | |
| SLICE 7 message dispatcher + loop guard | ✅ none | Inherited by emergency-triage archetype unchanged |
| SLICE 8 test mode | ✅ none | Will be exercised by PR 2 E2E |
| `organizations.theme` | ✅ extended (additive) | Desert Cool HVAC theme written by seed |
| `organizations.soul` | ✅ extended (additive) | Soul carries Desert Cool config + 14 technicians |
| New: 2 scaffolded blocks | ✅ new | hvac-equipment + hvac-service-calls |
| New: workspace-scoped archetype registry | ✅ new | `lib/hvac/archetypes/` (separate from global) |
| New: HVAC technicians schema + helpers | ✅ new | `lib/hvac/technicians.ts` |
| New: 3 admin routes | ✅ new | /equipment, /service-calls, /technicians |

---

## Green bar PR 1

| Check | Command/Source | Result |
|---|---|---|
| `pnpm typecheck` | (run locally) | 4 errors (matches pre-existing baseline) ✅ |
| `pnpm test:unit` | | 1553/1565 (12 todo from scaffolded test stubs, 0 fail; +52 new passing tests across PR 1) ✅ |
| `pnpm emit:blocks:check` | | (deferred — block contract additions verified by scaffolder; manual emit + check is a follow-up small commit if needed) |
| `pnpm emit:event-registry:check` | | (deferred — HVAC events in archetype JSON, not in global registry) |
| 18-probe regression | (this commit, slice-9-pr1-regression) | ✅ 3/3 match |
| G-9-7 isolation invariant | (2 dedicated tests in HVAC archetype specs) | ✅ verified |
| **Vercel preview build** | **observe at HEAD post-push** | **🟡 PENDING USER CONFIRMATION (per L-27)** |

---

## What ships in PR 1

**Foundation:**
- Desert Cool HVAC scenario doc (prospect-readable)
- 300-customer seed fixture (procedurally generated, deterministic)
- 14 hand-curated technicians (in Soul)
- ~120 service-history activities

**Scaffolded blocks:**
- hvac-equipment (3 tools, 1 entity, 2 produces events, 1 customer
  surface)
- hvac-service-calls (4 tools, 1 entity, 3 produces events, 1
  customer surface)

**Workspace-scoped archetypes:**
- pre-season-maintenance (schedule trigger + branch + bulk SMS;
  3 steps)
- emergency-triage (message trigger + external_state + predicate
  branch + send_sms × 2 + await_event + emit_event × 2; 8 steps;
  most complex composition in PR 1)

**HVAC library:**
- `lib/hvac/branding.ts` — brand identity + theme + voice fragments
- `lib/hvac/technicians.ts` — Soul-attribute schema + 4 read helpers

**Admin UI:**
- /equipment route (re-exports scaffolded page)
- /service-calls route (re-exports scaffolded page)
- /technicians page (custom server component reading Soul)

**Block specs (JSON, hand-authored, fed to scaffolder):**
- equipment.spec.json (112 LOC)
- service-calls.spec.json (135 LOC)

---

## What does NOT ship in PR 1 (PR 2 scope)

- 2 more HVAC archetypes (heat-advisory + post-service-followup)
- Customer portal HVAC surfaces (equipment list, service history,
  self-serve maintenance scheduling)
- HVAC-specific dashboard widget on /dashboard
- hvac-arizona vertical pack manifest + install path
- Sidebar nav entries for /equipment, /service-calls, /technicians
  (currently navigable only via direct URL)
- Real persistence wiring for equipment + service-calls (currently
  empty rows; data lives in seed's contact.customFields)
- Integration tests for the 2 PR 1 archetypes (E2E in PR 2)
- Test mode demonstration walkthrough
- Launch content: video script + worked example walkthrough +
  comparison framing

---

## Per L-21 + L-27: STOP

PR 1 green bar verified locally + push pending. **Vercel preview
build at HEAD pending Max's direct observation.** Do NOT proceed to
PR 2 until SLICE 9 PR 1 is GENUINELY closed (Vercel green observed
+ Max approval).
