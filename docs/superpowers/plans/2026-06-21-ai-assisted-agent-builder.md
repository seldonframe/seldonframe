# AI-Assisted Agent Builder (slice 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone describe an agent in one English sentence and get a generated, editable, testable agent template — for **voice** or **web-chat** — replacing the voice-only builder at `/studio/agents/[id]`.

**Architecture:** Add `surface` (derived from a generalized `AgentTemplateType`), a **house-style generate action** (English → validated `TemplateBlueprintPatch` via a DI'd LLM `complete()` dep), and a **surface-aware, AI-first editor** (describe → generate → tweak → test → deploy). All on the existing `agent_templates` CRUD + chat/voice runtimes + native capability allowlist. No new table.

**Tech stack:** Next.js 16 App Router, React 19, Drizzle + Neon, pnpm, `node:test`+`tsx`, Zod, the existing Anthropic client + LLM-key resolution.

**Spec:** `docs/superpowers/specs/2026-06-21-ai-assisted-agent-builder-design.md`.

**Conventions (from the codebase):**
- Pure logic lives in plain modules (NOT `"use server"`) so tests import it without Postgres; `"use server"` files export only async fns (enforced by `scripts/check-use-server.sh`). The `agent-templates` split already follows this (`store.ts` / `schema.ts` plain, `actions.ts` server).
- tsc: `packages/crm/node_modules/.bin/tsc -p packages/crm/tsconfig.json --noEmit` (npx fetches the wrong tsc; ignore ~10 pre-existing `.next` errors — judge by delta).
- Unit tests: `( cd packages/crm && node_modules/.bin/tsx --test <files> )`.
- DI pattern: pure helpers + injectable `deps` (see `lib/agent-templates/store.ts`), so no live LLM in unit tests.

---

## File structure

- **Modify** `packages/crm/src/lib/agent-templates/store.ts` — generalize `AgentTemplateType`; add `surfaceForType`; chat branch in `buildDefaultTemplateBlueprint`.
- **Modify** `packages/crm/src/lib/agent-templates/schema.ts` — extend the patch allow-list (guardrails; voice optional).
- **Create** `packages/crm/src/lib/agent-templates/generate.ts` — pure generate logic (prompt builder, parse/validate/allowlist-filter) + the `GenerateDeps` interface. Plain module.
- **Modify** `packages/crm/src/lib/agent-templates/actions.ts` — `generateAgentDraftAction` (server; resolves key, calls `complete()`, returns draft patch).
- **Modify** `packages/crm/src/app/(dashboard)/studio/agents/[id]/editor-client.tsx` — surface-aware copy, hide TTS for chat, "✨ Refine" affordance, guardrails section.
- **Modify** `packages/crm/src/app/(dashboard)/studio/agents/[id]/page.tsx` — pass `surface` + initial guardrails to the editor.
- **Modify** `packages/crm/src/app/(dashboard)/studio/agents/new-agent-button.tsx` (+ a new create screen/dialog) — the "Describe your agent" entry + surface chooser.
- **Create** tests alongside: `generate.spec.ts`, additions to `store.spec.ts` / the template test files.

---

## Phase 0 — Recon + data foundations

### Task 0: Recon results (DONE — pinned by controller 2026-06-21)

- **LLM client + key (THE seam):** `getAIClient({ orgId })` from `@/lib/ai/client` → `{ client: Anthropic | null }`. Resolution order: BYOK anthropic (`organizations.integrations.anthropic.apiKey`, decrypted) → platform `process.env.ANTHROPIC_API_KEY` fallback. **`!resolution.client` ⇒ no usable key ⇒ map to `needs_key`** (exactly as `testAgentTemplateTurn` does — `lib/agent-templates/test-actions.ts:85-90`). NOTE: thanks to the platform fallback, generation works even for a builder who hasn't added their own key (low-friction first-run; the deployed *runtime* still uses BYOK). `needs_key` only fires when BOTH are absent.
- **One-shot completion shape:** `client.messages.create({ model, max_tokens, system, messages: [{ role: "user", content: user }] })`; read `response.content[]`, concat blocks where `block.type === "text"` → `block.text`. (Mirrors `lib/agents/stateless-turn.ts:150-189`.)
- **Model:** `process.env.ANTHROPIC_AGENT_MODEL?.trim() || "claude-sonnet-4-5-20250929"` (mirror `stateless-turn.ts:43-44`).
- **Action shape to mirror:** `lib/agent-templates/test-actions.ts` `testAgentTemplateTurn` — `assertWritable()` → `getOrgId()` → (ownership guard where relevant) → `getAIClient({orgId})`. The generate action lives in `lib/agent-templates/actions.ts` and follows this shape (no template row needed — generate runs pre-create).
- **Surface-agnostic runtime:** `runStatelessAgentTurn` builds tools from `blueprint.capabilities` + prompt from `composeSystemPrompt` — a `chat_assistant` template runs unchanged (no voice-only coupling in the loop). So the sandbox Test works for chat with no runtime change.
- **Create entry:** `studio/agents/new-agent-button.tsx` → `createAgentTemplateAction({ name, type? })` (type defaults `voice_receptionist`; accepts the new `chat_assistant` once the union lands). Routes to `/studio/agents/[id]` after create.
- **`needs_key` UI hint:** reuse the existing `AgentKeyStatus` pattern (`resolveAgentKeyStatusFromInputs`, `lib/ai/client.ts`) for the "add a key in Settings" affordance.

### Task 1: Generalize the template type + surface + chat defaults

**Files:** Modify `lib/agent-templates/store.ts`; Test `lib/agent-templates/store.spec.ts` (or the existing template store test file — confirm name in Task 0; assume `store.spec.ts`).

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  surfaceForType,
  buildDefaultTemplateBlueprint,
  DEFAULT_CHAT_ASSISTANT_CAPABILITIES,
  ALL_TEMPLATE_CAPABILITIES,
} from "./store";

