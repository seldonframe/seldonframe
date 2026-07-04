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

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getOrgId } from "@/lib/auth/helpers";
import {
  getBuyerAgentHome,
  buildDefaultGetBuyerAgentHomeDeps,
} from "@/lib/marketplace/buyer/agent-home";
// 2026-07-04 — same server action the main dashboard topbar uses
// (dashboard-topbar.tsx) to sign out. Reused exactly (clears the operator +
// admin-token cookies, then NextAuth) rather than hand-rolling a GET link.
import { signOutAllSessionsAction } from "@/lib/auth/actions";
import { BuyerShell } from "@/components/buyer/buyer-shell";
import { BUYER } from "@/components/buyer/theme";
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
    <BuyerShell accountLinksSlot={<AccountLinks />}>
      <MyAgentClient deploymentId={deploymentId} home={home} />
    </BuyerShell>
  );
}

// 2026-07-04 — quiet top-right account affordances for the "My Agent" home.
// Before this the buyer surface had no way to log out or reach /orgs — a
// buyer who was ALSO a member of another org (e.g. an agency operator who
// bought their own marketplace agent) had no path back to their other
// workspaces short of clearing cookies by hand. "My workspaces" always
// renders: for a true single-purchase buyer, the wave-4A buyer-surface
// guard bounces /orgs back to this page, which is harmless — for a
// multi-org buyer it's the only way out.
function AccountLinks() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <Link
        href="/orgs"
        style={{
          fontFamily: BUYER.fontSans,
          fontSize: 13,
          fontWeight: 500,
          color: BUYER.ink3,
          textDecoration: "none",
        }}
      >
        My workspaces →
      </Link>
      <form action={signOutAllSessionsAction}>
        <button
          type="submit"
          style={{
            fontFamily: BUYER.fontSans,
            fontSize: 13,
            fontWeight: 500,
            color: BUYER.ink3,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
