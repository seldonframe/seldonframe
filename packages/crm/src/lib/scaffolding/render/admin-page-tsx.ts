// BlockSpecEntity → TypeScript source for `<pluralSlug>.page.tsx`.
//
// Shipped in SLICE 4a PR 2 C5 per audit §2.1. Scaffold → UI bridge.
// Emits a Next.js server component using <BlockListPage> with the
// sibling schema. Rows default to `[]` so the page compiles cleanly
// on first land; builder replaces with a real data loader.

import type { BlockSpecEntity } from "../spec";

export function renderAdminPageTsx(entity: BlockSpecEntity): string {
  const typeName = pascalCase(entity.name);
  const pageComponentName = `${pluralPascal(entity.pluralSlug)}Page`;
  const title = pluralTitle(entity.pluralSlug);
  return [
    `// ${title} admin page — scaffolded ${new Date().toISOString().slice(0, 10)} by scaffold → UI bridge.`,
    "//",
    "// Auto-generated skeleton using <BlockListPage>. TODO for the builder:",
    "//   1. Replace the empty rows array with a real data loader.",
    "//   2. Wire this file into a Next route (e.g., app/(dashboard)/<slug>/page.tsx)",
    "//      via `export { default } from \"...\"` or move it directly.",
    "//   3. Customise columns via the `columns` prop if auto-derivation isn't",
    "//      quite right — see <BlockListPage>'s DeriveColumnsOptions API.",
    "",
    `import { BlockListPage } from "@/components/ui-composition/block-list-page";`,
    `import { ${typeName}Schema, type ${typeName} } from "./${entity.name}.schema";`,
    "",
    `export default async function ${pageComponentName}() {`,
    `  // TODO: load ${entity.pluralSlug} from your persistence layer.`,
    `  const rows: ${typeName}[] = [];`,
    "",
    `  return (`,
    `    <BlockListPage`,
    `      title="${title}"`,
    `      schema={${typeName}Schema}`,
    `      rows={rows}`,
    `    />`,
    `  );`,
    `}`,
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------
// Name transforms
// ---------------------------------------------------------------------

function pascalCase(name: string): string {
  if (!name) return "";
  return name[0].toUpperCase() + name.slice(1);
}

/** `notes` → `Notes`; `support-tickets` → `SupportTickets`. */
function pluralPascal(pluralSlug: string): string {
  return pluralSlug
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join("");
}

/** `support-tickets` → `Support Tickets`. */
function pluralTitle(pluralSlug: string): string {
  return pluralSlug
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join(" ");
}
