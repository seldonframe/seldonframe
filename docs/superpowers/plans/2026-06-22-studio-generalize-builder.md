# #3 Generalize the Builder — Studio Surfaces + MCP Tool-Picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Expose #1 (surfaces) + #2 (MCP connectors) to builders in the Agents Studio: a "Connectors & Tools" picker (connect Postiz / a BYO-MCP endpoint → discover tools → enable specific ones) + a Surfaces control — and make a Studio-bound connector actually fire (in the template *test* immediately, and on a deployed text agent).

**Architecture (from recon):** The Studio edits `agent_templates`; the runtime (`executeTurn`) reads an `agents` row's `blueprint.connectors`. So: **bind connectors on the TEMPLATE blueprint** (reuse #2's table-agnostic pure helpers), then (a) thread `template.blueprint.connectors` into the **template test** (`stateless-turn`) for the immediate builder proof, and (b) **copy them onto the deployed client agent** at provisioning. Text surfaces (web/SMS/email via `executeTurn`) support MCP; **voice (realtime) does not** — surface that honestly. Runtime + native tool path untouched.

**Tech Stack:** Next.js 16 / React 19, Drizzle/Neon, `node:test` + `tsx`. Conventions: tests `cd packages/crm && node --import tsx --test <files>`; tsc `…/tsc -p tsconfig.json --noEmit` (0 NEW; ~10 `.next/types` baseline); `bash scripts/check-use-server.sh src`; DI in unit tests; TDD; commit per task. **No migration** (blueprint is jsonb). Reuse #2's `lib/agents/mcp/{bind,connectors,client}.ts` pure helpers — do NOT duplicate them.

## Reused from #2 (do not rebuild)
`buildConnectorBinding`, `mergeConnectorBinding`, `withRediscoveredTools`, `removeConnectorBinding` (`lib/agents/mcp/bind.ts`); `VETTED_CONNECTORS`, `ConnectorBinding`, `connectorBindingSchema` (`lib/agents/mcp/connectors.ts`); `createMcpClient` (`lib/agents/mcp/client.ts`); `getToolsForCapabilities(..., {connectors})` already reads connectors at `runtime.ts:228-231`.

---

## Task 1: `connectors` in the template blueprint patch (TDD)

**Files:** Modify `packages/crm/src/lib/agent-templates/store.ts` (`TemplateBlueprintPatch` ~:221, `buildDefaultTemplateBlueprint` ~:154), the template patch zod schema (`agent-templates/schema.ts`); Test the schema.

