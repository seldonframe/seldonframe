// ServiceCallsCustomerView — customer-facing view (scaffolded 2026-04-25 by scaffold → customer UI bridge).
//
// Reads service-calls from your persistence layer + renders them via
// <CustomerDataView>. Wired inside a customer-portal route with a
// <PortalLayout> ancestor (handles theming).
//
// TODO for the builder: implement the data loader with filter "{{customer_id}}".
// The scaffold can't infer your auth/session model or ORM; ship the
// filter logic by replacing the empty rows placeholder.

import { CustomerDataView } from "@/components/ui-customer/customer-data-view";
import { ServiceCallSchema, type ServiceCall } from "../admin/serviceCall.schema";

export default async function ServiceCallsCustomerView() {
  // TODO: load service-calls using filter "{{customer_id}}".
  const rows: ServiceCall[] = [];

  return (
    <CustomerDataView
      schema={ServiceCallSchema}
      rows={rows}
      fields={["callType", "scheduledAt", "completedAt", "outcome", "totalCost"]}
    />
  );
}
