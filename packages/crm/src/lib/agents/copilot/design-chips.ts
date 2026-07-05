// Pure projection: list_designs tool output -> clickable design chips
// (SeldonChat design picker, onboarding-batch-2). The model previously
// verbalized the tool's raw JSON as a markdown table that rendered as
// literal `|---|` pipes in the plain-text chat bubble. This helper turns
// the SAME data into deterministic, tap-to-apply chip descriptors — the
// client renders them as buttons instead of asking the model to format
// a table at all.
//
// Never throws: `output` is whatever the copilot's tool-call result
// carried, which may be missing, malformed, or from an older tool
// version. Any shape that doesn't look like a successful list_designs
// result degrades to `{ isHealth: false, chips: [] }` (no picker shown).

import { ARCHETYPES, type AestheticArchetypeId } from "@/lib/workspace/aesthetic-archetypes";
import { DESIGNS } from "@/components/clients/design-picker/data";

export type DesignChip = {
  id: string;
  label: string;
  swatch: string | null;
  applyText: string;
  applyPayload: string;
};

export type DesignChipsResult = {
  isHealth: boolean;
  chips: DesignChip[];
};

type NamedOption = { id: string; name: string };

function isNamedOption(value: unknown): value is NamedOption {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { name?: unknown }).name === "string"
  );
}

function buildApplyPayload(id: string): string {
  return `Apply the "${id}" design to my site using update_design.`;
}

function archetypeChip(option: NamedOption): DesignChip {
  const archetype = ARCHETYPES[option.id as AestheticArchetypeId];
  return {
    id: option.id,
    label: archetype?.label ?? option.name,
    swatch: archetype?.palette?.primary ?? null,
    applyText: `Apply ${option.name}`,
    applyPayload: buildApplyPayload(option.id),
  };
}

function templateChip(option: NamedOption): DesignChip {
  const design = DESIGNS.find((d) => d.id === option.id);
  return {
    id: option.id,
    label: option.name,
    swatch: design?.swatch?.[0] ?? null,
    applyText: `Apply ${option.name}`,
    applyPayload: buildApplyPayload(option.id),
  };
}

/**
 * Project a `list_designs` tool result (`AgentToolResult.output`) into
 * clickable chip descriptors. Order: when the workspace is a health
 * workspace, premium named templates come first, then archetype looks;
 * otherwise archetypes only (premiumTemplates is already `[]` for
 * non-health workspaces from the tool itself, but we don't rely on that).
 */
export function buildDesignChips(output: unknown): DesignChipsResult {
  if (!output || typeof output !== "object") {
    return { isHealth: false, chips: [] };
  }

  const record = output as Record<string, unknown>;
  if (record.ok !== true) {
    return { isHealth: false, chips: [] };
  }

  const isHealth = record.isHealthWorkspace === true;
  const premiumTemplates = Array.isArray(record.premiumTemplates)
    ? record.premiumTemplates.filter(isNamedOption)
    : [];
  const archetypes = Array.isArray(record.archetypes)
    ? record.archetypes.filter(isNamedOption)
    : [];

  const chips: DesignChip[] = isHealth
    ? [...premiumTemplates.map(templateChip), ...archetypes.map(archetypeChip)]
    : archetypes.map(archetypeChip);

  return { isHealth, chips };
}
