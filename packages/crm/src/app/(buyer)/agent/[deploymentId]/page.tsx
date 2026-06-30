// Marketplace buyer surface — the "My Agent" home (server component).
//
// THE round-trip endpoint: the buyer lands here after go-live, and returns here
// whenever they open their agent. This server component:
//   1. resolves the logged-in buyer's org,
//   2. loads the home view ORG-SCOPED via getBuyerAgentHome (null → 404 to anyone
//      who isn't this deployment's owner — the tenant-isolation invariant),
//   3. reads the deployment's activity (calls / bookings) from its ACTIVITY org
//      (clientOrgId ?? builderOrgId — always the buyer's own data),
//   4. hands the serializable view to the client island, wrapped in the buyer
//      shell (real SeldonFrameMark brand + teal; no "Finish later" — this is home).
//
// All data is read here on the server; the client island only renders + calls the
// buyer billing-portal action.

import { notFound, redirect } from "next/navigation";

import { getOrgId } from "@/lib/auth/helpers";
import {
  getBuyerAgentHome,
  buildDefaultGetBuyerAgentHomeDeps,
} from "@/lib/marketplace/buyer/agent-home";
import { BuyerShell } from "@/components/buyer/buyer-shell";
import { MyAgentClient } from "./my-agent-client";

export const dynamic = "force-dynamic";

export default async function MyAgentHomePage({
  params,
}: {
  params: Promise<{ deploymentId: string }>;
}) {
  const { deploymentId } = await params;

  const orgId = await getOrgId();
  if (!orgId) {
    redirect(`/login?next=${encodeURIComponent(`/agent/${deploymentId}`)}`);
  }

  const home = await getBuyerAgentHome(
    deploymentId,
    orgId,
    buildDefaultGetBuyerAgentHomeDeps(),
  );
  // Null when the deployment doesn't exist OR isn't owned by this buyer.
  if (!home) notFound();

  return (
    <BuyerShell>
      <MyAgentClient deploymentId={deploymentId} home={home} />
    </BuyerShell>
  );
}
