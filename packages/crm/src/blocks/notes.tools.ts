// Notes block — tool schemas (scaffolded 2026-04-23 by block-creation skill).
//
// Zod-authored schemas for the block's MCP tools. Source of truth for
// the tool surface; the emit step renders JSON Schema into the BLOCK.md
// on next `pnpm emit:blocks`.
//
// TODO (scaffold-default): replace tool descriptions + arg/return shapes
// with the real block semantics. Defaults are structural skeletons —
// they compile + emit cleanly but don't reflect your intended behavior.

import { z } from "zod";

import type { ToolDefinition } from "../lib/blocks/contract-v2";

// ---------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------
// TODO (scaffold-default): extract reusable z.enum / z.object primitives
// here when multiple tools need the same shape.

export const createNote: ToolDefinition = {
  name: "create_note",
  description: "Create a note on a contact.",
  args: z.object({
    contactId: z.string(),
    body: z.string(),
  }),
  returns: z.object({
    noteId: z.string(),
  }),
  emits: ["note.created"],
};

// ---------------------------------------------------------------------
// Exported tuple — order stable across emits.
// ---------------------------------------------------------------------

export const NOTES_TOOLS: readonly ToolDefinition[] = [
  createNote,
] as const;
