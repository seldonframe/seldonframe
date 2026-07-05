# Simple Home + Modules + Command Bar — Rollout Notes (Task 9)

Wave: `64a221ba..872582ec` (T1-T8 + fixers T2b/T4b/T6b), base `079a45ba`, HEAD verified `872582ec` on `feature/onboarding-batch-2`.

## The flip

- Env var: `SF_SIMPLE_HOME=1` — non-secret, set directly in Vercel project env (all environments as desired), then **redeploy** (server components read `process.env.SF_SIMPLE_HOME` at render time; no restart-only cache to worry about beyond the normal Next.js redeploy).
- Strict equality gate: `isSimpleHomeOn` in `packages/crm/src/lib/web-build/policy.ts:43` returns true only for the exact string `"1"`. Any other value (`"true"`, `"yes"`, unset) keeps the whole surface dark.
- **Known minor (not fixed here, ledgered at SH-T1):** unlike its sibling `isWinLadderOn` (`policy.ts:37`), `isSimpleHomeOn` does not `.trim()` its input. A trailing space/newline in the Vercel env value (e.g. pasted with a stray newline) would silently fail to activate. Low risk — Vercel's env UI does not typically introduce whitespace — but worth confirming the literal value on first flip.

## What ships live on merge, regardless of the flag

These are NOT gated by `SF_SIMPLE_HOME` and take effect the moment this branch merges to main, independent of any env flip:

1. **Copy-truth pass — "Intake Form(s)" → "Lead Form(s)"** across every resolution path an owner can see:
   - `packages/crm/src/lib/soul/templates/default.ts` — default soul template label
   - `packages/crm/src/lib/soul/fallback.ts` — wizard-generated soul fallback label
   - `packages/crm/src/lib/soul/actions.ts:170` — business-profile-update seed label
   - `packages/crm/src/lib/soul/resolve.ts:11` — hardcoded label used when no soul source is set
   - `packages/crm/src/components/layout/dashboard-topbar.tsx` — page-title resolver now reads `labels.intakeForm.plural` instead of a hardcoded "Intake Forms" string (2 call sites: `/forms` and `/forms/*`)
   - Net effect: any operator anywhere in the product now sees "Lead Form"/"Lead Forms" instead of "Intake Form"/"Intake Forms" — this was a plan gap caught mid-wave (SH-T6b) and is now complete across all four resolution paths + the topbar bonus find.

2. **Dashboard copy rewrites** (`dashboard/page.tsx`) — plain-language rewording done as part of Task 6's A/B split; live for every session type, not conditioned on the flag.

