# Per-Deployment Agent Customization — P1 (Agency editor + persona runtime) Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** One template → each client customizes their own deployment's greeting, voice, and business info; the runtime resolves the effective persona (override OR `{placeholder}`-filled), which also kills the literal "BUSINESS NAME" / "TIME OF DAY" leak.

**Architecture:** A pure `deployment-customization.ts` owns the `DeploymentCustomization` type, `fillPlaceholders`, and `resolveDeploymentPersona(template, deployment)`. The voice + chat persona builders call it so the agent speaks AS the client. The agency edits `deployments.customization` via `setDeploymentCustomizationAction` + a `DeploymentCustomizationEditor` on the Clients card. Booking rules already live in `deployments.booking_policy` (P1 shipped); this is the parallel "everything-else" layer.

**Tech Stack:** Next.js 16 / React 19, Drizzle + Neon (jsonb additive), `node --import tsx --test`.

**Spec:** `docs/superpowers/specs/2026-06-25-per-deployment-agent-customization-design.md`

**Conventions:** verify with `pnpm -C packages/crm typecheck` (baseline 0), `bash packages/crm/scripts/check-use-server.sh src`, `pnpm -C packages/crm build` (REAL build — `ignoreBuildErrors` means tsc is separate). Commit after each task; push once at the end.

---

## File Structure
- **Create** `packages/crm/src/lib/agents/persona/deployment-customization.ts` — `DeploymentCustomization` type, `fillPlaceholders`, `resolveDeploymentPersona`. Pure.
- **Create** `packages/crm/tests/unit/agents/persona/deployment-customization.spec.ts`.
- **Modify** `packages/crm/src/db/schema/deployments.ts` — `customization` jsonb + migration.
- **Modify** voice (`src/lib/agents/voice/deployment-voice.ts`) + chat (`src/lib/agents/channels/run-channel-turn.ts`) persona builders.
- **Modify** `src/lib/deployments/store.ts` (`DeploymentPatch.customization`) + `actions.ts` (`setDeploymentCustomizationAction`).
- **Create** `packages/crm/src/app/(dashboard)/studio/clients/deployment-customization-editor.tsx`; render on the Clients card.

---

### Task 1: `deployment-customization.ts` — types + `fillPlaceholders` + `resolveDeploymentPersona` (pure, TDD)

**Files:** Create `src/lib/agents/persona/deployment-customization.ts` + `tests/unit/agents/persona/deployment-customization.spec.ts`.

Contract:
```ts
export type DeploymentBusinessInfo = { name?: string; hours?: string; address?: string; phone?: string; email?: string };
export type DeploymentCustomization = {
  greeting?: string;            // full override of the spoken greeting
  voiceId?: string;             // TTS voice override
  businessInfo?: DeploymentBusinessInfo;
};
/** Replace {token} in `text` from `vars` (case-insensitive snake/space tokens:
 *  {business_name}, {business name}). Unknown/blank tokens are removed cleanly
 *  (collapse leftover double spaces / dangling punctuation) — never read a raw
 *  {token} aloud. */
export function fillPlaceholders(text: string, vars: Record<string, string | undefined>): string;
/** Resolve the EFFECTIVE persona the runtime uses. greeting = deployment override
 *  ?? fillPlaceholders(template.greeting, vars); prompt = fillPlaceholders(
 *  template.script, vars); voiceId = deployment ?? template; businessName etc.
 *  from deployment.businessInfo ?? clientContext. `vars` includes business_name,
 *  hours, address, phone, email, time_of_day(optional pass-through). */
export function resolveDeploymentPersona(args: {
  templateGreeting?: string | null; templateScript?: string | null; templateVoiceId?: string | null;
  customization?: DeploymentCustomization | null; clientName?: string | null;
}): { greeting: string | null; prompt: string | null; voiceId: string | null; businessName: string | null };
```

- [ ] **Step 1 (failing tests):** `fillPlaceholders("Thanks for calling {business_name}!", {business_name:"Max ABC"})` → "Thanks for calling Max ABC!"; with `{}` → "Thanks for calling!" (token + surrounding artifact removed, no literal "{business_name}"). `resolveDeploymentPersona`: deployment.greeting override wins; else template greeting placeholder-filled; voiceId precedence deployment→template; businessName = customization.businessInfo.name ?? clientName. A template script ending "...have a great {time_of_day}" with no time var → the token is dropped (no literal leak).
- [ ] **Step 2:** run → fails. **Step 3:** implement (pure; tolerant token regex `\{\s*([\w ]+?)\s*\}`; normalize key to lower snake; drop unknown; tidy whitespace/punctuation). **Step 4:** pass. **Step 5:** commit `feat(persona): deployment-customization resolver + fillPlaceholders (pure, TDD)`.

