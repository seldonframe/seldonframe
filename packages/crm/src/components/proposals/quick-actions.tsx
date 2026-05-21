"use client";

// packages/crm/src/components/proposals/quick-actions.tsx
// 2026-05-20 — Phase C: Reply (mailto), Resend, Mark inactive.

import { useState, useTransition } from "react";
import type { Proposal } from "@/db/schema/proposals";
import { Button } from "@/components/ui/button";
import {
  resendProposalAction,
  markProposalInactiveAction,
} from "@/lib/proposals/actions";

export function QuickActions({ proposal }: { proposal: Proposal }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const replyMailto = (() => {
    const subject = encodeURIComponent(
      `Re: Proposal for ${proposal.prospectName}`,
    );
    return `mailto:${encodeURIComponent(proposal.prospectEmail)}?subject=${subject}`;
  })();

  function handleResend() {
    setError(null);
    startTransition(async () => {
      const result = await resendProposalAction({ id: proposal.id });
      if (!result.ok) setError(result.error);
    });
  }

  function handleMarkInactive() {
    if (
      !confirm(
        "Mark this proposal as inactive? The public link will return 404.",
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const result = await markProposalInactiveAction({ id: proposal.id });
      if (!result.ok) setError(result.error);
    });
  }

  const isTerminal = ["accepted", "declined", "expired"].includes(
    proposal.status,
  );
  const canResend =
    proposal.status === "sent" || proposal.status === "viewed";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <a
          href={replyMailto}
          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background hover:bg-muted px-3 py-1.5 text-sm transition-colors"
        >
          Reply via email
        </a>
        {canResend && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleResend}
            disabled={isPending}
          >
            {isPending ? "Working…" : "Resend proposal"}
          </Button>
        )}
        {!isTerminal && (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleMarkInactive}
            disabled={isPending}
          >
            Mark inactive
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
