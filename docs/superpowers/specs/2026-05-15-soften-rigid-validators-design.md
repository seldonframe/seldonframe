# Soften rigid validators in the workspace-creation pipeline

**Date**: 2026-05-15
**Status**: Approved design; ready for implementation plan
**Brainstorm source**: live session with maximehoule100@gmail.com
**Predecessor spec**: [2026-05-14-pull-firecrawl-out-of-backend-design.md](2026-05-14-pull-firecrawl-out-of-backend-design.md) — this spec addresses items §"Out of scope" #1 + #2.

## Motivation

Every v2 workspace creation on 2026-05-15 produced `workspace_output_contract status: "degraded"` with `blocking_failures: 2`, despite the workspaces themselves being functionally correct. The validator was reporting false alarms caused by checks that haven't kept up with the v2 render path. Separately, the services-block icon validator triggered LLM retries on every test workspace because Claude picked valid lucide icons (`shield_check`, `wind`, `building_2`) that weren't in our hand-maintained 60-icon allowlist.

Three failure surfaces, three different root causes:

1. **`icon_in_allowlist` (real rigid-validation problem).** [`packages/crm/src/lib/page-blocks/registry.ts:213-225`](packages/crm/src/lib/page-blocks/registry.ts) rejects icon names not in `ICON_NAMES`, a derived array from a 60-entry hand-copied `ICON_PATHS` map at [`packages/crm/src/lib/blueprint/renderers/lucide-icons.ts`](packages/crm/src/lib/blueprint/renderers/lucide-icons.ts). Lucide ships ~1500 icons. When Claude picks one outside our 60, the validator rejects → LLM retry → substitutes are sometimes semantically worse (e.g., `wind` → `layers` for an air-duct service).

2. **`landing_page_exists` (validator stale on v2 schema).** [`packages/crm/src/lib/workspace/output-contract-validator.ts:253-260`](packages/crm/src/lib/workspace/output-contract-validator.ts) checks `landingPages.contentHtml.length > 100`. But [`packages/crm/src/lib/workspace/enhance-blocks.ts:1472`](packages/crm/src/lib/workspace/enhance-blocks.ts) **deliberately nulls `contentHtml`** for v2 workspaces — `<PageRenderer>` now renders from the `sections` JSON column at request time.

