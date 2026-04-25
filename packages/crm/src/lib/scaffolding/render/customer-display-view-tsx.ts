// BlockSpecCustomerDisplay → customer-view component source.
//
// Shipped in SLICE 4b PR 2 C2 per audit §14.
// Emits `blocks/<slug>/customer/<pluralSlug>.view.tsx` composing
// <CustomerDataView> with the sibling admin schema + the display
// entry's `fields` prop.
//
// The filter expression is NOT interpreted at scaffold time — it
// describes how the BUILDER should wire data fetching. Scaffold
// emits the filter as a TODO comment + a placeholder empty rows
// array so the component compiles clean on first land.

import type { BlockSpecEntity, BlockSpecCustomerDisplay } from "../spec";

export function renderCustomerDisplayViewTsx(
  entity: BlockSpecEntity,
  display: BlockSpecCustomerDisplay,
): string {
  const entityPascal = pascalCase(entity.name);
  const componentName = `${pluralPascal(entity.pluralSlug)}CustomerView`;
  const fieldsLiteral = `[${display.fields.map((f) => `"${f}"`).join(", ")}]`;
  return [
    `// ${componentName} — customer-facing view (scaffolded ${new Date().toISOString().slice(0, 10)} by scaffold → customer UI bridge).`,
    "//",
    `// Reads ${entity.pluralSlug} from your persistence layer + renders them via`,
    `// <CustomerDataView>. Wired inside a customer-portal route with a`,
    `// <PortalLayout> ancestor (handles theming).`,
    "//",
    `// TODO for the builder: implement the data loader with filter "${display.filter}".`,
    `// The scaffold can't infer your auth/session model or ORM; ship the`,
    `// filter logic by replacing the empty rows placeholder.`,
    "",
    `import { CustomerDataView } from "@/components/ui-customer/customer-data-view";`,
    `import { ${entityPascal}Schema, type ${entityPascal} } from "../admin/${entity.name}.schema";`,
    "",
    `export default async function ${componentName}() {`,
    `  // TODO: load ${entity.pluralSlug} using filter "${display.filter}".`,
    `  const rows: ${entityPascal}[] = [];`,
    "",
    `  return (`,
    `    <CustomerDataView`,
    `      schema={${entityPascal}Schema}`,
    `      rows={rows}`,
    `      fields={${fieldsLiteral}}`,
    `    />`,
    `  );`,
    `}`,
    "",
  ].join("\n");
}

function pascalCase(name: string): string {
  if (!name) return "";
  return name[0].toUpperCase() + name.slice(1);
}

function pluralPascal(pluralSlug: string): string {
  return pluralSlug
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join("");
}
