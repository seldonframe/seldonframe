# Magic First-Run — First Workspace on the Platform Key (BYOK = progressive) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Restore the locked-vision zero-friction first run. Signup does NOT require a key; the **first workspace builds on SeldonFrame's platform key** (the "watch my whole business appear" magic). BYOK is prompted only when the builder goes to **build/run agents in the Studio** or **create a 2nd workspace** — the unbounded-COGS, scaled moments.

**Architecture (from recon):** Workspace creation **already** falls back to the platform key (`create-from-url`/`create-from-paste` resolve BYOK → `ANTHROPIC_API_KEY` → null; `getAIClient` has the same fallback + an `included`/`metered` allowance). The only blocker is the **signup `connect-ai` gate** (`(auth)/signup/connect-ai/page.tsx:73-75` hard-redirects to the BYOK form). A `skipConnectAiAction` exists (`connect-ai/actions.ts:178`) but isn't wired. So: make the step optional, and gate Studio agent-building + 2nd-workspace on BYOK with a friendly prompt.

**Tech Stack:** Next.js 16 / React 19. Conventions: tests `cd packages/crm && node --import tsx --test <files>`; tsc `…/tsc -p tsconfig.json --noEmit` (0 NEW; ~10 baseline); `bash scripts/check-use-server.sh src`; TDD where logic; commit per task. No migration.

---

## Task 1: Make signup Connect-AI optional (the magic)

**Files:** Modify `packages/crm/src/app/(auth)/signup/connect-ai/page.tsx` + (wire) `packages/crm/src/app/(auth)/signup/connect-ai/actions.ts` (`skipConnectAiAction`).

- [ ] **Step 1: Recon-confirm** `skipConnectAiAction` (`actions.ts:178`) — what it does (mark onboarding step done? just redirect?). If it doesn't exist or doesn't route, add a minimal `skipConnectAiAction({ next })` that marks the step skipped (no key stored) + returns the redirect target.
- [ ] **Step 2:** In `page.tsx`: keep the BYOK form, but **remove the hard requirement** — render a clear secondary **"Skip — start free →"** action (wired to `skipConnectAiAction`, routing to `next` = `/clients/new`). The existing "Save key and continue" path stays. **Reword the copy:** heading "Connect your AI provider · *optional*"; subhead "Your **first workspace is free on us** — paste a site and watch it build. Add your own key when you're ready to *run* your agents or add more client workspaces." Keep the "encrypted / SF can't read your keys" reassurance.
- [ ] **Step 3:** Confirm no other guard blocks `/clients/new` without a key (the onboarding shell / middleware). If a guard redirects keyless users back to connect-ai, relax it to allow the first workspace.
- [ ] **Step 4: tsc** 0 new; `check-use-server` clean. **Commit** `feat(signup): first workspace free on the platform key — Connect-AI is now optional`.

---

## Task 2: BYOK prompt at the build/run + 2nd-workspace moments

**Files:** Modify `packages/crm/src/lib/agent-templates/actions.ts` (`generateAgentDraftAction`), `packages/crm/src/lib/agent-templates/test-actions.ts` (`testAgentTemplateTurn`); the workspace-limit message (`lib/billing/limits.ts`); the Studio UI prompt.

- [ ] **Step 1:** Gate **Studio agent BUILDING** on BYOK (the unbounded-COGS work): in `generateAgentDraftAction` + `testAgentTemplateTurn`, change the guard from `!client` to `mode !== "byok"` → return `{ ok:false, error:"needs_byok" }` with a message "Add your Anthropic key in Settings to build + test agents — your first workspace stays free." (Keep `getAIClient`'s platform fallback for **workspace creation + the auto-created website chatbot's included allowance** — the first-workspace magic — UNCHANGED.)
- [ ] **Step 2:** In the Studio editor / test panel UI, render the `needs_byok` result as a friendly inline prompt with a **"Add your key →"** link to Settings → Integrations → LLM (not a raw error).
- [ ] **Step 3:** Reword the **2nd-workspace** limit message (`limits.ts`) to "Your first workspace is free. Add your Anthropic key to spin up client workspaces." (the cap already = 1).
- [ ] **Step 4: Tests** (DI'd): `generateAgentDraftAction`/`testAgentTemplateTurn` with `mode:"included"` (platform, no BYOK) → `needs_byok`; with `mode:"byok"` → proceeds. (Cover at the layer the repo tests these — note if structural.) **Commit** `feat(studio): BYOK prompted to build/run agents + add workspaces (first workspace stays free)`.

---

## Task 3: Verify
- [ ] Suites green; `tsc` 0 new; `check-use-server` clean; no migration.
- [ ] **Report:** the new keyless first-run path (signup → skip → `/clients/new` → workspace builds on the platform key), what stays free (creation + the embedded chatbot's included allowance) vs BYOK-gated (Studio agent build/test/deploy + 2nd workspace), the regression statement (the existing save-key path + workspace creation untouched), the new-test count, and the honest gap — live gate: sign up fresh with NO key → confirm a workspace builds → go to the Studio → confirm the friendly "add your key" prompt.

## Self-Review
- Coverage: signup optional (T1) ✓; first workspace on platform key (already works) ✓; BYOK at build/run + 2nd workspace (T2) ✓; the magic (creation + chatbot included) preserved ✓.
- Deferred: a polished "you're on the free platform allowance — N runs left" usage meter (the `includedLimit` exists; surfacing it nicely is a follow-up).