test("surfaceForType maps types to surfaces", () => {
  assert.equal(surfaceForType("voice_receptionist"), "voice");
  assert.equal(surfaceForType("chat_assistant"), "chat");
});

test("chat default blueprint has chat caps + no TTS voice", () => {
  const bp = buildDefaultTemplateBlueprint("chat_assistant");
  assert.equal(bp.archetype, "chat-assistant");
  assert.deepEqual(bp.capabilities, [...DEFAULT_CHAT_ASSISTANT_CAPABILITIES]);
  assert.equal(bp.voice, undefined); // chat has no TTS voice
  assert.equal(bp.greeting, "Hi! How can I help you today?");
});

test("voice default blueprint unchanged (regression)", () => {
  const bp = buildDefaultTemplateBlueprint("voice_receptionist");
  assert.equal(bp.archetype, "voice-receptionist");
  assert.equal(bp.voice, "cedar");
  assert.ok(bp.capabilities?.includes("get_quote_range"));
});

test("ALL_TEMPLATE_CAPABILITIES is the de-duped union", () => {
  assert.ok(ALL_TEMPLATE_CAPABILITIES.includes("get_quote_range")); // voice-only
  assert.ok(ALL_TEMPLATE_CAPABILITIES.includes("provide_faq_answer")); // chat-only
  assert.equal(new Set(ALL_TEMPLATE_CAPABILITIES).size, ALL_TEMPLATE_CAPABILITIES.length);
});
```

- [ ] **Step 2: Run it — expect FAIL** (`surfaceForType` not exported, chat branch missing).
  `( cd packages/crm && node_modules/.bin/tsx --test src/lib/agent-templates/store.spec.ts )`

- [ ] **Step 3: Implement** in `store.ts`:

```ts
/** Template type id = the surface preset. v1 ships two. */
export type AgentTemplateType = "voice_receptionist" | "chat_assistant";

export type AgentSurface = "voice" | "chat";

/** The surface a template type runs on. */
export function surfaceForType(type: AgentTemplateType): AgentSurface {
  return type === "chat_assistant" ? "chat" : "voice";
}

/** Default chat-assistant capabilities — booking-capable, no voice-only tools. */
export const DEFAULT_CHAT_ASSISTANT_CAPABILITIES: string[] = [
  "look_up_availability",
  "book_appointment",
  "find_my_existing_appointment",
  "reschedule_appointment",
  "cancel_appointment",
  "escalate_to_human",
  "provide_faq_answer",
];

export const DEFAULT_CHAT_ASSISTANT_GREETING = "Hi! How can I help you today?";

/** De-duped union of voice + chat capabilities — the allow-list the generator
 *  and the editor's tool checkboxes draw from. */
