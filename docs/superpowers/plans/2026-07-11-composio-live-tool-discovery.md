# Plan — Composio live tool discovery (any toolkit bindable with real tools)

Spec: `docs/superpowers/specs/2026-07-11-composio-live-tool-discovery-design.md`.
Branch `feature/composio-live-discovery` (off `feature/record-to-agent` @ `d6d1ffe07`).
All paths under `packages/crm/src`. TDD every task (write the failing spec first, watch it
fail, then implement). Commit per task. Unit tests run offline via injected deps — never the
live Composio API. Org-scope every query. Never touch `resolveComposioBinding`.

Run tests with the repo's existing unit harness (`node scripts/run-unit-tests.js` from
`packages/crm`, or the targeted `node --test` invocation the neighboring specs use — check
`package.json` / sibling spec headers first; judge failures by delta vs baseline).

## T1 — discovery module (the core)

New `lib/integrations/composio/discover-tools.ts` + `discover-tools.spec.ts`.

1. `export const TOOLKIT_DISCOVERY_TOOL_CAP = 20;`
2. `export type ToolkitToolLister = (orgId: string, toolkitSlug: string) => Promise<McpToolSchema[]>;`
3. `pickDiscoverySubset(importantTools, allTools)` — small PURE helper: prefer the
   important-filtered list when non-empty, else the full list; cap at
   `TOOLKIT_DISCOVERY_TOOL_CAP`. Unit-test directly.
4. `export async function discoverToolkitToolsLive(orgId, toolkitSlug): Promise<McpToolSchema[]>`
   — `composioForOrg(orgId)`; null → `[]`. Two `getRawComposioTools` calls per the subset
   strategy (`{toolkits:[slug], important:true, limit:CAP}` then fallback `{toolkits:[slug],
   limit:CAP}`); map `Tool → McpToolSchema` (`name = tool.slug`, description fallback
   `"Composio tool <slug>."`, `inputSchema = inputParameters ?? {type:"object",
   additionalProperties:true}`); drop items without a usable slug; ANY error → `[]`; never
   throws; never logs the key. Structure it so the SDK-shape mapping is a pure exported
   helper (`normalizeDiscoveredTools`) that the spec drives with fixture items.
5. `export async function fillComposioBindingTools(orgId, connectors, deps?: {listToolkitTools?: ToolkitToolLister}): Promise<{connectors: ConnectorBinding[]; changed: boolean}>`
   — per spec §2.1: only `kind:"composio"` bindings with `enabledTools.length === 0 &&
   !discoveredAt`; catalog defaults first (`defaultToolsForToolkits`), live discovery only for
   toolkits with no catalog defaults; union/dedupe; caps `MAX_ENABLED_TOOLS` /
   `MAX_CACHED_TOOLS`; stamp `discoveredAt` iff changed; zero-tool outcome → binding returned
   byte-identical; per-toolkit failure isolation (one toolkit's rejection must not kill the
   fill for others — `try/catch` around each lister call); non-composio bindings pass through
   untouched; result array order-stable; never throws (malformed input → `{connectors:
   input-as-array-or-[], changed:false}`).

Spec cases (minimum): no-op on vetted/byo · no-op on seeded binding · no-op on explicit
disable (`discoveredAt` set, empty allowlist) · catalog-only fill without touching the lister ·
non-catalog fill via injected lister (assert enabledTools + tools + discoveredAt persisted
shape parses through `connectorBindingSchema`) · mixed catalog+non-catalog union + dedupe ·
caps · lister rejection → unchanged binding, `changed:false` for that binding · multi-binding
arrays where only one changes → `changed:true`, others byte-identical · `pickDiscoverySubset`
important-first/fallback/cap.

Commit: `feat(composio): live toolkit tool discovery + binding fill (DI, fail-soft)`.

## T2 — pure-layer parity in bindComposioToolkits

`lib/agents/generate/composio-resolver.ts`: `bindComposioToolkits` seeds
`enabledTools: defaultToolsForToolkits([slug])` (import from catalog.ts; keep the module's
"pure helpers have no SDK dependency" claim intact — catalog.ts is pure). Update the
function's doc comment + `composio-resolver.spec.ts` expectations (currently assert `[]`);
add a case: catalog slug seeds defaults, non-catalog slug stays `[]` (widened later by T1's
fill at persist time — reference the spec §2.2 in the comment).

Commit: `fix(composio): bindComposioToolkits seeds catalog defaults (T6 parity)`.

## T3 — wire the fill at compile + recompile

1. `app/api/v1/recordings/compile-agent/route.ts`: after `flowModelToBundle`, before
   `updateAgentTemplate`:
   `bundle.blueprint.connectors = (await fillComposioBindingTools(orgId!, bundle.blueprint.connectors)).connectors;`
   (helper never throws by contract — no new failure mode). Extend the route's existing spec
   harness if it stubs at a level where this is testable; otherwise cover via T3.2's DI test +
   a direct unit test of the helper (already T1) and note it.
