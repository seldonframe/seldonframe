# Parallel Enhance — Implementation Plan

Goal: cut workspace creation from ~116s to ~20-30s. Antifragility: same
Opus 4.7 everywhere (operator's BYOK, cost isn't ours), no model-tier
mapping in code. Skills stay fat, harness stays thin, smarter Opus only
makes each parallel call faster.

## Architecture decision

Currently the orchestrator makes ONE big Opus call returning a 9-key JSON
(hero + services + about + faq + cta + benefits + process + gallery + …)
in ~6k input / ~3k output tokens. Sequential token generation on a 3k
output dominates the wall-clock (~60-90s).

After: split into per-section parallel Opus calls. Each call carries the
shared business context + archetype design brief + ONE SKILL.md body and
returns ONE section's JSON (~1.5k in / ~400 out, ~8-15s each). Wall-clock
becomes max(9 parallel) ≈ ~10-15s. Same Opus 4.7 for every call.

Coherence is preserved by the *shared inputs*, not by the LLM seeing
sibling section outputs. Each call receives:
- Business context (name, city, services, description, proof signals)
- Archetype design brief (palette, voice tone/pace/leanInto/avoid)
- That section's SKILL.md (the per-section rules + worked examples)

Hormozi-style copy is independent-by-section anyway — the FAQ doesn't
quote the hero, services don't reference about. The current "one big
call" was an artifact of batching, not a coherence requirement.

## Phase 1a (this PR) — #1 + #2 + #3 stacked

### Files to modify

1. **`lib/workspace/enhance-blocks.ts`**

   Replace the monolithic `enhanceLandingForWorkspace` LLM call with a
   per-section fan-out. New shape:

   ```ts
   // Section list — same as today's ENHANCE_BLOCKS, kept here as the
   // single source of truth for what gets generated.
   const SECTIONS = [
     "hero",
     "services",
     "about",
     "benefits",
     "process",
     "faq",
     "cta",
     "projectGallery",
     // Note: navbar / footer / sticky-mobile-cta stay mechanical
     // (composed from input, no LLM call) — same as today.
   ] as const;

   async function enhanceSection(
     name: SectionName,
     input: EnhanceLandingInput,
     archetype: AestheticArchetype,
     skillMd: string,
   ): Promise<{ name: string; payload: Record<string, unknown> | null }> {
     // Build a SECTION-SCOPED prompt:
     //   - shared business context (cached block)
     //   - shared archetype design brief (cached block)
     //   - this section's SKILL.md body (cached block)
     //   - per-section JSON output spec (the relevant slice of the
     //     current monolithic JSON spec, lifted into a per-section
     //     constant for clarity)
     //   - "return ONLY valid JSON for this section" instruction
     // Call Opus 4.7. Parse. Return.
   }
   ```

   Orchestration becomes:

   ```ts
   const skills = await loadAllSkills(); // already exists
   const results = await Promise.allSettled(
     SECTIONS.map((name) => enhanceSection(name, input, archetype, skills[name])),
   );
   // Merge results into the same `payload` shape today's payloadToSections expects.
   // Failed sections → omitted (soft-fail), payloadToSections handles missing keys.
   ```

2. **`payloadToSections` stays unchanged** — it already handles missing
   payload keys gracefully (each section is wrapped in `if (asObject(...))`).
   Parallel calls that fail just produce a payload without that key, and
   the corresponding section gets skipped on render. **Better failure mode
   than today**: one section validator failing no longer drops every
   other section.

