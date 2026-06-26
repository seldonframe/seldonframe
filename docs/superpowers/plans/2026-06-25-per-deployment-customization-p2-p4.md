# Per-Deployment Customization — P2–P4 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkboxes track steps.

**Goal:** Finish the white-label tenant model: clients customize **prompt/FAQ/services** too (P2), edit via **portal + marketplace** (P3), and the **agents list** makes "build once, deploy many" obvious (P4).

**Built on P1 (shipped):** `src/lib/agents/persona/deployment-customization.ts` (`DeploymentCustomization { greeting?, voiceId?, businessInfo? }`, `fillPlaceholders`, `resolveDeploymentPersona`), `deployments.customization` jsonb, voice+chat resolve the persona, `setDeploymentCustomizationAction`, `DeploymentCustomizationEditor` on the Clients card.

**Conventions:** verify `pnpm -C packages/crm typecheck` (baseline 0 — RE-RUN it yourself, don't trust cached), `bash packages/crm/scripts/check-use-server.sh src`, `pnpm -C packages/crm build` (REAL build). Commit per task; push per phase.

---

## PHASE P2 — prompt/FAQ/services overrides + runtime consumption + template relabel

### Task P2.1: Extend the type + resolver (pure, TDD)
**Files:** `src/lib/agents/persona/deployment-customization.ts`; `tests/unit/agents/persona/deployment-customization.spec.ts`.
- [ ] Extend `DeploymentCustomization` with `script?: string`, `faq?: { q: string; a: string }[]`, `services?: { name: string; description?: string; price?: string }[]`. Extend `resolveDeploymentPersona` to return `prompt` = `customization.script` override ?? placeholder-filled `templateScript` (already partly there — now honor the explicit `script` override first), plus `faq` = `customization.faq ?? templateFaq` and `services` = `customization.services ?? templateServices` (override-wins, no merge). Add `templateFaq`/`templateServices` to the args. Keep all existing behavior.
- [ ] Tests: `script` override wins over template; `faq`/`services` override-wins; absent → template; placeholder-fill unchanged. Verify (the persona spec passes, typecheck 0). Commit.

### Task P2.2: Consume the resolved persona in chat/SMS/email
**Files:** `src/lib/agents/channels/run-channel-turn.ts` + `executeTurn` (grep it). Test: extend `run-channel-turn.spec.ts`.
- [ ] P1 threads `persona` to `executeTurn` but the runtime doesn't apply it yet. Make `executeTurn` (or the conversation system-prompt builder it calls) prepend/override the effective `greeting` + `prompt` (+ inject `faq`/`services` into the grounding) when `input.persona` is present, for the deployment-resolved client agent. Keep workspace agents byte-for-byte (no persona → unchanged). Read how the chat system prompt is currently assembled and splice the persona in at the same seam the voice path uses (`composeVoicePersona` analog).
- [ ] Test: a chat turn with `persona.greeting`/`prompt` → the assembled system prompt reflects them (assert via the injected fake or the prompt string); no persona → unchanged. Verify. Commit.

### Task P2.3: Editor — add script/FAQ/services fields
**Files:** `src/app/(dashboard)/studio/clients/deployment-customization-editor.tsx`.
- [ ] Add to the editor: **Script** (textarea, "leave blank to use the template default; `{placeholders}` auto-fill"), **FAQ** (add/remove q/a rows), **Services** (add/remove name/description rows). Persist under `customization.{script,faq,services}` via the existing `setDeploymentCustomizationAction`. Match the existing editor chrome. Verify (typecheck + check-use-server). Commit.

### Task P2.4: Template editor — relabel defaults + {placeholder} hints + live preview
**Files:** `src/app/(dashboard)/studio/agents/[id]/editor-client.tsx`.
- [ ] Relabel the greeting/script/FAQ/voice fields as **"Default — each client customizes this on deployment"** (sub-label/help text). Add a `{business_name}`/`{services}`/`{hours}` placeholder hint near the greeting + script. Add a small **live preview** that runs `fillPlaceholders` on the greeting with a sample business name ("Acme Plumbing") so the builder sees the filled result. Verify. Commit. **Push P2.**

---

## PHASE P3 — client-portal + marketplace customization surfaces

### Task P3.1: Deployment-scoped customize link (tokenized, no workspace needed)
**Files:** new `src/lib/deployments/customize-link.ts` (mint/verify a signed token over `deploymentId`), new route `src/app/(public)/customize/[token]/page.tsx` + a client action. Test: token mint/verify (pure, TDD).
- [ ] The org-portal needs a client workspace deployments don't have, so add a **deployment-scoped** signed token (HMAC over `deploymentId`, mirror the rental-key / portal-magic-link signing already in the repo — grep). A tokenized public page `/customize/[token]` loads the deployment (verify token → deploymentId → load) and renders the SAME `DeploymentCustomizationEditor` + `BookingPolicyEditor` in a minimal branded shell; Save calls a token-guarded variant of `setDeploymentCustomizationAction`/`setBookingPolicyAction` (the token authorizes the specific deployment — no session). A "Copy customize link" button on the Clients card mints + copies the URL.
- [ ] Tests: token round-trips; a forged/expired token → rejected. Verify (tests + typecheck + check-use-server + build). Commit.

### Task P3.2: Marketplace-buyer setup step
**Files:** the marketplace install/rent flow (grep `install`/`agent-listings`/`/marketplace`). 
- [ ] After a buyer installs/rents an agent that produces a deployment, route them to the customize surface (reuse P3.1's page or an inline step) so they set greeting/voice/business-info/booking before going live. Verify. Commit. **Push P3.**

---

## PHASE P4 — agents-list UX clarity

### Task P4.1: "Build once, deploy many" framing + per-template client list
**Files:** `src/app/(dashboard)/studio/agents/*` (the Agents tab list).
- [ ] Update the Agents-tab copy/subhead to make the product-vs-instance model explicit ("Build a reusable agent once — deploy it to as many clients as you like; each client customizes their own copy."). Under each template row, surface the **deployment count + the client names** (e.g. "2 clients: Max ABC, Seldon Testing") so it's obvious a single template serves multiple customized clients — killing the "why are there 3 identical agents" confusion. (Data: list deployments per `agentTemplateId`.) Verify (typecheck + check-use-server + build). Commit. **Push P4.**

---

## Self-Review
- **Spec coverage:** P2 overrides+consumption+template-relabel (P2.1–P2.4) · P3 portal+marketplace (P3.1–P3.2) · P4 agents-list clarity (P4.1). Matches spec phasing lines 70–72. ✓
- **Type consistency:** `DeploymentCustomization.{script,faq,services}`, `resolveDeploymentPersona` returns `{greeting,prompt,voiceId,businessName,faq,services}`, `customize-link` token. ✓
- **Placeholders:** none — each task names files + contracts; implementers TDD the pure pieces and read the codebase for wiring. ✓
- **Non-goals:** per-field locking + versioning stay out (spec lines 76–77). ✓
