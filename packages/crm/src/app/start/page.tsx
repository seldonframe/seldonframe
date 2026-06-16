// packages/crm/src/app/start/page.tsx
// Live-sell checkout page — /start
// Auth-required. The OPERATOR is logged in and sharing their screen on a Zoom
// call to close an SMB on $397/mo. Renders a 2-step branded checkout.
//
// Step 1: business details + workspace picker
// Step 2: Stripe Embedded Checkout inline
//
// Agency branding (colors, name) is pulled from users.agency_profile.
// Stripe gate: if no active stripeConnections row, show "Connect Stripe first".

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { stripeConnections, users } from "@/db/schema";
import { listManagedOrganizationsForUser } from "@/lib/billing/orgs";
import { StartCheckoutWizard } from "./_components/start-checkout-wizard";
import { StripeGate } from "./_components/stripe-gate";

export const dynamic = "force-dynamic";

export default async function StartPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/start");

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user) redirect("/login");

  // Check for active Stripe connection on the agency's org.
  const [conn] = await db
    .select({ accountId: stripeConnections.stripeAccountId })
    .from(stripeConnections)
    .where(
      and(
        eq(stripeConnections.orgId, user.orgId),
        eq(stripeConnections.isActive, true),
      ),
    )
    .limit(1);

  if (!conn) {
    return <StripeGate />;
  }

  // Load the operator's managed workspaces for the workspace picker.
  const allWorkspaces = await listManagedOrganizationsForUser(session.user.id);
  const workspaces = allWorkspaces.map((ws) => ({
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
  }));

  // Agency branding — from users.agency_profile (same source as proposals/new).
  const agencyName = user.agencyProfile?.name ?? user.name;
  const primaryColor = user.agencyProfile?.brand_color ?? null;

  return (
    <StartCheckoutWizard
      workspaces={workspaces}
      agencyName={agencyName}
      primaryColor={primaryColor}
    />
  );
}