3. **Asset resolution parallelization** (the #2 win)

   In `payloadToSections`, the per-service gallery resolutions currently
   loop sequentially. Move them to `Promise.all` alongside the hero
   image + Pexels video. Three independent fetches in parallel beats
   ~13 sequential.

   Concretely: collect all resolved-image promises up front in a
   pre-step, then `await` once, then push sections with results in hand.

4. **Prompt cache** (the #3 win)

   Anthropic prompt cache via `cache_control: { type: "ephemeral" }` on
   the message blocks containing the SKILL.md body + the
   business-agnostic boilerplate (the "Hormozi mental model" preamble).
   5-min TTL covers a batch of workspaces created in quick succession.

   Business context (name, services, etc.) is workspace-specific and
   stays uncached.

   Two cache breakpoints per call:
   - Block A: Hormozi preamble + archetype voice rules (boilerplate)
   - Block B: this section's SKILL.md body
   - Block C: workspace-specific business context (NOT cached)

### What does NOT change

- `lib/blocks/*/SKILL.md` — every fat skill stays byte-identical.
- `payloadToSections` — same merge logic, just receives a payload built
  from parallel results instead of one big call.
- `aesthetic-archetypes.ts` — untouched. Archetype routing stays.
- The Pexels + cinematic-aura wiring from v1.41.0 — untouched. Hero
  section now uses `heroVideo_query` + `shinyWord` from the parallel
  hero call instead of the monolithic call. Same fields, same logic.

### Verification

- [ ] `pnpm typecheck` + `pnpm build` green
- [ ] Create a fresh test workspace, measure wall-clock from MCP call →
      "is live" response. Target: ≤30s.
- [ ] Compare generated content side-by-side with a v1.41.0 baseline
      workspace. Same archetype, same input — sections should be
      qualitatively equivalent (Hormozi copy, archetype voice, niche
      specificity). Skim for any coherence drift between hero ↔ about ↔
      services that wasn't there before.
- [ ] Soft-fail check: if one section's Opus call throws, confirm the
      others still land and the workspace ships with that section
      omitted (not broken).

## Phase 1b (separate PR, deferred) — #4 async URL return

Bigger architectural change, splitting out so 1a can ship first.

The shell (DB writes, soul setup, slug → live URL on
`<slug>.app.seldonframe.com`) is ready in ~5s. Today the MCP response
blocks until enhance completes. Inversion:

1. MCP `create_full_workspace` returns at shell-ready (~5s) with:
   - `admin_url`
   - `public_urls`
   - `status: "enhancing"`
2. Enhance runs via Next 16 `after()` (or a queued worker)
3. Landing page renders with a "Generating your content…" skeleton in
   each section block while `landing_pages.sections` is empty
4. On enhance completion → ISR revalidate → next visit shows real content

Operator-perceived "magic" hits at 5s instead of 25-30s. Total work
unchanged.

Phase 1b lift:
- Wrap the enhance phase in `after()` inside the MCP route handler
- Add a `status` enum on `landing_pages` (or `organizations`) tracking
  `creating | enhancing | ready`
- Update `PageRenderer` to render skeleton states when `status !== 'ready'`
- ISR revalidate on enhance completion
- MCP `create_full_workspace` returns the new status field
- MCP welcome message updates to set operator expectation ("Site is live
  now — content is filling in over the next ~20 seconds, refresh in a
  bit to see the final copy")

## Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Section coherence drift (hero ↔ services tone) | Low | All calls share business context + archetype voice. Hormozi sections don't cross-reference. Verify on first test. |
| Anthropic RPM rate limit (9 concurrent Opus calls) | Medium for Tier 1 BYOK | Use SDK's built-in retry; if a section 429s, that section soft-fails (workspace ships without it). Worst case → batch into 3 groups of 3 with `Promise.allSettled` chained. Decide after first measurement. |
| Total token spend per workspace ~2x (repeated context per call) | High but irrelevant | Operator's BYOK pays. Confirmed not our concern. |
| Prompt cache miss on first workspace of a session | Always (by design) | First workspace pays full input cost; subsequent workspaces in the 5-min window get the cache hit. Acceptable. |
| One section's Opus output blocks all others | Eliminated | `Promise.allSettled` instead of `Promise.all`. Each section independent. |

## Antifragility self-check

- **Skills stay fat**: every SKILL.md byte-identical. Smarter Opus
  produces better per-section output from the same spec.
- **Harness stays thin**: the orchestrator gets ~50 lines longer (the
  fan-out logic) but loses ~100 lines (the one-big-prompt assembly).
  Net thinner.
- **No model-tier hardcoding**: single `process.env.SF_ENHANCE_BLOCKS_MODEL`
  used by every parallel call. When Opus 5 ships, change one env var,
  every section upgrades.
- **Stays additive**: no fat skill changes, no archetype changes, no
  v1.41.0 cinematic regression. Pure orchestration optimization.

## Expected stacked math

```
Shell                  5s   (unchanged)
9 parallel Opus calls ~12s  (was ~60-90s sequential; saved ~60s)
Parallel assets        ~3s  (was 10-15s sequential; saved ~10s)
Booking/intake/etc     ~5s  (unchanged)
─────────────────────
Total                 ~25s
```

Phase 1b takes perceived latency to ~5s without touching this number.

## Open questions for review

1. Confirm Anthropic BYOK keys are Tier 3+ in practice for paying
   operators (9 concurrent Opus calls = ~9 RPM). If many operators are
   on Tier 1 (~5 RPM), the parallel fan-out may need to batch.
   Recommendation: ship it, observe, batch if rate-limits appear.
2. Should we include a feature flag (`SF_PARALLEL_ENHANCE=true`) to
   roll back to monolithic call on a per-deploy basis? Cheap insurance.
   Recommendation: yes, but kept env-gated, not per-workspace.