export const ALL_TEMPLATE_CAPABILITIES: string[] = Array.from(
  new Set([...DEFAULT_VOICE_RECEPTIONIST_CAPABILITIES, ...DEFAULT_CHAT_ASSISTANT_CAPABILITIES]),
);
```

Then make `buildDefaultTemplateBlueprint` branch on type (replace the existing body):

```ts
export function buildDefaultTemplateBlueprint(
  type: AgentTemplateType,
): AgentBlueprint {
  if (type === "chat_assistant") {
    return {
      archetype: "chat-assistant",
      capabilities: [...DEFAULT_CHAT_ASSISTANT_CAPABILITIES],
      faq: [],
      pricingFacts: [],
      greeting: DEFAULT_CHAT_ASSISTANT_GREETING,
      // no `voice` — chat has no TTS
    };
  }
  return {
    archetype: "voice-receptionist",
    capabilities: [...DEFAULT_VOICE_RECEPTIONIST_CAPABILITIES],
    faq: [],
    pricingFacts: [],
    greeting: DEFAULT_VOICE_RECEPTIONIST_GREETING,
    voice: DEFAULT_VOICE_RECEPTIONIST_VOICE,
  };
}
```

- [ ] **Step 4: Run tests — expect PASS** (+ existing store tests still green).
- [ ] **Step 5: Commit** — `feat(builder): generalize template type to voice|chat + surface + chat defaults`.

### Task 2: Extend the patch allow-list (guardrails + surface-correct voice)

**Files:** Modify `lib/agent-templates/schema.ts` + `lib/agent-templates/store.ts` (`TemplateBlueprintPatch` type); Test `schema.spec.ts` (create if absent).

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { TemplateBlueprintPatchSchema } from "./schema";

test("accepts quoteRanges guardrail", () => {
  const r = TemplateBlueprintPatchSchema.safeParse({
    quoteRanges: [{ service: "AC tune-up", low: 89, high: 149 }],
  });
  assert.equal(r.success, true);
});

test("rejects unknown keys (strict)", () => {
  const r = TemplateBlueprintPatchSchema.safeParse({ wat: 1 });
  assert.equal(r.success, false);
});
```

- [ ] **Step 2: Run — expect FAIL** (`quoteRanges` not in the strict allow-list).
- [ ] **Step 3: Implement** — add to `TemplateBlueprintPatchSchema` (after `faq`):

```ts
    quoteRanges: z
      .array(
        z.object({
          service: z.string().min(1),
          low: z.number(),
          high: z.number(),
          note: z.string().optional(),
        }),
      )
      .optional(),
```

And widen `TemplateBlueprintPatch` in `store.ts` to `Pick<AgentBlueprint, "greeting" | "customSkillMd" | "faq" | "voice" | "capabilities" | "quoteRanges">`.

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(builder): allow quoteRanges guardrail in template patch`.

---

## Phase 1 — The generator (centerpiece)

### Task 3: House-style prompt builder (pure, TDD)

**Files:** Create `lib/agent-templates/generate.ts`; Test `lib/agent-templates/generate.spec.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGeneratePrompt } from "./generate";

test("prompt encodes house rules + surface + allowed tools", () => {
  const { system, user } = buildGeneratePrompt({
    intent: "answer my HVAC phone and book jobs",
    surface: "voice",
    allowedCapabilities: ["book_appointment", "get_quote_range"],
  });
  assert.match(system, /never (state|quote) a firm price/i); // quote-guard rule
  assert.match(system, /read.?back/i); // enforced read-back
  assert.match(system, /book_appointment/); // tool menu present
  assert.match(system, /JSON/i); // structured-output contract
  assert.match(user, /HVAC/);
  assert.match(system, /voice/i); // surface-aware
});
```

- [ ] **Step 2: Run — expect FAIL** (module missing).
- [ ] **Step 3: Implement** `buildGeneratePrompt` — the meta-prompt that bakes in the voice-R1 playbook (sourced as constants; keep the rule text co-located so it's the single source of truth referenced by the spec):

```ts
export type AgentSurfaceInput = "voice" | "chat";

export type BuildGeneratePromptInput = {
  intent: string;
  surface: AgentSurfaceInput;
  allowedCapabilities: string[];
  businessName?: string;
};

