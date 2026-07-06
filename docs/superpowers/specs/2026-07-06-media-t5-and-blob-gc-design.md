# 2026-07-06 — Media T5 (bg-video smoke) + reference-aware seldonchat blob GC

Two independent ships. Order: T5 first, then blob-GC. Each: spec → build →
verify-build → review → merge gate.

---

## Feature 1 — Media T5: hero background-video render smoke

### Objective
Mechanically prove the r1 hero renders a background **video** with
`autoplay/muted/loop/playsInline` behind the `hero-cinematic-veil` scrim, and
that video takes precedence over a co-set background image. This closes the
never-live-smoked video loop at the render layer with a permanent regression
test.

### Why a render test, not a live pixel grade
- The render CODE already shipped in T1 and is correct (`hero.tsx:331-342`):
  `<video autoPlay muted loop playsInline preload="metadata">` + veil (`:351`),
  video-over-image precedence (`:331`).
- The write/resolve/tool halves are already unit-covered
  (`set-r1-media.spec.ts`, `copilot-media-tools.spec.ts`, `resolve-url.spec.ts`).
- A single screenshot **cannot** verify `autoplay`/`loop`/`muted` (they are
  motion/attribute properties, invisible in a still). `renderToString` asserting
  the emitted attributes is a *stronger* verifier for the video-specific behavior.
- The veil-over-media **legibility** was already retired by the image
  vision-verify (`d3eeb08d6` + `268480cf0`) — video reuses the *identical*
  `hero-cinematic-veil`, so there is no new legibility surface to grade.
- The remaining true live-pixel confirmation (a moving video behind the veil on a
  deployed r1 site) needs `SELDONFRAME_API_KEY` / DB creds to drive the copilot —
  absent in this session (MCP is 401). Surfaced at the merge gate as the one
  human-gated action, exactly as the image live-smoke was run by the prior session.

### Build
New file `packages/crm/tests/unit/landing/hero-background-video.spec.tsx`,
following the `hero-cta.spec.tsx` renderToString pattern. Render
`Hero` from `@/components/landing-r1/sections/hero` with `archetype:"bold-urgency"`
(→ `HeroSplit` → `HeroBackgroundLayer`). Assertions:
1. With `backgroundVideo:{src, poster}` set → HTML contains a `<video>` whose tag
   has `autoplay`, `muted`, `loop`, `playsinline`, `preload="metadata"`, the
   `src`, and the `poster`.
2. The `hero-cinematic-veil` element renders (legibility scrim present).
3. The `hero-has-bg-wrap` wrapper class is applied when a background is set.
4. **Precedence:** with BOTH `backgroundVideo` and `backgroundImage` set, a
   `<video>` renders and the `hero-bg-media` `<img>` does NOT (video wins).
5. Guard: with neither set, no `<video>` and no `hero-cinematic-veil` (byte-safe
   no-op for legacy payloads).

### Validation
`node --import tsx --test tests/unit/landing/hero-background-video.spec.ts*` → fail 0.
Part of `/verify-build`. Test-only diff → forbidden set = ALL of `src/`
(the smoke must not modify any product code).

---

## Feature 2 — Reference-aware GC of orphaned `seldonchat/*` blobs

### Objective
A daily cron that deletes orphaned Vercel Blob uploads under the `seldonchat/*`
prefix (attach/drag uploads that were never applied, or applied-then-replaced),
**without ever deleting a blob still referenced by a live site or its undo
history.**

### The safety crux (why naive age-GC is unsafe)
- `seldonchat/<uuid>-<name>` blobs carry **no orgId** in the path.
- Applied **images** are re-hosted to `media/external/*` by `resolveExternalMedia`
  → their `seldonchat/*` origin blob is genuinely orphaned after apply (safe target).
- Applied **videos** are NOT re-hosted — the `seldonchat/*` URL is stored directly
  in `landing_pages.blueprint_json.payload.hero.backgroundVideo.src`.
- **AND** `landing_payload_versions.payload` keeps immutable snapshots (never
  deleted); a `/revert` restores one. A video referenced only in an old snapshot
  would break on revert if swept.

