# Wire archetype design system into v2 lean URL flow

**Status:** Approved design — ready for implementation planning.
**Author:** Maxime + Claude (brainstorm session 2026-05-15)
**Predecessors:** `2026-05-14-pull-firecrawl-out-of-backend-design.md`, `2026-05-15-soften-rigid-validators-design.md`, `2026-05-15-agency-output-product-moment-design.md`

---

## 1. Problem

Empirical evidence: Mr Rooter plumbing landing page (`https://mr-rooter-plumbing-of-austin.app.seldonframe.com`) renders with generic-looking imagery and a wrong-archetype hero treatment — `viktor-light` editorial italic — even though the `enhance_blocks_succeeded` log line shows `archetype: "bold-urgency"` was correctly classified.

Same gap on the dental and medspa workspaces: archetype detected, archetype NOT applied.

Operators (agencies/freelancers selling to local SMBs) see the preview, decide the platform "looks generic", and bounce before reaching the real magic.

### 1.1 Root cause (hidden in the v2 flow)

```
v1 createFullWorkspace (server)
  └─ enhance-blocks → classifies archetype → applies heroVariant + defaultTemplate
     └─ writes archetype-aware sections to landing_pages.sections
        └─ (returns to CC agent via v2/create response)

CC agent (client)
  ├─ reads context.personality_vertical (BUT NOT context.aesthetic_archetype — doesn't exist yet)
  ├─ guesses archetype from vertical alone
  ├─ generates hero props with template="viktor-light" (wrong)
  └─ POST persist_block

persist_block (server)
  └─ reads template directly from agent's props
     └─ OVERWRITES the archetype-aware sections from step 1
        └─ Landing page now renders with the agent's (wrong) template
```

Two ways visual identity gets lost:
1. **No archetype context to the LLM** — the v2/create response context doesn't include the classified archetype, so the CC agent can't propagate it into its block prompts.
2. **No server enforcement** — persist_block reads `template` and `variant` straight from the agent's payload with zero validation against the workspace's archetype.

### 1.2 Secondary problem (compounds the first)

Production log audit for Mr Rooter creation:
- LLM generated 1 hero query + 6 gallery queries = 7 queries
- All too specific (e.g., `asphalt shingle residential roof restoration Austin`)
- `buildQueryCandidates` broadens each → 21 Unsplash API calls
- 17 of 21 returned zero results
- Hero rendered text-only, gallery had 4 missing tiles

The existing 3-tier broadening (full → drop-first-word → last-two-words) doesn't go BROAD enough. We need an archetype-curated last-resort fallback set with queries pre-verified to return results.

---

## 2. Goals

1. Per-vertical landing pages actually look per-vertical: HVAC plumbing = urgent split-screen with service-truck imagery, dental = restrained navy nexora-light with practice-interior photo, medspa = cinematic-aura with warm cream luxe footage.
2. Zero text-only heroes. Every landing has a hero photo, even when the LLM-generated Unsplash query returns 0 results.
3. Zero database migration. Land on the existing JSONB OrgTheme column.
4. Antifragile to LLM behavior shift — even if a future Claude model misreads SKILL.md, server enforcement keeps visual identity correct.

## 3. Non-goals

- Adding new archetypes (7 existing stays).
- Alternative-fallback-image picker UI ("give me a different photo").
- Retroactive landing-page regeneration for existing workspaces.
- MCP server version bump (this is pure backend).
- Changes to v1 createFullWorkspace's first-render path — that path is already correct.
- Rewriting any of the 7 hero template renderer components.
- Pexels video fallback (cinematic templates fall back to branded gradient when video missing — fine).
- Image quality scoring or aesthetic ranking of Unsplash results.

---

## 4. Architecture

### 4.1 Two coordinated changes

**Change 1 — Archetype propagation (server → CC agent → server).**
- v2/create surfaces the classified archetype in its response context
- CC agent's hero block SKILL.md teaches its LLM to read that field and pick the matching template
- persist_block enforces archetype.defaultTemplate and archetype.heroVariant server-side regardless of what the agent sent (safety net)

**Change 2 — Per-archetype curated Unsplash fallback.**
- Each of 7 archetypes gets a `fallbackImageQueries: string[]` field with 5-8 short, pre-verified queries
- `resolveHeroImage` and `resolveGalleryImages` accept an optional archetype context
- When all LLM-generated query candidates return zero results, fall through to `archetype.fallbackImageQueries[deterministicHash(businessName) % len]`
- Hash is deterministic so regenerate gives the same fallback photo (operator iteration story)