3. **`cta_primary_href` (same root cause as #2).** [output-contract-validator.ts:288-313](packages/crm/src/lib/workspace/output-contract-validator.ts) regexes `contentHtml` for `<a class="sf-btn sf-btn--primary" href="/book">`. With `contentHtml: null`, the regex finds nothing. The actual v2 CTAs come from `PageSchema.actions`, rendered at request time.

## Goals

- Eliminate the `workspace_output_contract degraded` false alarms on every v2 workspace creation.
- Eliminate the LLM retry loop on icon allowlist failures (saves tokens + latency + occasional wrong substitutes).
- Replace the hand-maintained 60-entry icon map with the real lucide library (~1500 icons), so the system gets better automatically as lucide ships icons and Claude picks more accurate names.

## Non-goals

- Comprehensive audit of all 16 validator checks — only the 2 that fail on v2.
- Removing the v1 render path (`general-service-v1.ts` + `contentHtml` column).
- Other rigid validators in the codebase (`enhance-blocks.ts`, personality cache, weekly-hours regex).
- Operator-facing icon picker UX overhaul.
- Vertical-aware fallback maps (rejected during brainstorm — itself a rigid map that doesn't improve with better LLMs).

## Architecture

### Before (today)

```
Claude generates services block: icons=[shield_check, wind, building_2]
   ↓
registry.ts validator: ICON_NAMES allowlist (60 entries) → reject
   ↓
LLM retry: "pick from this list of 60..." → substitutes
   ↓
Workspace created.

create-full pipeline finishes
   ↓
output-contract-validator runs 16 checks against
  landingPages.contentHtml + sections + bookings + intake
   ↓
landing_page_exists: contentHtml.length > 100 → FAIL (v2 nulls contentHtml)
cta_primary_href: regex contentHtml for "/book" → FAIL (no contentHtml)
   ↓
status: degraded, blocking_failures: 2
v2_workspace_create_succeeded (workspace IS created; validator never blocks)
```

### After

```
Claude generates services block: icons=[shield_check, wind, building_2]
   ↓
registry.ts validator: only enforce non-empty + distinct → accept
   ↓
(no retry, no token cost, no log noise)
   ↓
<PageRenderer> (React, runtime) renders sections:
   resolveIconComponent("shield_check") →
     toPascalCase → "ShieldCheck" →
     lucideIcons["ShieldCheck"] → real lucide-react icon ✓
   (unknown names → <Sparkles /> universal fallback)
   ↓
Workspace created.

output-contract-validator:
   isV2 = sections.length > 0 && contentHtml is null/empty
   - landing_page_exists:
       isV2 → pass if ≥1 section has content.headline / .body / .items.length
       else → existing contentHtml > 100 check
   - cta_primary_href / cta_secondary_href:
       isV2 → skip (CTAs are renderer-controlled; the v1 contract doesn't translate)
       else → existing regex
   ↓
status: pass, blocking_failures: 0
```

### Antifragility properties (Karpathy lens)

| Property | Before | After |
|---|---|---|
| Hardcoded icon map maintained by humans | 60 entries (`ICON_PATHS`) | Zero (lucide ships its own) |
| Vertical→default-icon map | None (would have been added in early draft; correctly rejected) | None |
| Adding a new lucide icon to the system | PR to copy SVG path | Automatic (lucide ships it; we get it on `npm update`) |
| Better Claude picks more obscure but valid icons | Still rejected by allowlist | All work automatically |
| Claude hallucinates a non-existent icon name | Rejected → LLM retry | Renders Sparkles fallback (one-time cost; no retry) |
| v1/v2 render-path drift | Validator silently falsely-degrades v2 workspaces | Mode-aware; structural check looks at the actual data source |

## Components

### New file: `packages/crm/src/lib/blueprint/renderers/icon-resolver.ts`

~30 lines. Replaces the 200-line `lucide-icons.ts`.

```typescript
// 2026-05-15 — Resolve a lucide icon name to its lucide-react component,
// with a universal fallback for unknown/invalid names. Replaces the
// hand-maintained ICON_PATHS map.

import { icons as lucideIcons, Sparkles } from "lucide-react";

const FALLBACK_ICON = Sparkles;

/** Normalize snake_case / kebab-case → PascalCase for lucide-react export keys.
 *  E.g. "shield_check" → "ShieldCheck", "shield-check" → "ShieldCheck". */
function toPascalCase(name: string): string {
  return name
    .split(/[_-]/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join("");
}

/** Look up a lucide-react icon component by name. Falls back to Sparkles
 *  for any name not in the lucide library. */
export function resolveIconComponent(name: string | null | undefined) {
  if (!name || !name.trim()) return FALLBACK_ICON;
  const pascal = toPascalCase(name.trim());
  return (lucideIcons as Record<string, typeof FALLBACK_ICON>)[pascal] ?? FALLBACK_ICON;
}
```

### Modified: `packages/crm/src/lib/page-blocks/registry.ts`

Services-block validator (lines ~213-225):

```typescript
// 2026-05-15 — soft validation. Accept any non-empty icon name. The
// renderer (lucide-react in <PageRenderer>) maps the name to a real
// lucide icon, falling back to <Sparkles /> for unknown names.
const blanks = items
  .filter((item) => !item.icon || item.icon.trim().length === 0)
  .map((item) => item.title);
if (blanks.length > 0) {
  return `icon_required: services missing icons (${blanks.join("; ")})`;
}
```

The `distinct_icons` check (each card must pick a different name) stays — string-distinctness, no allowlist needed.

The `ICON_NAMES` import and the offender-filtering logic are removed.

### Modified: `packages/crm/src/lib/workspace/output-contract-validator.ts`

**5a. Refactor scaffolding** (zero behavior change): split `validateWorkspaceOutputContract` into:

```typescript
// Pure DB-read layer
async function loadValidatorInputs(workspaceId, ...): Promise<ValidatorInputs> { ... }

// Pure logic layer (testable without DB)
function runChecks(inputs: ValidatorInputs): OutputContractResult { ... }

// Existing public function becomes the composition
export async function validateWorkspaceOutputContract(...) {
  const inputs = await loadValidatorInputs(...);
  return runChecks(inputs);
}
```

**5b. v2-mode detection** in `runChecks`:

```typescript
const sections = (inputs.landing?.sections ?? []) as Array<{ content?: ... }>;
const html = inputs.landing?.contentHtml ?? "";
const isV2 = sections.length > 0 && (html === null || html.length === 0);
```

**5c. `landing_page_exists`** (lines ~253-260):

```typescript
const hasV2Content = sections.some((s) => {
  const c = s.content ?? {};
  return Boolean(c.headline || c.body || (c.items?.length ?? 0) > 0);
});

checks.push({
  surface: "landing_page_exists",
  status: isV2 ? (hasV2Content ? "pass" : "fail") : (html.length > 100 ? "pass" : "fail"),
  expected: isV2 ? "≥1 section with meaningful content" : "rendered HTML > 100 chars",
  actual: isV2
    ? `${sections.length} sections, content ${hasV2Content ? "present" : "all empty"}`
    : `${html.length} chars`,
  severity: "blocking",
});
```

**5d. `cta_primary_href` + `cta_secondary_href`** (lines ~288-313): wrap the whole block in `if (!isV2)`. v2 skips entirely. v1 keeps existing behavior.

### Modified: `packages/crm/src/lib/blueprint/renderers/general-service-v1.ts`

The one server-side caller of `renderIcon`. Replace with a server-rendered approach — either `renderToString(<IconComponent />)` from `react-dom/server`, or use the `lucide` (non-React) package's icon-data export. Implementation detail at task time. The v1 SSR path is being deprecated; keeping it functional is the goal.

### Modified: `packages/crm/src/lib/puck/config-fields.ts`

Currently imports `ICON_NAMES` to populate a dropdown of operator-selectable icons. Change:

- Picker UI keeps a small curated default list (~30-40 commonly-used icons) for browsing UX. Showing all 1500 lucide icons in a dropdown is operator-hostile.
- Operator can type-in any name (not constrained to the dropdown). Unknown names fall back at render time.
- The curated list is operator-facing only; doesn't constrain Claude or the validator.

### Modified: `packages/crm/src/blocks/services/SKILL.md`

The current prompt tells Claude to pick "from the lucide allowlist (see body)" and lists the 60 names. Rewrite to:

> Lucide icon name (snake_case, kebab-case, or PascalCase). Any valid lucide icon name; see https://lucide.dev/icons for the full library of ~1500 icons. Unknown names render a Sparkles fallback, so prefer names you're confident exist. Each card must pick a different icon.

### Deleted: `packages/crm/src/lib/blueprint/renderers/lucide-icons.ts`

~205 lines of hand-copied SVG path data + the `ICON_NAMES` array. Replaced by `icon-resolver.ts`.

## Data flow

### Icon path (after change)

```
Claude (page-blocks orchestrator) → services block skill
  ↓ JSON: { items: [{ title, icon: "shield_check", description }, ...] }
  ↓
registry.ts validateServicesProps:
  - non-empty icon strings  → pass
  - distinct icons          → pass
  - (no allowlist check)    → pass
  ↓
persist_block → landingPages.sections
  ↓
[operator visits public URL]
  ↓
<PageRenderer> renders sections at request time
  ↓ for each services-section item:
  resolveIconComponent("shield_check")
    → toPascalCase = "ShieldCheck"
    → lucideIcons["ShieldCheck"] → real lucide-react component
  ↓
  <ShieldCheck className="size-6 text-primary" />
```

### Validator path (after change)

```
output-contract-validator.validateWorkspaceOutputContract(workspaceId, ...)
  ↓
loadValidatorInputs(...) → ValidatorInputs (DB reads, unchanged)
  ↓
runChecks(inputs):
  isV2 = sections.length > 0 && contentHtml is null/empty
  run 14-16 checks (count varies by branch):
    - landing_page_exists: v2 uses sections check, v1 uses contentHtml check
    - cta_primary_href, cta_secondary_href: v2 skips, v1 runs existing regex
    - 13 other checks: unchanged
  ↓
status: pass | degraded (degraded only when REAL blocking failures exist)
```

## Failure modes

| Scenario | Old | After |
|---|---|---|
| Claude picks lucide icon in our 60-list (e.g., `shield`) | ✓ renders | ✓ renders |
| Claude picks valid lucide icon NOT in our 60-list (e.g., `shield_check`) | ✗ rejected → retry → substitute | ✓ renders the real lucide icon |
| Claude hallucinates a non-lucide name (e.g., `wood_oven`) | ✗ rejected → retry | ✓ renders Sparkles fallback |
| Claude omits the icon field | ✗ rejected | ✗ rejected (icon_required check) |
| Claude picks same icon twice across cards | ✗ distinct_icons fail | ✗ distinct_icons fail |
| Operator types a fictional icon in puck UI | Picker constrained to 60 | Picker shows curated list; typed-in names accepted; bad names fall back at render |
| lucide ships a new icon | PR required | Auto-available on `npm update` |
| v2 workspace created (sections populated, contentHtml null) | `landing_page_exists` + `cta_primary_href` falsely fail | Both pass (mode-aware) |
| v1 workspace created (legacy contentHtml) | Existing checks run | Existing checks run unchanged |

## Testing

Codebase convention: `node:test` + `tsx`, tests at `packages/crm/tests/unit/*.spec.ts`, run via `pnpm test:unit`.

### Unit: `icon-resolver`

`packages/crm/tests/unit/icon-resolver.spec.ts`:
- snake_case → lucide component (`shield_check` → ShieldCheck)
- kebab-case → lucide component (`shield-check` → ShieldCheck)
- PascalCase → lucide component (`ShieldCheck` → ShieldCheck)
- unknown name → Sparkles fallback
- null/undefined/empty/whitespace → Sparkles fallback
- whitespace-padded names get trimmed

### Unit: services block validator

`packages/crm/tests/unit/services-block-validator.spec.ts`:
- accepts any non-empty distinct icon names (no allowlist)
- rejects empty icon strings (`icon_required`)
- rejects duplicate icons (`distinct_icons`)
- accepts icons previously rejected by the allowlist: `shield_check`, `wind`, `building_2`, `umbrella`, `tornado`, `building`

### Unit: output contract validator (v2 mode)

Requires the §"Components" 5a refactor (split `loadValidatorInputs` from `runChecks`) so tests can inject synthetic inputs without a real DB.

`packages/crm/tests/unit/output-contract-validator-v2.spec.ts`:
- v2 mode + content present → `landing_page_exists` passes
- v2 mode + sections populated but all content empty → `landing_page_exists` fails
- v2 mode + empty sections array → `landing_page_exists` fails
- v2 mode → `cta_primary_href` check is NOT in the result `checks` array
- v2 mode → `cta_secondary_href` check is NOT in the result
- v1 mode (contentHtml populated, sections empty) → `landing_page_exists` uses contentHtml check
- v1 mode → `cta_primary_href` still runs

### Manual smoke (post-deploy)

Fresh Claude Code session, run:

```
create workspace for https://quigleyac.com
```

| Log line | Today (2026-05-15 baseline) | After |
|---|---|---|
| `icon_in_allowlist` retry event | Fires | Does not fire |
| `workspace_output_contract status` | `degraded`, `blocking_failures: 2` | `pass`, `blocking_failures: 0` |
| `workspace_output_contract_failure surface: landing_page_exists` | Logged | Not logged |
| `workspace_output_contract_failure surface: cta_primary_href` | Logged | Not logged |
| `v2_workspace_create_succeeded` | Logged | Logged (unchanged) |

Then visit the rendered landing page in a browser:
- HVAC site shows shield-check, wind, etc. as real lucide icons (not all-the-same default).
- No visible regression vs the 2026-05-15 baseline workspace.

## Migration / rollout

### Order of changes

1. Add `icon-resolver.ts` + unit tests *(zero-risk, isolated new file)*
2. Split `validateWorkspaceOutputContract` → `loadValidatorInputs` + `runChecks` *(zero behavior change)*
3. Add `isV2` detection + v2 branch for `landing_page_exists`
4. Add v2 skip for `cta_primary_href` + `cta_secondary_href`
5. Update services block validator (drop allowlist; keep required + distinct)
6. Update `services/SKILL.md` (drop allowlist instruction; mention universal fallback)
7. Update `general-service-v1.ts` SSR renderer (v1 path)
8. Update `<PageRenderer>` services-block JSX (v2 path) to use `resolveIconComponent`
9. Update `puck/config-fields.ts` icon picker
10. Delete `lucide-icons.ts`
11. Merge to main, 24-hour soak watching logs for unexpected validator failures

Steps 1-2 are scaffolding. Steps 3-4 fix the validator false-degrades. Step 5 fixes the icon retry loop. Steps 6-10 are renderer + cleanup. Step 11 is the safety window.

### Backward compatibility

- **v1 workspaces** (legacy contentHtml-rendered, if any in production): keep existing checks.
- **In-flight workspace creations during deploy**: changes are independent at the file level; worst case is a logged-as-degraded creation that should have logged-as-pass (or vice versa) at the deploy boundary. No data corruption.
- **Operator-edited workspaces**: prior icon picks continue to work.

### Bundle size

`lucide-react ^1.7.0` is already a direct dependency (used by 5+ dashboard pages). The `import { icons }` index pulls in the full 1500-icon map (~50-100 KB minified). Accepted trade-off — antifragility over bundle size for the landing-page route. If this becomes a measurable problem (Core Web Vitals regression), revisit with code-splitting.

### Rollback

All changes are code-only. Rollback = revert the merge commit + redeploy. No DB state to undo.

| Failure mode | Detection | Action |
|---|---|---|
| CI fails | `pnpm test:unit` red | Revert pre-merge |
| Post-merge: icons missing on landing pages | Manual smoke + Vercel logs | Revert merge, redeploy |
| Post-merge: unexpected new validator failures | Vercel logs for surfaces we didn't touch | Investigate; likely unrelated. Validator changes themselves are isolated, easy to revert. |
| Bundle-size build failure | Vercel build fails | Build-time signal; revert immediately |

## Definition of done

- [ ] All unit tests pass (icon-resolver, services-block-validator, output-contract-validator-v2)
- [ ] Manual smoke against quigleyac.com produces `workspace_output_contract status: pass`
- [ ] No `icon_in_allowlist` retry events in logs for 24h post-merge
- [ ] No `workspace_output_contract_failure surface:(landing_page_exists|cta_primary_href)` events in logs for 24h
- [ ] Rendered v2 landing pages show varied real lucide icons (not all Sparkles, not all-same-default)
- [ ] `lucide-icons.ts` deleted
- [ ] No remaining references to `ICON_PATHS`, `ICON_NAMES`, `renderIcon` outside `icon-resolver.ts`

## Out of scope (deferred)

1. **Comprehensive validator audit.** The other 13 numbered checks don't currently fail on v2 workspaces — when a future change breaks one, it's a separate fix.
2. **Removing the v1 render path entirely.** `general-service-v1.ts` + `landingPages.contentHtml` column + v1-mode branches stay. Deleting them requires confirming no production workspaces still depend on contentHtml.
3. **Other rigid validators in the codebase.** Personality cache resolution, weekly-hours regex shape-check, blocking-validator patterns in `enhance-blocks.ts`. Already deferred from the Firecrawl spec; same architectural lens, separate code paths.
4. **Operator icon picker UX overhaul.** Search-all-1500, recently-used, favorites — separate UX spec.
5. **Vertical-aware fallback maps.** Rejected during brainstorm — would re-introduce a rigid map. Single universal Sparkles fallback is the antifragile answer.
6. **Bundle-size optimization for lucide.** Revisit only with empirical Core Web Vitals evidence.
7. **Migration of existing operator-edited workspaces.** They keep working unchanged.

## Successor specs (likely worth doing eventually)

- **Drop v1 render path entirely.** Audit production for any workspaces still depending on `contentHtml`. Once safe, delete the SSR renderer + v1-mode validator branches + `contentHtml`/`contentCss` columns.
- **Soft-validation pass over `enhance-blocks.ts` and `personality-generator.ts`.** Same architectural lens applied to the next layer of rigid validators.
