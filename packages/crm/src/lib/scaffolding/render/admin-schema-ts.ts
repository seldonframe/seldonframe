// BlockSpecEntity → TypeScript source for `<entityName>.schema.ts`.
//
// Shipped in SLICE 4a PR 2 C5 per audit §2.1. Scaffold → UI bridge.
// Emits a Zod schema module exporting:
//   - const <PascalName>Schema = z.object({ ... })
//   - type <PascalName> = z.infer<typeof ...>
//
// The schema drives <BlockListPage> column inference + potential
// <EntityFormDrawer> field inference on the sibling page.

import type {
  BlockSpecEntity,
  BlockSpecEntityField,
  BlockSpecFieldType,
} from "../spec";

export function renderAdminSchemaTs(entity: BlockSpecEntity): string {
  const typeName = pascalCase(entity.name);
  const fieldLines = entity.fields
    .map((f) => `  ${f.name}: ${renderZodField(f)},`)
    .join("\n");
  return [
    `// ${typeName} — admin schema (scaffolded ${new Date().toISOString().slice(0, 10)} by scaffold → UI bridge).`,
    "//",
    "// Drives column inference on the sibling page + any <EntityFormDrawer>",
    "// that consumes the same schema. Edit freely — the scaffold will never",
    "// overwrite this file; re-run the scaffold only on fresh blocks.",
    "",
    'import { z } from "zod";',
    "",
    `export const ${typeName}Schema = z.object({`,
    fieldLines,
    `});`,
    "",
    `export type ${typeName} = z.infer<typeof ${typeName}Schema>;`,
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------
// Field + type rendering
// ---------------------------------------------------------------------

function renderZodField(field: BlockSpecEntityField): string {
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

function pascalCase(name: string): string {
  if (!name) return "";
  return name[0].toUpperCase() + name.slice(1);
}