### 4.2 Where archetype lives

Stored on `org.theme.aestheticArchetype: AestheticArchetypeId | undefined`. `OrgTheme` is already JSONB, so adding an optional field is non-breaking. `enhance-blocks.ts` already calls `applyOrgTheme` with palette + fonts + motionPreset; we extend that one call to also patch `aestheticArchetype: archetypeId`.

For pre-v1.54 workspaces (no `aestheticArchetype` field set), `resolveOrgArchetype` in persist.ts lazy-reclassifies from `org.soul` on first hero persist and patches the theme JSONB for future reads.

---

## 5. Detailed changes

### 5.1 — Extend `OrgTheme` type

`packages/crm/src/lib/theme/types.ts`

```typescript
import type { AestheticArchetypeId } from "@/lib/workspace/aesthetic-archetypes";

export interface OrgTheme {
  // existing fields unchanged...
  motionPreset?: MotionPreset;
  /** v1.54.0 — Aesthetic archetype id chosen at workspace creation.
   *  Drives persist_block's hero template/variant enforcement and
   *  archetype-curated Unsplash fallback. Optional for backward compat:
   *  workspaces created pre-1.54 lazy-reclassify on first hero persist. */
  aestheticArchetype?: AestheticArchetypeId;
}
```

### 5.2 — Persist archetypeId on classification

`packages/crm/src/lib/workspace/enhance-blocks.ts` (existing `applyOrgTheme` call, ~line 1353):

```typescript
await applyOrgTheme({
  orgId: input.orgId,
  patch: {
    primaryColor: archetype.palette.primary,
    accentColor: archetype.palette.secondary,
    fontFamily: archetype.fonts.headline as OrgTheme["fontFamily"],
    mode: "light",
    borderRadius: "rounded",
    logoUrl: null,
    motionPreset: archetype.motionPreset,
    aestheticArchetype: archetypeId,  // NEW
  },
});
```

### 5.3 — Surface archetype in v2/create response

`packages/crm/src/app/api/v1/workspace/v2/create/route.ts` (line 178-197 context object):

```typescript
const context = {
  // ...existing fields...
  personality_vertical: result.configured?.personality ?? null,
  timezone: result.configured?.timezone ?? null,
  theme: result.configured?.theme ?? null,
  /** v1.54.0 — aesthetic archetype id so the CC agent's hero block
   *  prompt can pick the right template + voice without guessing
   *  from vertical alone. */
  aesthetic_archetype: result.configured?.theme?.aestheticArchetype ?? null,
};
```

### 5.4 — Teach hero SKILL.md to use the archetype

`packages/crm/src/blocks/hero/SKILL.md` — prepend the archetype guidance table:

```markdown
## v1.54 — Archetype-driven template selection

The workspace has been classified into one of 7 aesthetic archetypes.
Read it from `context.aesthetic_archetype`. Use the table verbatim:

| context.aesthetic_archetype | template field |
|------------------------------|----------------|
| `"bold-urgency"`             | `""` (omit) — tradesmen use the legacy split-screen variant |
| `"clinical-trust"`           | `"nexora-light"` |
| `"cinematic-aspirational"`   | `"cinematic-aura"` |
| `"editorial-warm"`           | `"viktor-light"` |
| `"technical-restrained"`     | `"viktor-light"` (or `"stellar-tabs-white"` for SaaS) |
| `"soft-residential"`         | `"viktor-light"` |
| `"brutalist"`                | `"securify-bold"` |

The server enforces this anyway, so picking the wrong one wastes a
round-trip. Picking the right one means your `headline`/`subheadline`
copy matches the visual treatment (urgent for bold, editorial for warm).
```

### 5.5 — Add `fallbackImageQueries` to all 7 archetypes

`packages/crm/src/lib/workspace/aesthetic-archetypes.ts` — extend the interface and populate each archetype:

```typescript
export interface AestheticArchetype {
  // existing fields...
  /** v1.54.0 — Curated Unsplash search terms verified to return
   *  non-zero results. Used as last-resort fallback when the LLM's
   *  generated query + all broadening tiers return zero results.
   *  Each entry must be 2-4 words. */
  fallbackImageQueries: string[];
}
```

Per-archetype curated lists (each query pre-verified against Unsplash API to return ≥ 15 results):

