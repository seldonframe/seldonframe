import type { Archetype, ArchetypePlaceholder } from "./archetypes";
import type { AgentConfig } from "./configure-actions";

/**
 * WS3.1.3 — synthesis: fill an archetype's `specTemplate` with the
 * operator-supplied configuration so the spec is ready to feed
 * `runtime.startRun()`.
 *
 * Two placeholder kinds (per the archetype types doc):
 *
 *   - `kind: "user_input"` — resolved at SYNTHESIS TIME from the
 *     operator's saved config. e.g. `$formId` → "uuid-of-the-form".
 *     If a required user-input placeholder has no value, synthesis
 *     fails — the configure form's checklist already prevents that
 *     state from reaching here, but we re-validate as defense in
 *     depth (a deploy that bypassed the UI would still fail safely).
 *
 *   - `kind: "soul_copy"` — meant to be filled by Claude at synthesis
 *     time using Soul as context. For V1, we substitute the
 *     placeholder's `example` value if available, otherwise leave
 *     the raw token in place. That means:
 *       - SMS / email copy uses the archetype-author's example text
 *         out of the box (operator-edible via "Advanced — system
 *         prompt override" or by re-saving the archetype later).
 *       - Tokens that don't have an example fall through to the
 *         runtime as literal `$xxx` strings — visible in the run
 *         logs so the operator can see what wasn't filled and edit
 *         the config / prompt accordingly.
 *     Full Claude-driven soul_copy synthesis is V1.1 (it requires
 *     a synthesis LLM call at deploy time + a way to capture the
 *     resolved copy for review before the agent goes live).
 *
 * Runtime `{{interpolation}}` tokens are NOT touched here — those
 * resolve at execution time from the trigger payload + capture
 * scope. We only fill the `$placeholder` kind.
 */

export type SynthesisFailure = {
  ok: false;
  reason: "missing_required_placeholder";
  placeholderKey: string;
};

export type SynthesisSuccess = {
  ok: true;
  spec: Record<string, unknown>;
  /** Audit trail — which placeholders were filled with which values. */
  filled: Record<string, string>;
  /** Soul-copy placeholders we substituted with the archetype's
   *  example text. Empty when no soul_copy fields are present. */
  soulCopyDefaults: Record<string, string>;
  /** Soul-copy placeholders left unfilled because the author didn't
   *  supply an example. Operators see these as `$xxx` in step output
   *  and can fix via system-prompt override. */
  unfilledSoulCopy: string[];
};

export type SynthesisResult = SynthesisSuccess | SynthesisFailure;

export function synthesizeAgentSpec(
  archetype: Archetype,
  config: AgentConfig
): SynthesisResult {
  const filled: Record<string, string> = {};
  const soulCopyDefaults: Record<string, string> = {};
  const unfilledSoulCopy: string[] = [];

  // Validate required user-input placeholders are present.
  for (const [key, meta] of Object.entries(archetype.placeholders)) {
    if (meta.kind !== "user_input") continue;
    const value = config.placeholders?.[key];
    if (!value || !value.trim()) {
      return { ok: false, reason: "missing_required_placeholder", placeholderKey: key };
    }
    filled[key] = value.trim();
  }

  // Substitute soul_copy with example text where available.
  for (const [key, meta] of Object.entries(archetype.placeholders)) {
    if (meta.kind !== "soul_copy") continue;
    if (meta.example && meta.example.trim().length > 0) {
      soulCopyDefaults[key] = meta.example;
    } else {
      unfilledSoulCopy.push(key);
    }
  }

  // Walk the specTemplate recursively, replacing any string value
  // that contains a known $placeholder token.
  const allReplacements = new Map<string, string>();
  for (const [k, v] of Object.entries(filled)) allReplacements.set(k, v);
  for (const [k, v] of Object.entries(soulCopyDefaults)) allReplacements.set(k, v);

  // Apply temperature + model overrides if present in the spec
  // template's variables block. We do this BEFORE the recursive
  // walk so the substituted values flow through any downstream
  // references.
  const specWithOverrides = applyConfigOverrides(archetype.specTemplate, config);

  const spec = substituteInValue(specWithOverrides, allReplacements) as Record<
    string,
    unknown
  >;

  return {
    ok: true,
    spec,
    filled,
    soulCopyDefaults,
    unfilledSoulCopy,
  };
}

/**
 * Apply LLM-related config overrides (model, temperature, optional
 * system-prompt override) to the spec's variables block so
 * downstream conversation / llm_call steps pick them up via
 * `{{model}}` / `{{temperature}}` / `{{system_prompt}}` interpolation.
 */
function applyConfigOverrides(
  template: Record<string, unknown>,
  config: AgentConfig
): Record<string, unknown> {
  const variables: Record<string, unknown> =
    template.variables && typeof template.variables === "object"
      ? { ...(template.variables as Record<string, unknown>) }
      : {};

  if (config.model && config.model.trim()) {
    variables.model = config.model;
  }
  if (typeof config.temperature === "number" && Number.isFinite(config.temperature)) {
    variables.temperature = config.temperature;
  }
  if (config.systemPromptOverride && config.systemPromptOverride.trim()) {
    variables.system_prompt = config.systemPromptOverride;
  }

  return { ...template, variables };
}

/**
 * Recursively walk a JSON-like value and replace any string that
 * contains `$placeholder` tokens with the corresponding map entries.
 *
 * Replacement is whole-token aware — `$foo` only matches when not
 * followed by a word character, so `$form` and `$formId` don't
 * collide. (Postgres-like word boundary on the right side of the
 * token; left side is anchored by `$`.)
 */
function substituteInValue(value: unknown, replacements: Map<string, string>): unknown {
  if (typeof value === "string") {
    let out = value;
    // Sort by descending length so $appointmentTypeId is replaced
    // before $appointment, etc.
    const keys = Array.from(replacements.keys()).sort((a, b) => b.length - a.length);
    for (const key of keys) {
      // Escape regex specials in the key.
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`${escapedKey}(?![A-Za-z0-9_])`, "g");
      out = out.replace(re, replacements.get(key)!);
    }
    return out;
  }
  if (Array.isArray(value)) {
    return value.map((v) => substituteInValue(v, replacements));
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = substituteInValue(v, replacements);
    }
    return result;
  }
  return value;
}

/**
 * Helper: find the trigger event type from a synthesized spec.
 * Lets the dispatcher match deployed agents to incoming events
 * without re-parsing the archetype template.
 */
export function getTriggerEventType(spec: Record<string, unknown>): string | null {
  const trigger = (spec.trigger ?? {}) as Record<string, unknown>;
  if (typeof trigger.type !== "string") return null;
  if (trigger.type === "event" && typeof trigger.event === "string") {
    return trigger.event;
  }
  return null;
}

/**
 * Helper: extract a placeholder's filled value from a saved config
 * BEFORE synthesis runs, used by the dispatcher to filter agents
 * (e.g. "this form-submitted event matches an agent only if its
 * `$formId` placeholder equals the submitted form's id").
 */
export function getConfigPlaceholderValue(
  config: AgentConfig,
  key: string
): string | null {
  const value = config.placeholders?.[key];
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Re-export for callers that need to check what kind a placeholder
 * is without re-importing from archetypes/types.
 */
export type { ArchetypePlaceholder };
