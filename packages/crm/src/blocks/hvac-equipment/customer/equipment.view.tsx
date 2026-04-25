// EquipmentCustomerView — customer-facing view (scaffolded 2026-04-25 by scaffold → customer UI bridge).
//
// Reads equipment from your persistence layer + renders them via
// <CustomerDataView>. Wired inside a customer-portal route with a
// <PortalLayout> ancestor (handles theming).
//
// TODO for the builder: implement the data loader with filter "{{customer_id}}".
// The scaffold can't infer your auth/session model or ORM; ship the
// filter logic by replacing the empty rows placeholder.

import { CustomerDataView } from "@/components/ui-customer/customer-data-view";
import { EquipmentSchema, type Equipment } from "../admin/equipment.schema";

export default async function EquipmentCustomerView() {
  // TODO: load equipment using filter "{{customer_id}}".
  const rows: Equipment[] = [];

  return (
    <CustomerDataView
      schema={EquipmentSchema}
      rows={rows}
      fields={["type", "brand", "model", "installDate", "lastServiceAt", "warrantyExpiresAt"]}
    />
  );
}