```typescript
"bold-urgency":            ["plumber working", "hvac technician", "electrician work", "service truck", "uniform worker", "trade professional"]
"clinical-trust":          ["modern dental office", "medical practice interior", "professional consultation", "doctor office reception", "law firm interior", "professional handshake"]
"cinematic-aspirational":  ["luxury spa interior", "modern wellness studio", "minimalist treatment room", "premium fitness studio", "spa relaxation", "aesthetic beauty"]
"editorial-warm":          ["craftsman workshop", "artisan hands working", "skilled tradesperson", "family workshop", "warm restoration project", "craft detail"]
"technical-restrained":    ["modern workspace", "professional team meeting", "minimalist office", "design studio", "tech workspace", "professional collaboration"]
"soft-residential":        ["home garden", "tidy modern home", "residential lawn", "clean home interior", "pet grooming", "homeowner happy"]
"brutalist":               ["concrete architecture", "industrial design", "raw studio space", "minimalist gallery", "modern sculpture", "design exhibit"]
```

### 5.6 — Wire fallback into image resolvers

`packages/crm/src/lib/crm/personality-images.ts`:

```typescript
import { ARCHETYPES, type AestheticArchetypeId } from "@/lib/workspace/aesthetic-archetypes";

function pickFallbackQuery(
  archetype: AestheticArchetypeId,
  businessName: string,
): string {
  const fallbacks = ARCHETYPES[archetype].fallbackImageQueries;
  if (fallbacks.length === 0) return "professional business";
  let hash = 5381;
  for (let i = 0; i < businessName.length; i++) {
    hash = ((hash << 5) + hash + businessName.charCodeAt(i)) | 0;
  }
  return fallbacks[Math.abs(hash) % fallbacks.length];
}

// Extract the inner candidate-loop into a reusable helper:
async function tryUnsplashSearch(
  query: string,
  apiKey: string,
  orientation: "landscape" | "squarish",
  perPage: number,
): Promise<ResolvedUnsplashImage | null> {
  // (existing inner loop logic from resolveHeroImage, refactored for reuse)
}

export async function resolveHeroImage(
  query: string,
  archetypeContext?: { archetype: AestheticArchetypeId; businessName: string },
): Promise<ResolvedUnsplashImage | null> {
  const cleanedQuery = query?.trim() || "professional business interior";
  const apiKey = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!apiKey) return null;

  // Phase 1 — LLM-generated query + broadenings (existing behavior).
  const candidates = buildQueryCandidates(cleanedQuery);
  for (const candidate of candidates) {
    const result = await tryUnsplashSearch(candidate, apiKey, "landscape", 15);
    if (result) return result;
  }

  // Phase 2 — NEW: archetype-curated fallback.
  if (archetypeContext) {
    const fallbackQuery = pickFallbackQuery(
      archetypeContext.archetype,
      archetypeContext.businessName,
    );
    console.warn(JSON.stringify({
      event: "unsplash_archetype_fallback_used",
      original_query: query,
      archetype: archetypeContext.archetype,
      fallback_query: fallbackQuery,
    }));
    const result = await tryUnsplashSearch(fallbackQuery, apiKey, "landscape", 15);
    if (result) return result;
  }

  return null;
}

// Same shape for resolveGalleryImages — accepts archetypeContext, fires
// Phase 2 per zero-result slot using index in the fallback array (not hash)
// so multiple services don't all land on the same photo.
```

### 5.7 — Server-side enforcement in persist_block

`packages/crm/src/lib/page-blocks/persist.ts`:

