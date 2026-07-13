# Record v3 — one slot, one conversation (+ in-place BYOK modal)

**Date:** 2026-07-12 · **Branch:** `feat/record-redesign` (off origin/main)
**Design source:** `docs/design/record-to-agent-handoff-v2/Record.dc.html` (Claude design export — Max attached the same zip)
**Driving feedback (Max, 2026-07-12 mobile test):**
1. Bring the live /record page closer to the Claude design.
2. Mobile: center the content.
3. Rotating/alternating status copy while the user waits.
4. "Insanely intuitive": ONE capture slot (record or upload), then Seldon asks questions and *prompts* for edge cases — not 6 empty boxes up front.
5. An animated SVG of an agent loop so a first-time visitor understands what they're building.
6. BUG: at the eval/keys step he was redirected to "Spin up a client workspace" (`/clients/new`). Keys must be a popup (like the Composio connect popup) — never leave the page.

## Ground truth (verified in code, origin/main)

- `/record` UI: `packages/crm/src/app/(public)/record/` — `page.tsx` (server, 404 unless `SF_RECORD_TO_AGENT=1`), `record-client.tsx` (island), `recorder-machine.ts` (phases `landing→capturing→recap→approved`; slot statuses `empty|recording|uploading|compiling|traced|failed`; only ONE slot busy at a time), `record-ui/{slot-card,step-strip,recap-panel,restored-banner,tiers}.tsx`.
- Slots: `MAX_RECORDINGS_PER_SESSION = 6` (`lib/recordings/policy.ts:34`); `initialRecorderState()` builds 6 slots (`recorder-machine.ts:151`). The v2 design mockup itself still shows a 6-slot grid — v3 deliberately goes past it per feedback #4.
- Mobile: `getDisplayMedia` feature-detect (`record-client.tsx:125-134`); mobile = upload + summary textarea. Session restore: localStorage `sf-record-session` + `GET /api/v1/recordings/session`; post-claim `?claimed=1&session=` rehydrates to phase `approved`.
- Keys redirect seam: `needs_byok` error renders a **Link to `/settings/integrations/llm`** in `studio/agents/[id]/editor-client.tsx:463-474`, `test-client.tsx:183`, `lifecycle/run-evals.tsx:174`.
- The bounce: middleware matcher (`proxy.ts:909+`) matches `/settings/:path*` but NOT `/studio/*`; onboarding gate (`proxy.ts:655-664`) 307s any authed `soulCompleted=false` account → `/clients/new`. Record-claimers never get `markOperatorOnboarded` (only `/claim-build` stamps it — `link-owner/route.ts`), so the keys link always bounces them.
- Reusable seams for the modal: `components/ui/dialog.tsx` (base-ui Dialog), `components/integrations/anthropic-key-field.tsx` (extracted primitive), `saveLlmKeyAction` (`lib/integrations/llm/actions.ts` — needs session org via `getOrgId()`; record-claimers are authed with an org after claim, so it works — verify in build), Composio popup pattern (`lifecycle/connected-stage.tsx:54-252`, postMessage + 2s poll fallback) as the interaction precedent.

## Scope (4 slices)

### S1 — Single-slot capture UI (the core redesign)
- Replace the 6-card grid with **one primary capture card**: big Record button (desktop) / big "Upload a screen recording" button (mobile), "or upload a file" secondary. Copy from the design: "One normal, successful run — start to finish, talking out loud."
- The state machine keeps its 6 slots (no API/machine changes) — the UI just renders slot[0] until it's traced.
- After a slot traces, **Seldon prompts for edge cases inside the recap panel** ("Anything ever go differently? Record that too — edge cases make the agent trustworthy") with a compact "+ Record an edge case" / "upload" affordance that targets the next empty slot. Traced recordings render as a compact stacked list (thumbnail + label + steps), not a grid of boxes.
- Keep: step strip (3 steps), restored banner, honest-badge recap, Ask-Seldon chat, claim CTA — all restyled to match `Record.dc.html` (Geist, `#0B0F0E` page, `#0F1413` cards, teal `#14B8A6`, exact hero/header/footer treatment).

### S2 — Agent-loop SVG explainer + rotating wait copy
- **SVG explainer**: a small CSS-animated (no-JS) diagram under the hero — the agent loop: **Trigger → Watch → Decide → Act → Check with you**, a dot traveling the loop, one node highlighted at a time. Written as an inline React SVG component (`record-ui/agent-loop-diagram.tsx`), theme colors from the design. Purpose: a visitor who doesn't know what "an agent" is understands in 5 seconds what the recording becomes.
- **Rotating wait copy**: during `uploading`/`compiling`, cycle honest stage-flavored lines every ~2.5s ("Reading your recording…", "Listening to your narration…", "Mapping the steps you took…", "Working out what's safe to automate…"). Component `record-ui/wait-copy.tsx`, driven by slot status — text alternation only, no fake progress claims (progress bar stays wired to real upload/compile progress).

### S3 — Mobile centering + polish
- Mobile (<720px): center hero text + step strip, single column, capture card full-width, sticky bottom CTA when recap is ready. Desktop stays left-aligned per the design.

### S4 — In-place BYOK modal + onboarding-stamp root fix
- New `components/integrations/llm-key-dialog.tsx`: Dialog wrapping `AnthropicKeyField` + `saveLlmKeyAction`; on success, closes and invokes an `onSaved` callback so the caller re-runs the blocked action (refine / test / evals).
- Replace all three `needs_byok` **links** with the modal (editor-client, test-client, run-evals; Connected stage if it has a keys ask). No navigation, same page — matching the Composio connect popup UX.
- **Root fix:** when a claimed record session compiles (`compile-agent` route, claim path), stamp `markOperatorOnboarded` — the same self-closing exception `/claim-build` already uses. Record-claimers stop being permanent `soulCompleted=false` accounts, so ANY future dashboard link stops bouncing to `/clients/new`.
- Guard: `saveLlmKeyAction` must fail-soft with a clear in-modal error if the session somehow has no org (no silent pass — Optimistic Path rule).

## Non-goals
- No changes to capture/upload/trace pipeline, recordings API contracts, DB schema, or the state machine's transition semantics.
- No changes to the lifecycle ladder stages themselves.
- The 6-recording cap stays.

## Verification
- Unit: recorder-machine untouched (regression only); new tests for single-slot render states, edge-case prompt appearing post-trace, wait-copy rotation (timer mock), LlmKeyDialog save/error paths, compile-agent claim path stamping onboarded.
- `/verify-build` in the worktree (maker ≠ checker), then vision-verify against `Record.dc.html` for the visual gate (desktop + mobile viewports).
- Live smoke post-deploy: /record renders single slot; authed `needs_byok` opens modal (no 307); record-claimer can reach /settings without bouncing.