- [ ] **Step 1:** Add `connectors?: ConnectorBinding[]` to `TemplateBlueprintPatch` + `connectors: []` to `buildDefaultTemplateBlueprint`. In the template patch zod (`TemplateBlueprintPatchSchema`) add `connectors: connectorBindingsSchema.optional()` (reuse #2's schema). **Step 2:** Test: the patch schema accepts a valid vetted + byo connectors array + rejects a non-HTTPS byo endpoint. **Step 3: Commit** `feat(studio): connectors in the template blueprint patch`.

---

## Task 2: Template-scoped MCP bind/unbind/refresh actions (TDD)

**Files:** Create `packages/crm/src/lib/agent-templates/mcp-actions.ts`; Test `…/template-mcp.spec.ts`.

- [ ] **Step 1: Recon:** how `agent_templates` blueprints are loaded/saved — `getAgentTemplate(id)` + `saveAgentTemplateBlueprintAction`/the underlying `updateAgentTemplate`. Confirm the org/ownership guard (`builderOrgId === orgId`).

- [ ] **Step 2:** Mirror `lib/agents/mcp/actions.ts` but for templates: `bindTemplateConnectorAction({ templateId, connector, apiKey, enabledTools? })`, `unbindTemplateConnectorAction({ templateId, connectorId })`, `refreshTemplateConnectorAction({ templateId, connectorId })`, and `setTemplateConnectorToolsAction({ templateId, connectorId, enabledTools })` (toggle enables). Each: org-guard; load the template blueprint; reuse `buildConnectorBinding`/`mergeConnectorBinding`/`withRediscoveredTools`/`removeConnectorBinding` (DI'd discover + secret, the SAME `realBindDeps`); persist `connectors` via the template-blueprint save path. The encrypted key uses `storeSecret({ workspaceId: orgId, serviceName })` (shared with the agent path). 

- [ ] **Step 3: Test** the composition (pure/DI layer, per repo convention): vetted Postiz → secret stored + tools discovered + merged onto the template blueprint; byo non-HTTPS rejected; unbind removes it; toggle updates `enabledTools`. The thin `"use server"` wrappers covered structurally. **Step 4: Commit** `feat(studio): template-scoped MCP bind/unbind/refresh/toggle actions`.

---

## Task 3: The "Connectors & Tools" UI in the editor

**Files:** Modify `packages/crm/src/app/(dashboard)/studio/agents/[id]/editor-client.tsx`; pass `blueprint.connectors` + the vetted registry from `page.tsx`.

- [ ] **Step 1:** `page.tsx` — include `connectors: blueprint.connectors ?? []` in the `initialBlueprint` passed to the editor (+ pass `VETTED_CONNECTORS`).

- [ ] **Step 2:** A new card after the **Tools** (native capabilities) card, matching the design system (`.rounded-xl.border.bg-card.p-5`, `text-card-title`, `.crm-button-*`):
  - **Bound connectors list:** each `connectors[]` binding → label (Postiz / "Custom: host"), a tool-count badge, **Refresh** + **Remove** buttons, and an expandable checkbox list of its `tools[]` toggling `enabledTools` (calls `setTemplateConnectorToolsAction`, optimistic + `router.refresh()`).
  - **Add connector:** a small inline form/modal — pick **Postiz** (vetted) or **Custom MCP** (BYO → an `https://…` endpoint field) → an **API key** field → **Connect** → `bindTemplateConnectorAction` → on success refresh. `useTransition` for each call; surface errors inline (the bind action returns `{ok:false,error}`).
  - Help copy: "Connectors give this agent external tools (e.g. Postiz to publish social posts). **Available on chat / SMS / email agents** — voice agents use built-in tools only."
  - Keep `"use client"`; never render or log the API key after submit.

- [ ] **Step 3:** tsc 0 new; `check-use-server` clean; the editor still compiles + the existing cards work. **Commit** `feat(studio): Connectors & Tools picker (bind Postiz / BYO-MCP + per-tool enable)`.

---

## Task 4: Surfaces control + deploy surfaces

**Files:** Modify `editor-client.tsx` (a Surfaces card/badge); confirm `deploy/deploy-client.tsx` `SURFACES` includes the #1 surfaces.

- [ ] **Step 1:** A small **Surfaces** card/badge near the top of the editor showing the agent's surface (Voice / Web chat) derived from `props.surface`, with one line on multi-surface: "This agent also answers SMS + email when deployed." (Surface is template-type-derived + read-only today — present it clearly; don't fake an editable control that the data model can't honor.)

- [ ] **Step 2:** Confirm `deploy-client.tsx` `SURFACES` exposes **sms + email** alongside phone/embed/link (added in #1). If the array is still only `phone|embed|link`, add `sms` + `email` cards so a builder can deploy a text agent. (Verify against the #1 build first.)

- [ ] **Step 3: Commit** `feat(studio): surfaces shown in editor + sms/email in deploy options`.

---

## Task 5: Make Studio-bound connectors fire (test + deployed agent)

**Files:** the template-test path (`lib/agents/.../stateless-turn` caller / `test-actions.ts`); the deploy provisioning (`lib/deployments/provision-client-workspace.ts` or the bridge agent-creation seam) — recon both.

- [ ] **Step 1 (immediate proof — test path):** Recon where the template **test** builds the blueprint for the stateless runner. Ensure `template.blueprint.connectors` is included so a builder who binds Postiz can **Test** the agent and watch it call `postiz__…`. (The stateless runner already accepts a blueprint; thread the connectors through.) Test it.

- [ ] **Step 2 (production flow — deployed agent):** Recon the deployed **text** agent's creation (the bridge: `provisionClientWorkspaceForDeployment` → the client workspace's `slug="default"` agent). After that agent exists, **copy the deploying template's `blueprint.connectors`** onto the client agent's blueprint (load the deployment's `agentTemplateId` → template → merge `connectors` into the agent's blueprint via `updateAgentBlueprint`). Idempotent + soft-fail. So a deployed text agent gets the builder's connectors. (Voice path: NOT wired — realtime doesn't support MCP; note it.)

- [ ] **Step 3: Tests** (DI'd): the test path passes connectors to the stateless runner; the deploy copy merges template connectors onto the client agent (DI'd update). **Step 4: Commit** `feat(studio): template connectors fire in test + on the deployed text agent`.

---

## Task 6: Verify
- [ ] Suites: `cd packages/crm && node --import tsx --test tests/unit/agent-templates/*.spec.ts tests/unit/agents/**/*.spec.ts tests/unit/deployments/*.spec.ts` → green.
- [ ] `tsc` 0 new; `check-use-server` clean; **no migration**.
- [ ] **Report:** the regression statement (the native tool path + `getToolsForCapabilities` no-connectors path + `executeTurn` + voice + existing editor cards unchanged), the new-test count, and the honest gap — unit-verified; live gate = in the Studio, connect a real Postiz key to a chat template → **Test** → it calls `postiz__schedulePost`; deploy it → the client's text agent has the connector. Voice-MCP is intentionally out (realtime native-only).

## Self-Review
- Coverage: connectors on templates (T1) ✓; template MCP actions reusing #2 (T2) ✓; the picker UI (T3) ✓; surfaces shown + sms/email deploy (T4) ✓; fires in test + on deployed agent (T5) ✓; voice-native-only surfaced honestly (T3/T5) ✓.
- Deferred (noted): an editable per-agent multi-surface model (data model is type-derived today); voice MCP (realtime); the builder's standalone web-chat agent binding (use #2's agent-scoped action — no Studio surface yet); per-client connector overrides.
- Reuse: all MCP primitives come from #2's `lib/agents/mcp/*` — no duplication.