```typescript
import { ARCHETYPES, classifyArchetype, type AestheticArchetypeId } from "@/lib/workspace/aesthetic-archetypes";

async function resolveOrgArchetype(
  workspaceId: string,
  org: { theme: OrgTheme; soul: OrgSoul | null },
): Promise<AestheticArchetypeId> {
  // Happy path
  if (org.theme.aestheticArchetype) return org.theme.aestheticArchetype;

  // Backward compat — re-classify from soul on the fly.
  const reclassified = classifyArchetype({
    vertical: org.soul?.personality_vertical ?? "",
    emergencyService: org.soul?.emergency_service ?? null,
    sameDay: org.soul?.same_day ?? null,
    reviewRating: org.soul?.review_rating ?? null,
    reviewCount: org.soul?.review_count ?? null,
    businessDescription: org.soul?.business_description ?? null,
  });
  // Lazy backfill so subsequent persists don't re-classify.
  await db.update(organizations)
    .set({ theme: { ...org.theme, aestheticArchetype: reclassified } })
    .where(eq(organizations.id, workspaceId));
  console.warn(JSON.stringify({
    event: "org_archetype_lazy_backfilled",
    workspace_id: workspaceId,
    archetype: reclassified,
  }));
  return reclassified;
}

// Inside maybeBuildSectionsUpdate, after loading the org:
const archetypeId = await resolveOrgArchetype(workspaceId, org);
const archetype = ARCHETYPES[archetypeId];

const llmPickedTemplate = (args.validatedProps as { template?: string }).template ?? "";
const knownTemplates = new Set([
  "cinematic-aura", "viktor-light", "velorah-editorial",
  "nexora-light", "securify-bold", "stellar-tabs-white",
]);

// Server enforcement: trust the LLM ONLY when it agrees with the archetype.
const finalTemplate = (() => {
  if (knownTemplates.has(llmPickedTemplate) && llmPickedTemplate === archetype.defaultTemplate) {
    return llmPickedTemplate;
  }
  if (llmPickedTemplate !== archetype.defaultTemplate) {
    console.warn(JSON.stringify({
      event: "hero_template_overridden",
      workspace_id: workspaceId,
      archetype: archetypeId,
      llm_picked: llmPickedTemplate,
      archetype_default: archetype.defaultTemplate,
    }));
  }
  return archetype.defaultTemplate;
})();

// Same logic for variant
const llmPickedVariant = args.section.variant;
const finalVariant = (() => {
  if (llmPickedVariant === archetype.heroVariant) return llmPickedVariant;
  console.warn(JSON.stringify({
    event: "hero_variant_overridden",
    workspace_id: workspaceId,
    archetype: archetypeId,
    llm_picked: llmPickedVariant,
    archetype_default: archetype.heroVariant,
  }));
  return archetype.heroVariant;
})();
```

Pass `archetypeContext: { archetype: archetypeId, businessName: org.name }` to both `resolveHeroImage` and `resolveGalleryImages` calls in persist.ts.

---

## 6. Testing

Four new spec files under `packages/crm/tests/unit/`, all `node:test` + `tsx`.

### 6.1 `aesthetic-archetypes-fallback.spec.ts`
Registry invariants:
- Every archetype has ≥ 5 fallback queries
- Every fallback query is 2-4 words
- Fallback queries within an archetype are unique
- Classifier regression: plumbing+emergency → bold-urgency, dental → clinical-trust, medspa → cinematic-aspirational

### 6.2 `personality-images-archetype-fallback.spec.ts`
Fallback Phase 2 behavior with mocked fetch:
- Phase 1 succeeds → Phase 2 never fires
- Phase 1 all-zero, no archetypeContext → returns null (unchanged behavior)
- Phase 1 all-zero, with archetypeContext → Phase 2 fires, returns image
- pickFallbackQuery is deterministic: same input → same output
- pickFallbackQuery distributes: 3 different business names → at least 2 distinct fallback queries

### 6.3 `persist-hero-archetype-enforcement.spec.ts`
Server override with test DB:
- Workspace with archetypeId="bold-urgency" stored in theme
- persist_block with `template="viktor-light"` (LLM wrong)
- Assert sections[0].content.template === "" (overridden)
- Assert sections[0].content.variant === "split-screen-50-50" (overridden)
- Assert `hero_template_overridden` and `hero_variant_overridden` log events emitted

### 6.4 `org-theme-archetype-backfill.spec.ts`
Lazy backfill for pre-v1.54 workspaces:
- Workspace created with theme but no aestheticArchetype
- persist_block called for hero
- resolveOrgArchetype re-classifies from soul and patches theme
- Subsequent persist_block call reads from theme directly (no re-classification)

### 6.5 Integration smoke test (manual, on preview deploy)
Three workspaces representing three archetypes:
- Plumbing emergency → bold-urgency → split-screen-50-50 + service-truck imagery
- Dental practice → clinical-trust → nexora-light + practice-interior imagery
- Medspa → cinematic-aspirational → cinematic-aura + spa imagery

For each, assert via `/api/v1/workspace/<id>/snapshot`:
- `theme.aestheticArchetype` matches expected
- `sections[0].content.template` matches archetype default
- `sections[0].content.heroImage` is a non-empty Unsplash URL

