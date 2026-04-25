// Equipment admin page — scaffolded 2026-04-25 by scaffold → UI bridge.
//
// Auto-generated skeleton using <BlockListPage>. TODO for the builder:
//   1. Replace the empty rows array with a real data loader.
//   2. Wire this file into a Next route (e.g., app/(dashboard)/<slug>/page.tsx)
//      via `export { default } from "..."` or move it directly.
//   3. Customise columns via the `columns` prop if auto-derivation isn't
//      quite right — see <BlockListPage>'s DeriveColumnsOptions API.

import { BlockListPage } from "@/components/ui-composition/block-list-page";
import { EquipmentSchema, type Equipment } from "./equipment.schema";

export default async function EquipmentPage() {
  // TODO: load equipment from your persistence layer.
  const rows: Equipment[] = [];

  return (
    <BlockListPage
      title="Equipment"
      schema={EquipmentSchema}
      rows={rows}
    />
  );
}
