// v1.22.0 — agency-side row for one managed workspace
//
// Shows the workspace name + plan + the "Open portal" CTA that
// mints a support session and opens the branded operator portal
// in a new tab.

"use client";

import { useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";

import { createAgencySupportSession } from "@/lib/operator-portal/support-session";

export type AgencyWorkspaceRowProps = {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  plan: string | null;
};

export function AgencyWorkspaceRow({
  workspaceId,
  workspaceName,
  workspaceSlug,
  plan,
}: AgencyWorkspaceRowProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function openPortal() {
    setError(null);
    startTransition(async () => {
      const res = await createAgencySupportSession({ workspaceId });
      if (!res.ok) {
        setError(humanizeReason(res.reason));
        return;
      }
      // Open in a new tab so the agency operator's SF dashboard
      // session in the original tab isn't disturbed by the operator-
      // portal session cookie.
      window.open(res.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <li className="flex items-center justify-between gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{workspaceName}</p>
        <p className="text-xs text-muted-foreground">
          /{workspaceSlug}
          {plan ? ` · ${plan}` : ""}
        </p>
        {error ? (
          <p className="text-xs text-destructive mt-1">{error}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={openPortal}
        disabled={pending}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <ExternalLink className="size-3.5" />
        {pending ? "Opening…" : "Open portal"}
      </button>
    </li>
  );
}

function humanizeReason(reason: string): string {
  switch (reason) {
    case "unauthorized":
      return "You need to sign in.";
    case "missing_required_field":
      return "Missing workspace id.";
    case "workspace_not_found":
      return "Workspace not found.";
    case "workspace_not_under_an_agency":
      return "Workspace is not attached to an agency.";
    case "agency_not_found":
      return "Agency record not found.";
    case "agency_not_active":
      return "Agency is not active. Upgrade to Scale tier to enable support sessions.";
    case "not_agency_owner":
      return "You don't own this agency.";
    default:
      return reason;
  }
}