### Design — two-layer protection
A `seldonchat/*` blob is deleted only if **BOTH**:
1. **Age:** `uploadedAt < now - TTL` (TTL = **48h**) — protects the
   upload→apply race window (user uploads, applies minutes later).
2. **Unreferenced:** its URL does not appear in the referenced-URL set built from
   **both** `landing_pages.blueprint_json` (all `isNotNull` rows) **and**
   `landing_payload_versions.payload` (all rows). Exact-URL match, plus a
   defensive pathname-substring guard (protects query/suffix variants).

### Files
- `packages/crm/src/lib/media/gc-seldonchat-blobs.ts` — the DI-free core:
  - `collectReferencedBlobUrls(jsonBlobs: unknown[]): Set<string>` — regex-extract
    every `https?://…` URL from each stringified blueprint/payload.
  - `selectOrphanBlobs(blobs, referenced, now, ttlMs): { toDelete, keptFresh, keptReferenced }`
    — the pure, unit-tested decision. Referenced check = `referenced.has(url)` OR
    any referenced URL includes `blob.pathname`.
  - `runSeldonchatBlobGc(deps, opts)` orchestrator: `deps = { listSeldonchatBlobs,
    collectReferenced, delBlobs, now }`; `opts = { ttlMs, dryRun, maxDeletions }`.
    Paginates `list({prefix:"seldonchat/", cursor})`, builds referenced set, selects,
    deletes in batches unless `dryRun`. Caps deletions at `maxDeletions` (1000) and
    logs if capped. Emits JSON audit lines.
- `packages/crm/src/app/api/cron/gc-seldonchat-blobs/route.ts` — GET+POST → auth →
  wire real deps (`@vercel/blob` `list`/`del`, `@/db` scan) → `runSeldonchatBlobGc`.
  Honors `?dryRun=1`.
- `packages/crm/vercel.json` — one appended cron entry, `"schedule":"30 4 * * *"`.
- `packages/crm/tests/unit/media/gc-seldonchat-blobs.spec.ts` — unit tests for the
  pure core (see below).

### Decisions (defaults chosen; Max may override at merge gate)
- **Auth: FAIL-CLOSED** — `401` when `CRON_SECRET` is unset, with a `console.warn`.
  Per L-13, a destructive route must not inherit the open-when-unset default that
  `orphan-workspace-ttl` uses for non-destructive local dev. Vercel cron auto-sends
  `Authorization: Bearer $CRON_SECRET` when the secret is configured. → **Merge-gate
  checklist: confirm `CRON_SECRET` is set in Vercel (Prod), or the cron no-ops.**
- **TTL = 48h.**
- **Real deletes by default** (so the scheduled cron actually GCs); `?dryRun=1` for
  a manual observe-only first run. Recommended: Max hits it once with `dryRun=1`.
- **maxDeletions = 1000** per run (runaway backstop).
- **No migration, no new table** — reference source is existing tables.

### Unit test cases (the pure core, offline, DI)
- orphaned + old → **DELETE** (applied-image origin / never-applied upload).
- referenced video URL + old → **KEEP** (exact-URL match, live blueprint).
- referenced only in a version snapshot + old → **KEEP** (revert safety).
- unreferenced + **fresh** (< TTL) → **KEEP** (upload→apply race).
- pathname-substring match (URL w/ query string) + old → **KEEP** (defensive).
- `maxDeletions` cap respected; `dryRun` deletes nothing but reports the set.

### Validation
`node --import tsx --test tests/unit/media/gc-seldonchat-blobs.spec.ts` → fail 0;
tsc 0-new; check-use-server clean; no migration; regression grep (must NOT touch
`resolve-url.ts`, `set-r1-media.ts`, `hero.tsx`, `copilot/tools.ts`, bookings,
messaging). Live smoke = `curl` the route with `?dryRun=1` post-deploy (needs
`CRON_SECRET`) — human-gated.

### Stop condition
Both: verify-build PASS + independent review (opus for blob-GC — destructive +
cron + blob deletion; sonnet for T5 test-only) approve → merge gate (Max).