const HOUSE_RULES = `SeldonFrame agent rules (always apply):
- Never state a firm price. If asked about price, call get_quote_range (if available) and say a human confirms the final number.
- Before booking, read back the full appointment details (name, service, date, time) and get explicit confirmation.
- If you cannot help or the caller asks for a human, use escalate_to_human or take_message — never invent an answer.
- Only state facts present in the FAQ/knowledge or returned by a tool. Do not hallucinate hours, policies, or availability.
- Be warm, concise, and natural.`;

export function buildGeneratePrompt(input: BuildGeneratePromptInput): {
  system: string;
  user: string;
} {
  const surfaceLine =
    input.surface === "voice"
      ? "This is a VOICE phone agent — short spoken turns, no markdown, confirm by voice."
      : "This is a WEB CHAT agent — concise text, may use light formatting.";
  const system = [
    `You are SeldonFrame's agent designer. Produce a production-ready agent configuration.`,
    surfaceLine,
    HOUSE_RULES,
    `Available tools (choose only what the intent needs): ${input.allowedCapabilities.join(", ")}`,
    `Return ONLY valid JSON matching:`,
    `{"greeting": string, "customSkillMd": string, "capabilities": string[], "faq": {"q": string,"a": string}[], "quoteRanges": {"service":string,"low":number,"high":number}[]}`,
    `- customSkillMd: the agent's persona + playbook prose, embedding the house rules above.`,
    `- capabilities: a subset of the available tools.`,
    `- faq/quoteRanges: [] if unknown.`,
  ].join("\n\n");
  const user = `Business: ${input.businessName ?? "(unnamed)"}\nWhat the agent should do:\n${input.intent}`;
  return { system, user };
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(builder): house-style generate prompt builder`.

### Task 4: Parse / validate / allow-list filter (pure, TDD)

**Files:** Modify `lib/agent-templates/generate.ts`; Test `generate.spec.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { parseGeneratedDraft } from "./generate";

test("parses valid JSON + filters tools to the allow-list", () => {
  const json = JSON.stringify({
    greeting: "Hi",
    customSkillMd: "You are…",
    capabilities: ["book_appointment", "delete_database"], // 2nd not allowed
    faq: [{ q: "Hours?", a: "9–5" }],
    quoteRanges: [],
  });
  const r = parseGeneratedDraft(json, { allowedCapabilities: ["book_appointment"] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.patch.capabilities, ["book_appointment"]); // filtered
  assert.equal(r.patch.greeting, "Hi");
});

test("tolerates code-fenced JSON", () => {
  const r = parseGeneratedDraft('```json\n{"customSkillMd":"x","capabilities":[]}\n```', {
    allowedCapabilities: [],
  });
  assert.equal(r.ok, true);
});

test("returns ok:false on unparseable output", () => {
  const r = parseGeneratedDraft("sorry I can't", { allowedCapabilities: [] });
  assert.equal(r.ok, false);
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** `parseGeneratedDraft` (strip code fences → `JSON.parse` → zod-validate a permissive shape → map to `TemplateBlueprintPatch` filtering `capabilities` to the allow-list):

```ts
import { z } from "zod";
import type { TemplateBlueprintPatch } from "./store";

const RawDraft = z.object({
  greeting: z.string().optional(),
  customSkillMd: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
  faq: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
  quoteRanges: z
    .array(z.object({ service: z.string(), low: z.number(), high: z.number(), note: z.string().optional() }))
    .optional(),
});

export type ParseResult =
  | { ok: true; patch: TemplateBlueprintPatch }
  | { ok: false; error: "unparseable" | "invalid_shape" };

function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
}

export function parseGeneratedDraft(
  raw: string,
  opts: { allowedCapabilities: string[] },
): ParseResult {
  let obj: unknown;
  try {
    obj = JSON.parse(stripFences(raw));
  } catch {
    return { ok: false, error: "unparseable" };
  }
  const parsed = RawDraft.safeParse(obj);
  if (!parsed.success) return { ok: false, error: "invalid_shape" };
  const allow = new Set(opts.allowedCapabilities);
  const d = parsed.data;
  const patch: TemplateBlueprintPatch = {
    ...(d.greeting ? { greeting: d.greeting } : {}),
    ...(d.customSkillMd ? { customSkillMd: d.customSkillMd } : {}),
    ...(d.capabilities ? { capabilities: d.capabilities.filter((c) => allow.has(c)) } : {}),
    ...(d.faq ? { faq: d.faq } : {}),
    ...(d.quoteRanges ? { quoteRanges: d.quoteRanges } : {}),
  };
  return { ok: true, patch };
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(builder): parse+validate+allowlist-filter generated draft`.

### Task 5: The generate action (server; DI'd LLM, key-aware)

**Files:** Modify `lib/agent-templates/generate.ts` (add `GenerateDeps` + `generateDraft` orchestrator, pure-ish with injected `complete`); Modify `lib/agent-templates/actions.ts` (the `"use server"` wrapper using the real key-resolver + client from Task 0). Test `generate.spec.ts`.

- [ ] **Step 1: Write the failing test** (orchestrator with a fake `complete`):

```ts
import { generateDraft } from "./generate";

const fakeComplete = async () =>
  JSON.stringify({ customSkillMd: "You are a receptionist", capabilities: ["book_appointment"] });

test("generateDraft returns a patch on success", async () => {
  const r = await generateDraft(
    { intent: "book jobs", surface: "voice", allowedCapabilities: ["book_appointment"] },
    { complete: fakeComplete },
  );
  assert.equal(r.ok, true);
  assert.equal(r.patch.customSkillMd, "You are a receptionist");
});

test("generateDraft retries once then falls back", async () => {
  let calls = 0;
  const flaky = async () => { calls++; return "not json"; };
  const r = await generateDraft(
    { intent: "x", surface: "chat", allowedCapabilities: [] },
    { complete: flaky },
  );
  assert.equal(calls, 2); // one retry
  assert.equal(r.ok, false);
  assert.equal(r.error, "generation_failed");
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** the orchestrator in `generate.ts`:

```ts
export type GenerateDeps = {
  /** One-shot LLM completion: (system, user) -> raw text. Injected so unit
   *  tests never hit a live model. The action supplies the real client. */
  complete: (args: { system: string; user: string }) => Promise<string>;
};

export type GenerateResult =
  | { ok: true; patch: TemplateBlueprintPatch }
  | { ok: false; error: "generation_failed" };

export async function generateDraft(
  input: BuildGeneratePromptInput,
  deps: GenerateDeps,
): Promise<GenerateResult> {
  const { system, user } = buildGeneratePrompt(input);
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await deps.complete({ system, user });
    const parsed = parseGeneratedDraft(raw, { allowedCapabilities: input.allowedCapabilities });
    if (parsed.ok) return { ok: true, patch: parsed.patch };
  }
  return { ok: false, error: "generation_failed" };
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Add the server action** in `actions.ts` (grounded — uses the real `getAIClient` from Task 0):

```ts
import { getAIClient } from "@/lib/ai/client";
import { generateDraft } from "./generate";
import { ALL_TEMPLATE_CAPABILITIES } from "./store";

const GEN_MODEL =
  process.env.ANTHROPIC_AGENT_MODEL?.trim() || "claude-sonnet-4-5-20250929";

export type GenerateAgentDraftResult =
  | { ok: true; patch: TemplateBlueprintPatch }
  | { ok: false; error: "unauthorized" | "needs_key" | "generation_failed" };

export async function generateAgentDraftAction(input: {
  prompt: string;
  surface: "voice" | "chat";
}): Promise<GenerateAgentDraftResult> {
  assertWritable();
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  // BYOK anthropic → platform fallback (same as testAgentTemplateTurn).
  const { client } = await getAIClient({ orgId });
  if (!client) return { ok: false, error: "needs_key" };

  const result = await generateDraft(
    {
      intent: input.prompt,
      surface: input.surface,
      allowedCapabilities: ALL_TEMPLATE_CAPABILITIES,
    },
    {
      complete: async ({ system, user }) => {
        const resp = await client.messages.create({
          model: GEN_MODEL,
          max_tokens: 2048,
          system,
          messages: [{ role: "user", content: user }],
        });
        return resp.content
          .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
          .map((b) => b.text)
          .join("\n");
      },
    },
  );
  return result.ok
    ? { ok: true, patch: result.patch }
    : { ok: false, error: "generation_failed" };
}
```

- [ ] **Step 6: Run** the full template test suite — expect PASS; run tsc (local binary) — expect 0 new errors; run `scripts/check-use-server.sh`.
- [ ] **Step 7: Commit** — `feat(builder): generateAgentDraftAction (house-style, key-aware, DI'd LLM)`.

---

## Phase 2 — UI / UX (AI-first, surface-aware)

### Task 6: "Describe your agent" create entry

**Files:** Modify `new-agent-button.tsx` → a create dialog/screen. (Uses `ALL_TEMPLATE_CAPABILITIES` + `AgentTemplateType` from Task 1 and `generateAgentDraftAction` from Task 5; `createAgentTemplateAction` already accepts a `type`.)

- [ ] **Step 1: Build the create entry** — replace the bare "New agent" button with a dialog whose body is:
  - a textarea: *"What should your agent do?"* (placeholder from the spec),
  - two surface cards (Voice · Web chat) → sets `surface`,
  - a quiet "or start blank" secondary,
  - primary **Generate** button.
  On Generate: call `generateAgentDraftAction({prompt, surface})`; then `createAgentTemplateAction({ name: deriveName(prompt), type: surface === "chat" ? "chat_assistant" : "voice_receptionist" })`; then `saveAgentTemplateBlueprintAction({ templateId, patch })`; then `router.push('/studio/agents/'+id)`. Handle `needs_key` → inline "Add your LLM key in Settings" link; `generation_failed` → "try rephrasing"; "start blank" skips generate (create with defaults). Show a "Writing your agent…" pending state. (Follow the existing `new-agent-button.tsx` action-calling + `useTransition` pattern; reuse `crm-button-*`.)
  `deriveName(prompt)` = first ~5 words of the prompt, title-cased, fallback "New agent".

- [ ] **Step 2:** tsc + manual: create via a sentence → lands in a pre-filled editor; "start blank" → empty default template.
- [ ] **Step 3: Commit** — `feat(builder): describe-your-agent create flow (generate -> create -> save)`.

### Task 7: Generalize the editor (surface-aware + Refine + guardrails)

**Files:** Modify `editor-client.tsx` + `page.tsx`.

- [ ] **Step 1:** In `page.tsx`, compute `surface = surfaceForType(template.type)` and pass it + the initial `quoteRanges` into `AgentTemplateEditor` (extend `Props` with `surface: "voice" | "chat"` and `initialBlueprint.quoteRanges`).
- [ ] **Step 2:** In `editor-client.tsx`:
  - Make copy **surface-aware** (helper `copy(surface)` returning labels): e.g. greeting label voice="The first thing it says when it answers a call" / chat="The first message it sends"; section title "Receptionist script" → "Agent script"; "on every call" → "every conversation".
  - **Hide the Voice (TTS) section when `surface === "chat"`.**
  - Add a top **"✨ Refine with a prompt"** card: a small input + button that calls `generateAgentDraftAction({ prompt, surface })` and **merges** the returned patch into local state (greeting/customSkillMd/capabilities/faq/quoteRanges), then the user reviews + Saves. Pending + error states like Save.
  - Add a **Guardrails** card surfacing `quoteRanges` (service / low / high rows, add/remove — mirror the FAQ rows UI) and include `quoteRanges` in the `save()` patch.
- [ ] **Step 3:** tsc + manual: open a chat template (no TTS shown); open a voice template (TTS shown); Refine merges; Guardrails save round-trips.
- [ ] **Step 4: Commit** — `feat(builder): surface-aware editor + Refine-with-a-prompt + guardrails`.

---

## Phase 3 — Verify

### Task 8: Full verification

- [ ] **Step 1:** `( cd packages/crm && node_modules/.bin/tsx --test src/lib/agent-templates/*.spec.ts )` — all green; note new-test count delta.
- [ ] **Step 2:** Full-branch tsc (local binary) — 0 new src errors.
- [ ] **Step 3:** `bash scripts/check-use-server.sh` (generate.ts is plain; actions.ts only async exports).
- [ ] **Step 4: Manual smoke (surface to user — don't self-run):** "new agent" → type a sentence → Voice → Generate → editor pre-filled → Test (sandbox) → answers in persona. Repeat with Web chat. Confirm `needs_key` path when no LLM key.
- [ ] **Step 5: Final review** via superpowers:requesting-code-review, then superpowers:finishing-a-development-branch.

---

## Out of scope (follow-on plans)
MCP connector directory · Brain v2 knowledge · email/SMS/DM runtimes · per-deployment tool binding (calendarRef / client's own calendar via cal.diy CalDAV) · marketplace listing · auto-**running** generated evals.
