// BlockSpecCustomerAction → customer-action-form component source.
//
// Shipped in SLICE 4b PR 2 C2 per audit §14.
// Emits `blocks/<slug>/customer/<tool>.form.tsx` composing
// <CustomerActionForm mode="single"> with an inline Zod schema
// derived from the referenced tool's args.
//
// L-22 note: this renderer is ONLY reachable when the action's
// opt_in === true because BlockSpecSchema's z.literal(true) rejects
// any other value at parse time. No runtime opt-in filter in this
// file; the schema layer already guards the emission.

import type {
  BlockSpecTool,
  BlockSpecArgField,
  BlockSpecFieldType,
  BlockSpecCustomerAction,
} from "../spec";

export function renderCustomerActionFormTsx(
  tool: BlockSpecTool,
  action: BlockSpecCustomerAction,
): string {
  const toolPascal = snakeToPascal(tool.name);
  const componentName = `${toolPascal}CustomerForm`;
  const schemaName = `${toolPascal}ArgsSchema`;
  const argLines = tool.args.map((f) => `  ${f.name}: ${renderZodField(f)},`).join("\n");
  const rateLimitAttr = action.rate_limit
    ? `\n      rateLimitHint="${action.rate_limit}"`
    : "";

  return [
    `// ${componentName} — customer-facing action form (scaffolded ${new Date().toISOString().slice(0, 10)} by scaffold → customer UI bridge).`,
    "//",
    `// Wraps the ${tool.name} MCP tool in a themed <CustomerActionForm>.`,
    `// opt_in=true was verified at BlockSpec parse time (L-22 structural`,
    `// enforcement in lib/scaffolding/spec.ts).`,
    "//",
    `// TODO for the builder: replace the action="/api/${tool.name}" placeholder`,
    `// with a real Next server action that validates the FormData against`,
    `// ${schemaName}, authenticates the customer session, and invokes the`,
    `// ${tool.name} tool.`,
    "",
    `import { z } from "zod";`,
    `import { CustomerActionForm } from "@/components/ui-customer/customer-action-form";`,
    "",
    `const ${schemaName} = z.object({`,
    argLines,
    `});`,
    "",
    `export default function ${componentName}() {`,
    `  return (`,
    `    <CustomerActionForm`,
    `      mode="single"`,
    `      schema={${schemaName}}`,
    `      action="/api/${tool.name}"`,
    `      submitLabel="${toolPascal}"${rateLimitAttr}`,
    `    />`,
    `  );`,
    `}`,
    "",
  ].join("\n");
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

function snakeToPascal(snake: string): string {
  return snake
    .split("_")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join("");
}