Watch Vercel logs for 24h post-deploy.

### 6.6 Test data fixtures
`tests/unit/fixtures/`:
- `plumbing-emergency-soul.json`
- `dental-practice-soul.json`
- `medspa-luxe-soul.json`

### 6.7 Out of test scope
- Unsplash API itself (mocked at the network boundary)
- LLM template-picking accuracy (we override server-side)
- Pre-existing failing test `workflow-event-log/category-server-actions.spec.ts` — ignore it for this plan

---

## 7. Rollout

### 7.1 Sequence
1. Land single PR (all 7 source files + 4 test files)
2. Vercel auto-deploys to preview
3. Smoke test on preview per 6.5
4. Promote preview → production
5. Watch logs for 24h
6. After 24h soak, regenerate Mr Rooter + create one new dental + one new medspa to confirm archetype-correct rendering

### 7.2 Observability events
| Event | Where | When |
|-------|-------|------|
| `hero_template_overridden` | persist.ts | LLM's template ≠ archetype.defaultTemplate |
| `hero_variant_overridden` | persist.ts | Same logic for variant field |
| `org_archetype_lazy_backfilled` | persist.ts | First persist on pre-1.54 workspace |
| `unsplash_archetype_fallback_used` | personality-images.ts | Phase 2 fires (hero or gallery) |

Initial target: `hero_template_overridden` > 50% (LLM regularly picks wrong, override saves it).
Healthy steady-state target: `hero_template_overridden` < 20% (SKILL.md guidance working; override is thin safety net).

### 7.3 Rollback
Single `git revert <merge-commit>`. Workspaces with `org.theme.aestheticArchetype` set keep that JSONB field — harmless extra data, ignored by reverted code. No data cleanup needed.

---

## 8. Open questions / future work

Followups, NOT blockers for this spec:

- **Reclassify on soul change.** If operator updates soul.business_description, archetype might shift. Today we only classify at creation. A follow-up: trigger reclassification when soul-rewriting MCP tools fire.
- **Per-vertical fallback ladder.** Today fallback is per-archetype. Could be richer (medspa-luxe vs. medspa-budget both cinematic-aspirational). Defer until usage data.
- **LLM-side prompt tuning.** Once we have a week of `hero_template_overridden` data, iterate on hero SKILL.md guidance until override rate drops < 10%.
- **Brain pattern compounding.** Layer-2 brain could capture "for vertical=plumbing, fallback `service truck` had 4.8★ across workspaces" — natural Brain v2 follow-up.
- **Alternative-fallback-picker UI.** Operator says "give me a different photo" — separate spec, not v1.54.

---

## 9. Definition of Done

- [ ] `OrgTheme.aestheticArchetype` field added; classifier writes it on every new workspace
- [ ] v2/create response context surfaces `aesthetic_archetype`
- [ ] hero block SKILL.md has the Archetype→Template table prepended
- [ ] persist_block server-enforces template + variant against archetype defaults
- [ ] persist_block lazy-backfills archetype on pre-v1.54 workspaces
- [ ] All 7 archetypes have `fallbackImageQueries` populated (5-8 entries each)
- [ ] `resolveHeroImage` and `resolveGalleryImages` accept optional `archetypeContext` and fire Phase 2 fallback on zero-results
- [ ] All 4 unit spec files pass on first run
- [ ] Smoke test on preview confirms 3 archetypes render distinct visual identities
- [ ] 24h production soak shows expected log event distribution
- [ ] Mr Rooter regenerate visibly transitions from viktor-light to split-screen-50-50

## 10. Recap of total scope

| File | Change | LoC est. |
|------|--------|----------|
| `lib/theme/types.ts` | Extend OrgTheme | 3 |
| `lib/workspace/aesthetic-archetypes.ts` | Add fallbackImageQueries to all 7 | 60 |
| `lib/workspace/enhance-blocks.ts` | Persist archetypeId on org | 3 |
| `app/api/v1/workspace/v2/create/route.ts` | Surface in context | 3 |
| `blocks/hero/SKILL.md` | Archetype→template table | 15 |
| `lib/page-blocks/persist.ts` | resolveOrgArchetype + server override | 40 |
| `lib/crm/personality-images.ts` | tryUnsplashSearch + Phase 2 fallback | 50 |
| 4 unit spec files | Per Section 6 | 250 |
| **Total** | | **~424 LoC** |