2. `lib/recordings/continue-interview.ts`: add optional dep
   `fillConnectors?: (connectors: ConnectorBinding[] | undefined) => Promise<ConnectorBinding[] | undefined>`
   (default identity), applied to `bundle.blueprint.connectors` after `flowModelToBundle`,
   BEFORE `deps.updateTemplate` (never-lies ordering unchanged: still only on
   `result.applied`). Wire the real impl (closing over orgId →
   `fillComposioBindingTools`) in the thin "use server" wrapper
   (`lib/agent-templates/interview-actions.ts` — verify the wrapper filename by grep before
   editing). Spec: `continue-interview.spec.ts` gains a case asserting the filled connectors
   are what `updateTemplate` receives, and that a fill rejection is impossible by contract
   (identity default keeps old cases green).

Commit: `feat(composio): compile + continue-interview persist live-discovered tools`.

## T4 — wire the fill at both generate persist seams

`lib/agents/generate/actions.ts` `defaultCreate` and `app/api/v1/agents/generate/route.ts`
`defaultCreate`: before `updateAgentTemplate`, fill `input.blueprint.connectors` via
`fillComposioBindingTools(input.builderOrgId, …)`. Both files: keep the near-duplicate seams
aligned (same 3 lines; do NOT unify the duplicates — Kitchen Sink guard). Test: whichever of
the two has an existing spec harness with injectable create (run-generate specs inject
`create`, so add a focused unit test that `defaultCreate`-shaped fill logic is exercised —
if `defaultCreate` itself is untestable without DB, extract the 3-line fill into
`fillBlueprintConnectorsForPersist(orgId, blueprint)` in discover-tools.ts and unit-test
THAT, leaving both defaultCreates one-line callers).

Commit: `feat(composio): generated agents persist live-discovered tools (both seams)`.

## T5 — Connected stage: honest non-catalog rows + self-heal

1. `app/(dashboard)/studio/agents/[id]/lifecycle/connected-toolkits.ts`:
   `requiredToolkitSlugs` keeps non-catalog slugs (normalize+dedupe only; drop the
   `isCatalogToolkit` filter; update header comment + its spec — grep for the spec file).
2. `lib/integrations/composio/client.ts`:
   - `listConnections(orgId, opts)` gains `opts.extraToolkits?: string[]` — union onto the
     requested toolkit list (deduped) for BOTH the entity and org session-create paths, and
     thread an allowlist into the mapping;
   - `mapToolkitConnections(items, extraAllowed?: ReadonlySet<string>)` — keep catalog filter,
     also admit slugs in `extraAllowed`. Pure; extend its existing spec coverage (it's
     exercised in client/connector specs — grep `mapToolkitConnections` for the spec home).
   - `createConnectLink(orgId, toolkit, …)`: `ensureSession(orgId,
     [...COMPOSIO_TOOLKIT_SLUGS, toolkit])` deduped (harmless for catalog toolkits).
3. `lib/agent-templates/lifecycle-connect-actions.ts`: widen the toolkit allowlist to
   catalog ∪ template's own composio `enabledToolkits`: extend `deps.loadTemplate` to also
   return the template's composio toolkit slugs (org-guarded query already); reject anything
   else exactly as today. Extend the existing F8 spec: foreign template still
   `template_not_found`; non-catalog slug NOT on the template → `unknown_toolkit`;
   non-catalog slug bound on the template → proceeds to `createConnectLink`.
4. `app/(dashboard)/studio/agents/[id]/page.tsx`: before deriving `requiredToolkits`, if any
   composio binding is undiscovered (`enabledTools` empty && no `discoveredAt`), run
   `fillComposioBindingTools(orgId, blueprint.connectors)` and, when `changed`, persist via
   `updateAgentTemplate({id: template.id, patch: {connectors}})` (verify the patch key
   passes the template merge — mirror how other connector writes patch it; grep
   `saveConnectors` wiring) and use the filled array for the rest of the render. Idempotent
   by T1's guards. No key → helper returns unchanged; the existing
   `composioConfigured===false` card is the honest messaging (now correct for non-catalog
   agents because their slugs appear in `requiredToolkits`).
   Note `connected-stage.tsx` needs no change (name falls back to slug via
   `catalog?.label ?? slug` in page.tsx).

Commit: `feat(lifecycle): Connected stage is honest for non-catalog toolkits + self-heals undiscovered bindings`.

## T6 — catalog comment + close-out

- `lib/integrations/composio/catalog.ts`: update the "can be widened later by live
  discovery" comment to point at `discover-tools.ts`.
- Full unit-test run (delta vs baseline), `tsc` via the worktree junction method if needed
  (memory: worktree-typecheck-method), `bash scripts/check-use-server.sh` if present (grep
  scripts/), regression-grep for `enabledTools: \[\]` construction sites to confirm only the
  intended pure resting states remain.

Commit: `chore(composio): discovery close-out — comments + checks`.

## Named live-smoke items (for the close-out report, NOT unit-tested)

1. `getRawComposioTools({important:true})` real-API behavior (filter vs annotate).
2. `live.authorize(<non-catalog toolkit>)` on a session created with catalog+extra toolkits.
3. One real generate of a youtube/synthflow_ai-style sentence on a keyed org → binding shows
   discovered tools; supervised run exposes real `composio__*` tools.

## Guards (from CLAUDE.md + lessons)

- Minimal impact: do not refactor the duplicate `defaultCreate`s; do not touch
  `resolveComposioBinding`; do not restyle the Connected stage.
- L-31: no non-handler exports added to route.ts files.
- L-18: page.tsx stays a server component; no client imports of server-only modules.
- Success = observable end state: specs assert the PERSISTED binding shape (parses through
  `connectorBindingSchema`), not "the code ran".
