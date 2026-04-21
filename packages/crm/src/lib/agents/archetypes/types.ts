// Archetype library types. Archetypes are validated AgentSpec templates
// with typed placeholder slots. Synthesis fills the slots from Soul +
// user-provided context + NL customization; the resulting filled spec
// is what ships to the runtime.
//
// Two marker conventions appear in archetype specTemplate JSON:
// - `$placeholderName` — resolved at SYNTHESIS TIME. Either user-provided
//   (e.g., $formId, $appointmentTypeId) or Soul-derived (copy fields:
//   $opening_message, $confirmation_subject).
// - `{{expression}}` — resolved at RUNTIME, not synthesis. Refers to
//   trigger-payload data (e.g., {{contact.id}}, {{preferred_start}})
//   or to variables extracted by a conversation step.
//
// Two conventions → two resolution paths → clean separation of "filled
// once per deploy" vs "filled every time the agent fires".

export type ArchetypePlaceholderKind = "user_input" | "soul_copy";

export type ArchetypePlaceholder = {
  kind: ArchetypePlaceholderKind;
  description: string;
  // For user_input: what the UI prompts the user for.
  // For soul_copy: what Claude generates. Includes tone guidance.
  example?: string;
  // Soul-copy placeholders reference which Soul fields they draw from,
  // so synthesis can narrow the prompt context. Optional.
  soulFields?: string[];
  // User-input placeholders can point at a tool that lists valid
  // values (e.g., list_forms, list_appointment_types). The UI can
  // render a picker instead of a free-text field.
  valuesFromTool?: string;
};

export type ArchetypeKnownLimitation = {
  summary: string;
  detail?: string;
};

// Same shape as the 7.a spike's AgentSpec but with string values that
// may contain $placeholder tokens. Not re-typed strictly; synthesis
// handles the substitution.
export type ArchetypeSpecTemplate = Record<string, unknown>;

export type Archetype = {
  id: string;
  name: string;
  // Short one-liner for the archetype-picker grid.
  description: string;
  // Longer scope-setting description shown on the detail pane. For
  // archetypes that require specific blocks or are V1.1-scoped, name
  // the constraints here, not in post-install surprises.
  detailedDescription: string;
  // Block slugs that must be installed for this archetype to work.
  // Synthesis validates and surfaces missing blocks as install prompts.
  requiresInstalled: string[];
  // Phase 7.b UI renders these as disclosure bullets on the archetype
  // detail pane, so users know constraints before synthesis runs.
  knownLimitations: ArchetypeKnownLimitation[];
  // Placeholder metadata. Keys match `$<name>` tokens in specTemplate.
  placeholders: Record<string, ArchetypePlaceholder>;
  // The AgentSpec template with $placeholder tokens inside. Validated
  // post-synthesis-fill against the standard AgentSpec validator.
  specTemplate: ArchetypeSpecTemplate;
};
