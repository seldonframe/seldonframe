// JSON-Schema emission for BLOCK.md tools blocks.
//
// Shipped in Scope 3 Step 2b.1 PR 1 (C6) per audit §7.1 approved path
// (Zod-authored / JSON-Schema-emitted via z.toJSONSchema()).
//
// Architecture: pure functions in this module; the CLI wrapper at
// scripts/emit-block-tools.js orchestrates file I/O. Separating pure
// logic from I/O lets tests import the emit logic directly — no
// fixtures-on-disk required for most of the coverage.
//
// Flow:
//   1. Authoring-time — a block declares its tools as Zod schemas in
//      <block>.tools.ts (see crm.tools.ts from C4).
//   2. Build-time — this module walks the declared tools and calls
//      z.toJSONSchema() on each args + returns shape. The result is an
//      array of ToolEntry objects (shape validated by ToolEntrySchema
//      from contract-v2.ts).
//   3. Emit-time — `applyToolsToMarkdown` replaces the content between
//      `<!-- TOOLS:START -->` / `<!-- TOOLS:END -->` markers in the
//      corresponding BLOCK.md file with the serialized ToolEntry array.
//   4. CI drift-detector — `scripts/emit-block-tools.js --check` runs
//      the emit in-memory and diffs against committed BLOCK.md; any
//      diff fails CI so the committed BLOCK.md can't drift from the
//      Zod source.

import { z } from "zod";

import type { ToolDefinition, ToolEntry } from "./contract-v2";

export const TOOLS_START_MARKER = "<!-- TOOLS:START -->";
export const TOOLS_END_MARKER = "<!-- TOOLS:END -->";

// Render a ToolDefinition[] into the ToolEntry[] shape BLOCK.md carries.
// Each tool's args + returns Zod schema is passed through z.toJSONSchema
// (Zod 4 built-in). emits + name + description pass through unchanged.
export function emitToolEntries(tools: readonly ToolDefinition[]): ToolEntry[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    args: z.toJSONSchema(tool.args) as Record<string, unknown>,
    returns: z.toJSONSchema(tool.returns) as Record<string, unknown>,
    emits: [...tool.emits],
  }));
}

// Serialize ToolEntry[] as pretty-printed JSON. Uses 2-space indent to
// match the project's prettier config. Deterministic key ordering is
// important for the drift-detector — we rely on JSON.stringify's
// insertion-order preservation here; the emit step never merges data
// from multiple sources so ordering stays stable.
export function renderToolEntries(entries: ToolEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

export type ApplyResult = {
  content: string;
  // True when markers were found and content replaced; false when the
  // block has no TOOLS markers yet. A block-author without markers
  // intentionally opted out (CRM in PR 1, e.g. — PR 3 adds its markers).
  applied: boolean;
};

// Replace the content between <!-- TOOLS:START --> and <!-- TOOLS:END -->
// with the serialized entries. Idempotent: calling twice with the same
// entries produces byte-identical output. Returns the original content
// unchanged when markers are missing, with applied=false so callers
// can surface "skipped" messages.
export function applyToolsToMarkdown(blockMd: string, entries: ToolEntry[]): ApplyResult {
  const startIdx = blockMd.indexOf(TOOLS_START_MARKER);
  const endIdx = blockMd.indexOf(TOOLS_END_MARKER);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return { content: blockMd, applied: false };
  }

  const before = blockMd.slice(0, startIdx + TOOLS_START_MARKER.length);
  const after = blockMd.slice(endIdx);
  const payload = `\n${renderToolEntries(entries)}\n`;
  return { content: before + payload + after, applied: true };
}