3. **MCP/Claude-Code banner owner-gate** (`dashboard/page.tsx:589-597`, render site `:1311`) — the developer-tooling banner ("use Seldon directly from Claude Code with our MCP + Skill") is now hidden for `isClaimedOwner` sessions (a claimed workspace's actual owner), in addition to the pre-existing operator-session hide. This banner previously showed to claimed owners too; now it only shows to SF builders/agency operators who have a real relationship with the MCP tooling. This gate is unconditional — it does not check `SF_SIMPLE_HOME`.

4. **`/settings/features` page is reachable regardless of the flag.** It is not itself gated by `isSimpleHomeOn` — an operator (or a curious owner) can navigate to `/settings/features` today, flag off, and see a toggle list. This is harmless: `readEnabledModules` returns `null` for any org with no `settings.surface.modules` key, so the page renders the "You're seeing everything" grandfathered banner and every toggle is "On." Toggling one *does* write `settings.surface.modules` via `setModuleEnabled` — a real DB write, flag-independent. See "Copilot tools" below for why this write is still inert while the flag is off.

5. **Copilot tools `enable_module` / `disable_module` / `pin_card` are registered unconditionally** (`packages/crm/src/lib/agents/copilot/tools.ts`) — the copilot can call them and they will actually write `settings.surface.modules` / `settings.surface.pinned` via the same `setModuleEnabled`/`setPinned` helpers `/settings/features` uses, whether or not `SF_SIMPLE_HOME=1`. **This is deliberately not the same as "flag-gated"**: the write path is live now; only the *read* path (nav filter, dashboard section gating, command bar) is flag-gated. Concretely: if an operator asks the copilot to "turn off Money" today (flag off), the write succeeds and `settings.surface.modules` is materialized on that org — but `nav-config.ts`'s filter and `dashboard/page.tsx`'s `simplified` derivation both pass `enabledModules: null` / `surfaceModules: null` unconditionally when `isSimpleHomeOn()` is false, so nothing in the rendered nav or dashboard changes. The written surface state sits dormant until the flag flips on for that org.

None of the above touch Stripe call sites, add dependencies, or change org-scoping.

## Smoke checklist (run after flipping `SF_SIMPLE_HOME=1` in a preview/staging env)

- [ ] **Fresh claim → 4-item nav.** Claim a brand-new `/try` build. Confirm `link-owner/route.ts`'s `writeMinimalSurface` fires (`settings.surface.modules = ["home","website","bookings","customers"]`) and the sidebar shows exactly those 4 items (plus always-on Home/Settings).
- [ ] **Command bar mounts + auto-opens once with 3 chips.** On that same fresh claim's first dashboard visit, the command bar should be visible (replacing/augmenting the SeldonChat launcher per `hideLauncher={simpleHomeOn}`) and auto-open exactly once with the 3 chips ("Change my colors", "Update my business hours", "Book a test appointment"). Reload — it should not auto-open again (`chatIntroSeen` flips via `markChatIntroSeenAction`).
- [ ] **"Turn on invoicing" via chat → Money appears in nav.** From the command bar or SeldonChat, ask to turn on invoicing/Money. Confirm the `enable_module` tool fires, the plain-language read-back is grade-6 ("Money is now in your sidebar — invoices and payments."), and the nav updates on next render to include Money.
- [ ] **`/settings/features` toggles, including blocked-reason rendering.** Manually visit `/settings/features` on the same org. Confirm: (a) all 10 modules list with plain-language label/description, (b) toggling Money/Agents off while there's an active subscription/deployment shows the verbatim blocked reason via the `?blocked=` redirect param, (c) Home has no toggle (always-on).
- [ ] **Grandfathered org sees zero change.** Pick an existing pre-wave org (no `settings.surface` key). Confirm nav shows everything (no filtering), dashboard shows every section (`simplified` is false because `surfaceModules` is `null` even with the flag on), and `/settings/features` shows the "You're seeing everything" banner with every toggle "On."
- [ ] **Flag-off is byte-identical.** With `SF_SIMPLE_HOME` unset/any-non-"1" value, confirm: nav filter receives `null` (no filtering) for every org; dashboard `simplified` is always `false` (every section renders as before); CommandBar does not mount; SeldonChat's launcher bubble is unchanged (`hideLauncher` is `false`); the claim flow does not call `writeMinimalSurface`. This was verified statically in Task 9 (see full report) — the smoke pass should spot-check it live in case a follow-on PR regresses one of these gates.

## Known follow-ups from the ledger (final-sweep minors — not fixed in this task, tracked here)

- **`isSimpleHomeOn` trim alignment** (SH-T1 minor): add `.trim()` to match `isWinLadderOn`'s contract, plus a spec case, so stray whitespace in the env value can't silently keep the surface dark.
- **`parseSeldonChatOpenDetail` extraction** (SH-T7 final-sweep): the command-bar → SeldonChat open-event payload parsing is currently inline; extract to a pure, independently testable function.
- **`layout.tsx` settings-cast** (SH-T7 final-sweep, `layout.tsx:161-167`): the ad-hoc `{ surface?: { chatIntroSeen?: boolean } }` inline cast on `activeOrg?.settings` should be replaced with the shared `SurfaceSettings` type already defined in `surface.ts`.
- **`setModuleEnabled` lost-update race** (SH-T2 minor): the write is a whole-array recompute (read-modify-write), not a single atomic SQL update — acceptable for the current single-operator-toggling-their-own-org use case, but two concurrent toggles (e.g. operator + copilot racing) could lose one write. Noted honestly, not fixed.
- **KPI "any-real-signal" heuristic** (SH-T6 minor): the `activeEngagements`-based decision for whether to show the synthetic/zero-data revenue bar is a judgment call, flag-on only. Worth revisiting with real usage data post-flip.
- **Pinned ordering not yet consumed by Home** (Task 8 v1 scope, self-review gap): `setPinned` stores `settings.surface.pinned` and the `pin_card` tool's read-back is honest about this ("saved — pinned sections will lead your Home page") but nothing on the Home page actually reorders by `pinned` yet. This is an explicit fast-follow, not a bug — the write path is real and tested, only the Home-page consumption is deferred to a later wave.
- **Agency pre-shaping** (self-review gap, out-of-scope): agencies deploying the module set to multiple clients at once (batch pre-shaping the default surface) is not covered by this wave; every fresh claim goes through the same single-org `DEFAULT_FRESH_MODULES` path today.

## Risks

- **The grandfather invariant is the one-way door.** Every existing org has no `settings.surface` key and must read as `null` (full menu, `simplified: false`) forever unless an operator/agent explicitly toggles a module. If a future change ever causes `readEnabledModules` to return a non-null default for orgs that never had `settings.surface` written, every pre-wave org's nav/dashboard changes silently on next render — with no way to distinguish "org opted into simple-home" from "org was just never migrated." **Verify this invariant holds (spot-check a real pre-wave production org's rendered nav) before flipping the flag in production**, not just in the unit tests (which do cover it — `nav-config.spec.ts`'s hardcoded `baselineGroups` literal — but a live spot-check is cheap insurance for a one-way door).
- **Guard correctness for Money/Agents disable.** `canDisableModule`'s guards (`active_subscription`, `active_deployment`) rely on `workspaceHasPaidTier` and a deployments-table check respectively (both reused from existing resolvers, not new logic per SH-T2/T2b) — but this is the only place in the wave where a wrong guard could let an owner hide a module while state exists underneath it (e.g. an unpaid invoice sitting in a hidden Money section). Not exercised by the smoke checklist above beyond a manual spot-check; worth a dedicated guard test if incidents surface post-flip.
- **Copilot tools write real state ahead of the flag flip** (see "What ships live" #5 above) — not a correctness risk (writes are org-scoped, inert while the flag is off) but a operational one: any org that has a copilot conversation touching "turn off invoicing" between merge and the eventual flag flip will have a materialized (possibly stale-relative-to-intent) `settings.surface.modules` waiting for them the moment the flag turns on, rather than starting from the grandfathered `null` state. Low likelihood (these tools are new and undiscoverable until surfaced in `cap.ts`'s tool-picker guidance) but worth knowing before flipping.

## Gate results (Task 9, this run)

- Unit suite: **7188 pass / 81 fail / 7282 total** (via `node scripts/run-unit-tests.js`) — fail count matches the ledgered ~81 pre-existing baseline exactly; zero failing spec touches a wave file (workspace/modules, workspace/surface, nav-config, settings/features, dashboard, command-bar, seldon-chat, copilot tools, or soul labels).
- `cd packages/crm && npx tsc --noEmit`: **zero errors.**
- `pnpm check:use-server` (run from `packages/crm`): **pass** — "All 'use server' files export only async functions / types."
- `npx next build` (Turbopack, from `packages/crm`): **exit 0**, 438 static pages generated. One warning present, both pre-existing and unrelated to the wave (Turbopack NFT-trace warning on `next.config.ts` → `soul-compiler/blocks.ts` → `generate-landing-page/route.ts`, a workspace-root inference notice — no wave file in that trace).
- Flag-off proof: 4 call sites of `isSimpleHomeOn` (definition + `dashboard/page.tsx` + `layout.tsx` + `link-owner/route.ts`), all traced above — nav gets `null`, dashboard `simplified` stays `false`, CommandBar unmounts, `hideLauncher` is `false`, claim write is skipped.
- `git diff 079a45ba..872582ec --stat`: 24 files, every file classified (flag-gated / live-copy-truth / test / pure-lib-inert-by-consequence) — zero unclassifiable findings. Full table in `.superpowers/sdd/task-9-sh-gate-report.md`.
- Dependency check: `git diff 079a45ba..872582ec -- package.json pnpm-lock.yaml packages/crm/package.json` → **empty diff**, zero dependency changes.
- Rendered-string grep proofs: zero rendered `BLOCK.md`/`Newly installed blocks`/`Your Blocks`/`Hidden blocks` in `dashboard/page.tsx` (all 6 hits are code comments, not JSX); zero `Intake Form` remaining in soul defaults/resolve/topbar (all 4 sites converted to `Lead Form`/`labels.intakeForm.plural`).
