// ============================================================================
// v1.15.0 — portal: per-customer render context
// ============================================================================
//
// Composite trees on the portal surface render against a
// CustomerRenderContext = CompositeRenderContext + per-customer data.
// Same primitive vocabulary as landing; just a richer context.
//
// Architectural note: the per-customer DB resolvers (the impure half)
// live in customer-resolvers.ts. This file is purely the type +
// assembly contract. Splitting them keeps the security-critical
// surface (auth-scoped DB queries) auditable in isolation.
//
// Security discipline: every per-customer field MUST be derived from
// resolvers that received BOTH orgId AND customerId as required
// arguments. The assembly function below enforces that customer.id
// is non-empty — if it ever were, an attacker could request a
// portal page without identifying which customer they are.

import type { CompositeRenderContext } from "@/lib/page-blocks/composite/render";

// ─── data shapes returned by resolvers ─────────────────────────────────────

export interface CustomerData {
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  };
  next_appointment: {
    id: string;
    title: string;
    starts_at_iso: string;
    starts_at_display: string;
    location_summary: string;
  } | null;
  recent_appointments: Array<{
    id: string;
    title: string;
    starts_at_display: string;
    status: string;
  }>;
  documents: Array<{
    id: string;
    file_name: string;
    blob_url: string;
    uploaded_at_display: string;
  }>;
  deals: Array<{
    id: string;
    title: string;
    stage: string;
    value_display: string;
  }>;
}

// ─── full context type ─────────────────────────────────────────────────────

export interface CustomerRenderContext extends CompositeRenderContext, CustomerData {}

// ─── pure: assembleCustomerContext ─────────────────────────────────────────

export interface AssembleArgs {
  workspace: CompositeRenderContext;
  customer: CustomerData["customer"];
  next_appointment: CustomerData["next_appointment"];
  recent_appointments: CustomerData["recent_appointments"];
  documents: CustomerData["documents"];
  deals: CustomerData["deals"];
}

/**
 * Build a CustomerRenderContext from pre-fetched resolver outputs.
 * THROWS on missing customer.id — that's the auth-scope identity;
 * if we ever lost it, the renderer would emit data with no audience
 * binding.
 */
export function assembleCustomerContext(args: AssembleArgs): CustomerRenderContext {
  if (!args.customer || typeof args.customer.id !== "string" || !args.customer.id) {
    throw new Error(
      "assembleCustomerContext: customer.id is required and must be a non-empty string. The customer.id is the auth-scope binding for portal renders.",
    );
  }
  return {
    ...args.workspace,
    customer: args.customer,
    next_appointment: args.next_appointment,
    recent_appointments: args.recent_appointments,
    documents: args.documents,
    deals: args.deals,
  };
}

// ─── DB-loading wrapper ────────────────────────────────────────────────────

import {
  fetchCustomerContact,
  fetchNextAppointment,
  fetchRecentAppointments,
  fetchCustomerDocuments,
  fetchCustomerDeals,
} from "./customer-resolvers";

/**
 * Run all per-customer resolvers in parallel + assemble the full
 * CustomerRenderContext. Both orgId and contactId are REQUIRED;
 * the function returns null if either is missing OR if the contact
 * row doesn't exist for that org (foreign-customer probe).
 *
 * Caller (the portal page server component / preview API route) is
 * responsible for the auth check that the requesting user CAN see
 * this contact. This function only enforces "data is scoped to this
 * (orgId, contactId) pair."
 */
export async function buildCustomerContext(args: {
  orgId: string;
  contactId: string;
  workspaceContext: CompositeRenderContext;
  workspaceTimezone?: string;
}): Promise<CustomerRenderContext | null> {
  if (!args.orgId || !args.contactId) return null;

  const tz = args.workspaceTimezone ?? "UTC";

  // Fetch all 5 resolvers in parallel. Each takes (orgId, contactId)
  // as required args; failure of any one returns its empty default
  // shape rather than tainting the whole context.
  const [customer, next_appointment, recent_appointments, documents, customerDeals] =
    await Promise.all([
      fetchCustomerContact(args.orgId, args.contactId),
      fetchNextAppointment(args.orgId, args.contactId, tz),
      fetchRecentAppointments(args.orgId, args.contactId, tz),
      fetchCustomerDocuments(args.orgId, args.contactId, tz),
      fetchCustomerDeals(args.orgId, args.contactId),
    ]);

  if (!customer) return null;

  return assembleCustomerContext({
    workspace: args.workspaceContext,
    customer,
    next_appointment,
    recent_appointments,
    documents,
    deals: customerDeals,
  });
}
