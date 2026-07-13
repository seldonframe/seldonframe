# Widening curated defaults with live discovery, without breaking the "empty = disabled" contract

## The problem, in one line

Composio connector bindings for toolkits outside the 8-toolkit curated catalog resolved to
zero real tools at runtime (`defaultToolsForToolkits("youtube") === []`), but the naive fix —
"fill empty allowlists at runtime" — was forbidden because the Studio editor uses an
explicitly-cleared `enabledTools: []` to mean "operator disabled every tool."

## The approach

1. **Find the state that distinguishes "never filled" from "deliberately emptied."** The
   binding shape already carried it: every discovery/picker write stamps `discoveredAt`
   (see `setTemplateComposioToolkits`, `buildConnectorBinding`), while pure construction-time
   bindings never do. So `enabledTools.length === 0 && !discoveredAt` = the never-discovered
   resting state; `discoveredAt` set + empty = explicit disable. No migration, no new field.
2. **Fill at authoring/persist time only, never at resolve time.** One fail-soft helper
   (`fillComposioBindingTools` in `packages/crm/src/lib/integrations/composio/discover-tools.ts`)
   is called at every seam that PERSISTS a blueprint (compile route, recompile, both generate
   `defaultCreate`s) plus one render-time self-heal on the agent page for pre-existing rows.
   The runtime resolver (`resolveComposioBinding`) stays byte-identical.
3. **Catalog defaults first (pure, free), live discovery only for the gap.** Only toolkits
   with no curated defaults hit the network (`composio.tools.getRawComposioTools`), with an
   `important: true` first pass falling back to the full list, capped at 20.
4. **Make "not discovered" self-retrying, not sticky.** A fill that yields zero tools returns
   the binding byte-identical (no `discoveredAt` stamp), so the next authoring encounter
   retries; a fill that changes anything stamps `discoveredAt`, making re-renders no-ops.
5. **Clamp discovered data to the persistence schema's bounds at the mapper** (name ≤128 →
   drop, description ≤4000 → slice). The write path (`updateAgentTemplate`) doesn't
   re-validate, but the NEXT editor save `safeParse`s the whole connectors array — one
   oversized cached tool would brick all future blueprint edits for that template. Caught in
   independent review, not by the maker.

## Judgment calls

- **Did NOT change `resolveComposioBinding` or add a "fill if empty" branch at runtime** —
  that would silently re-enable tools an operator explicitly disabled. The whole design hangs
  on finding a marker instead of changing the contract.
- **Did NOT unify the two near-duplicate `defaultCreate` persist seams** (generate action vs
  generate API route) while wiring both — Kitchen Sink guard; extraction of the 3-line fill
  into one shared helper was enough.
- **Did NOT build the full OAuth/connect rail for non-catalog toolkits.** The Connected stage
  only became honest (non-catalog slugs now render as required rows; the connect allowlist
  widened to catalog ∪ the org-guarded template's OWN bound toolkits — not to arbitrary
  slugs, preserving the earlier security review's guard). Live `authorize()` behavior for
  non-catalog toolkits is a named live-smoke item, not unit-asserted.
- **Accepted a DB write during a server-component GET render** for the self-heal, because the
  marker guards make it idempotent; flagged the zero-tool-keyed-org repeat-discovery cost as
  a follow-up (negative-discovery cache), not scope.

## The reusable rule, one line

When widening auto-defaults over a field whose emptiness is user-meaningful, don't change the
consumer — find (or add) a provenance marker that separates "never populated" from
"deliberately emptied," fill only at authoring time behind that marker, and clamp anything
externally-sourced to the strictest schema that will ever re-validate it.
