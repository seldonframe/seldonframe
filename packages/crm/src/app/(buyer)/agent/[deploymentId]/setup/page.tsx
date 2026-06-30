// Marketplace buyer surface — the setup wizard route (server component).
//
// The buyer lands here right after purchase (the install action returns
// `/agent/<id>/setup`). This server component:
//   1. resolves the logged-in buyer's org,
//   2. loads their agent ORG-SCOPED via getBuyerAgent (returns null → 404 to
//      anyone who isn't this deployment's owner — the tenant-isolation invariant),
//   3. computes the ordered step list + the resume point (firstIncompleteStep),
//   4. hands the serializable view to the client wizard, wrapped in the buyer
//      shell (real brand + teal + "Finish later" → the My Agent home).
//
// All data is read here on the server; the client wizard only renders + calls the
// buyer actions. Resumable: a returning buyer re-enters at their saved step.

import { notFound, redirect } from "next/navigation";

import { getOrgId } from "@/lib/auth/helpers";
import {
  getBuyerAgent,
  buildDefaultGetBuyerAgentDeps,
} from "@/lib/marketplace/buyer/buyer-deployment";
import { buyerAgentPath } from "@/lib/marketplace/buyer/buyer-routes";
import { buildSetupWizardView } from "@/lib/marketplace/buyer/setup-view";
import { BuyerShell } from "@/components/buyer/buyer-shell";
import { SetupWizardClient } from "./setup-wizard-client";

export const dynamic = "force-dynamic";

export default async function BuyerSetupPage({
  params,
}: {
  params: Promise<{ deploymentId: string }>;
}) {
  const { deploymentId } = await params;

  const orgId = await getOrgId();
  // Not signed in / no active org → send to login, preserving the return target
  // so the buyer comes straight back to their wizard.
  if (!orgId) {
    redirect(`/login?next=${encodeURIComponent(`/agent/${deploymentId}/setup`)}`);
  }

  const view = await getBuyerAgent(
    deploymentId,
    orgId,
    buildDefaultGetBuyerAgentDeps(),
  );
  // Null when the deployment doesn't exist OR isn't owned by this buyer.
  if (!view) notFound();

  const agentName = view.deployment.clientName || "your agent";
  const homeHref = buyerAgentPath(view.deployment.id) ?? "/";

  // Shape the serializable per-step seed data (business-info prefill, connected
  // toolkits, phone state, go-live recap) for the client wizard. Pure mapping
  // over the loaded deployment + steps — unit-tested in setup-view.spec.ts.
  const wizard = buildSetupWizardView(view);

  return (
    <BuyerShell finishLaterHref={homeHref} wordmarkSuffix="Setup">
      <SetupWizardClient
        deploymentId={view.deployment.id}
        agentName={agentName}
        homeHref={homeHref}
        steps={view.steps}
        doneKinds={view.progress.doneKinds}
        businessName={view.deployment.customization?.businessInfo?.name ?? ""}
        businessInfoSeed={wizard.businessInfoSeed}
        connectedToolkits={wizard.connectedToolkits}
        phoneSeed={wizard.phoneSeed}
        goLiveSummary={wizard.goLiveSummary}
      />
    </BuyerShell>
  );
}
