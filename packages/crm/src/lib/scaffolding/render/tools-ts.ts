// BlockSpec.tools → TypeScript source for `<slug>.tools.ts`.
//
// Shipped in SLICE 2 PR 1 Commit 2 per audit §3.5. Deterministic —
// takes a validated BlockSpec and emits Zod-authored ToolDefinition
// exports matching the pattern in `caldiy-booking.tools.ts` /
// `payments.tools.ts` / etc. The file-writer's `tsc --noEmit` gate
// catches syntax regressions; the `emit:blocks:check` gate catches
// round-trip drift.
//
// Rendering choices:
//   - Two-space indentation (matches the existing tools.ts files).
//   - Each tool rendered as `export const <camelName>: ToolDefinition`
//     plus collected into a `<SLUG>_TOOLS: readonly ToolDefinition[]`
//     tuple at the bottom. This mirrors the shape that
//     `emit-block-tools.impl.ts` expects in its TARGETS array.
//   - No Shared primitives section rendered yet — templates stay
//     tight; builder adds shared z.enum / alias types by hand. G-4
//     tier 2 marker below shows where.

import type {
  BlockSpec,
  BlockSpecArgField,
  BlockSpecFieldType,
  BlockSpecTool,
} from "../spec";
import { slugToConstName } from "../spec";

export function renderToolsTs(spec: BlockSpec): string {
  const constName = slugToConstName(spec.slug);
  const sections: string[] = [];

  sections.push(renderHeaderComment(spec));
  sections.push(renderImports());
  sections.push(renderSharedPrimitivesStub());

  for (const tool of spec.tools) {
    sections.push(renderTool(tool));
  }

  sections.push(renderCollectionExport(constName, spec.tools));

  // Single trailing newline matching the repo's existing tools.ts files.
  return sections.join("\n").replace(/\n+$/, "\n");
}

// ---------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------

function renderHeaderComment(spec: BlockSpec): string {
  return [
    `// ${spec.title} block — tool schemas (scaffolded ${new Date().toISOString().slice(0, 10)} by block-creation skill).`,
    "//",
    "// Zod-authored schemas for the block's MCP tools. Source of truth for",
    "// the tool surface; the emit step renders JSON Schema into the BLOCK.md",
    "// on next `pnpm emit:blocks`.",
    "//",
    "// TODO (scaffold-default): replace tool descriptions + arg/return shapes",
    "// with the real block semantics. Defaults are structural skeletons —",
    "// they compile + emit cleanly but don't reflect your intended behavior.",
    "",
  ].join("\n");
}

function renderImports(): string {
  return [
    'import { z } from "zod";',
    "",
    'import type { ToolDefinition } from "../lib/blocks/contract-v2";',
    "",
  ].join("\n");
}

function renderSharedPrimitivesStub(): string {
  return [
    "// ---------------------------------------------------------------------",
    "// Shared primitives",
    "// ---------------------------------------------------------------------",
    "// TODO (scaffold-default): extract reusable z.enum / z.object primitives",
    "// here when multiple tools need the same shape.",
    "",
  ].join("\n");
}

function renderTool(tool: BlockSpecTool): string {
  const camelName = snakeToCamel(tool.name);
  const argsObject = renderArgsObject(tool.args, 4);
  const returnsObject = renderArgsObject(tool.returns, 4);
  const emitsLiteral = tool.emits.length > 0
    ? `[${tool.emits.map((e) => `"${e}"`).join(", ")}]`
    : "[]";

  return [
    `export const ${camelName}: ToolDefinition = {`,
    `  name: "${tool.name}",`,
    `  description: ${JSON.stringify(tool.description)},`,
    `  args: z.object({`,
    argsObject,
    `  }),`,
    `  returns: z.object({`,
    returnsObject,
    `  }),`,
    `  emits: ${emitsLiteral},`,
    `};`,
    "",
  ].join("\n");
}

function renderCollectionExport(
  constName: string,
  tools: BlockSpec["tools"],
): string {
  const toolNames = tools.map((t) => snakeToCamel(t.name));
  const body = toolNames.length > 0
    ? "\n  " + toolNames.join(",\n  ") + ",\n"
    : "";
  return [
    "// ---------------------------------------------------------------------",
    "// Exported tuple — order stable across emits.",
    "// ---------------------------------------------------------------------",
    "",
    `export const ${constName}_TOOLS: readonly ToolDefinition[] = [${body}] as const;`,
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------
// Helpers — Zod source rendering
// ---------------------------------------------------------------------

function renderArgsObject(fields: BlockSpecArgField[], indent: number): string {
  if (fields.length === 0) {
    return "";
  }
  const pad = " ".repeat(indent);
  return fields
    .map((f) => `${pad}${f.name}: ${renderZodField(f)},`)
    .join("\n");
}

function renderZodField(field: BlockSpecArgField): string {
  let expr = renderZodType(field.type);
  if (field.nullable) expr += ".nullable()";
  if (!field.required) expr += ".optional()";
  return expr;
}

function renderZodType(type: BlockSpecFieldType): string {
  switch (type) {
    case "string":
      return "z.string()";
    case "number":
      return "z.number()";
    case "integer":
      return "z.number().int()";
    case "boolean":
      return "z.boolean()";
  }
}

/** `create_note` → `createNote`; `list` → `list`. */
function snakeToCamel(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}