---

### Task 2: Schema — `deployments.customization` + additive migration

**Files:** `src/db/schema/deployments.ts`; new `drizzle/00NN_*.sql` + journal.

- [ ] Add `customization: jsonb("customization").$type<import("@/lib/agents/persona/deployment-customization").DeploymentCustomization>()` (nullable). Generate the additive migration via `pnpm drizzle-kit generate` (confirm ADD COLUMN only; journal pure-append). typecheck 0. Commit `feat(persona): deployments.customization jsonb (additive)`.

---

### Task 3: Apply the resolved persona in voice + chat

**Files:** `src/lib/agents/voice/deployment-voice.ts`, `src/lib/agents/channels/run-channel-turn.ts`. Test: extend the voice persona spec.

- [ ] Read how each builds the agent greeting / system prompt / voice from the template blueprint + clientContext. Call `resolveDeploymentPersona({ templateGreeting, templateScript, templateVoiceId, customization: deployment.customization, clientName: deployment.clientName })` and use its `greeting`/`prompt`/`voiceId` for the agent (fall back to today's values when null). This is what fixes the "BUSINESS NAME" leak (the script's `{…}` tokens get filled/dropped). Thread `deployment.customization` where the deployment row already flows (add to the voice/channel `Pick<Deployment, …>` if needed). 
- [ ] Test: a deployment with `customization.greeting` → the built persona uses it; a template greeting `"...{business_name}..."` + `customization.businessInfo.name` → filled; no literal `{` survives. Verify (tests + typecheck). Commit `feat(persona): voice+chat use resolveDeploymentPersona (fixes placeholder leak)`.

---

### Task 4: `setDeploymentCustomizationAction` (org-guarded)

**Files:** `src/lib/deployments/store.ts` (`DeploymentPatch.customization?`), `src/lib/deployments/actions.ts`. Test: DI spec like `set-booking-policy.spec.ts`.

- [ ] Extend `DeploymentPatch` with `customization?: DeploymentCustomization | null`; ensure `updateDeployment` persists it. Add `setDeploymentCustomizationAction({ deploymentId, customization }, _deps?)` — `assertWritable` → `getOrgId` → org-guard (`builderOrgId===orgId`) → `updateDeployment` → `revalidatePath("/studio/clients")`. "use server", async-only. Test unauthorized/not_found/happy. Verify (tests + typecheck + check-use-server). Commit `feat(persona): setDeploymentCustomizationAction (org-guarded)`.

---

### Task 5: `DeploymentCustomizationEditor` on the Clients card

**Files:** Create `src/app/(dashboard)/studio/clients/deployment-customization-editor.tsx`; render in `activate-form.tsx` (a collapsible "Agent customization" section next to "Booking rules").

- [ ] Controlled fields: **Greeting** (textarea, placeholder hint "leave blank to use the template's default; `{business_name}` auto-fills"), **Voice** (select from the available TTS voices — read the existing voice list the template editor uses), **Business info** (name, hours, address, phone, email). Save → `setDeploymentCustomizationAction`; optimistic + transient "Saved ✓" (mirror BookingPolicyEditor). Seed from `deployment.customization`. Render only for deployments whose agent speaks (voice/chat). House `crm-*` styling. Verify (typecheck + check-use-server). Commit `feat(persona): DeploymentCustomizationEditor on the Studio client card`.

---

### Task 6: Verify + report

- [ ] `pnpm -C packages/crm typecheck` (report count) · the persona + deployment specs pass · `check-use-server` clean · **`pnpm build` exit 0**. Push once. Surface the manual smoke: edit a client's greeting/voice → call → confirm the agent greets with the custom greeting in the chosen voice, and the closing line no longer reads a literal placeholder.

---

## Self-Review
**Spec coverage (P1 slice):** customization type + schema (T1,T2) · placeholder-fill + persona resolution incl. leak fix (T1,T3) · agency editor (T4,T5) · verify (T6). Portal + marketplace surfaces + prompt/FAQ/services overrides are later phases (out of this plan). ✓
**Type consistency:** `DeploymentCustomization`, `resolveDeploymentPersona`, `fillPlaceholders`, `deployments.customization`, `DeploymentPatch.customization`, `setDeploymentCustomizationAction` used consistently. ✓
**Placeholders:** none — each task has concrete contracts + tests. ✓
