"use client";

// Agent setup mode slice (T4) — "Your agent works." Fires ONLY when the Run
// stage resolves to a REAL supervised-run success (never on button click,
// never for the tool-free exempt case — that's a plain completion, not a
// win worth celebrating). Reuses SellStage AS-IS (celebration-framed, not
// forked) for the three Sell options — the completion high IS the
// monetization moment (THE ONE value prop).

import Link from "next/link";
import { Check } from "lucide-react";
import { SellStage } from "./sell-stage";
import { ShareCardPanel } from "./share-card-panel";
import type { SellerListingView, SellerConnectStatus } from "@/lib/marketplace/seller-actions";

export function CelebrationScreen({
  templateId,
  templateName,
  agentType,
  builderName,
  initialListing,
  initialConnect,
  evalPass,
  supervisedRunSucceeded,
  supervisedRunExempt,
  actionCount,
  verdict,
  showPersonalDetailsWarning,
}: {
  templateId: string;
  templateName: string;
  agentType: string | null;
  builderName: string;
  initialListing: SellerListingView | null;
  initialConnect: SellerConnectStatus;
  evalPass: boolean;
  supervisedRunSucceeded: boolean;
  supervisedRunExempt: boolean;
  actionCount: number;
  verdict: string;
  showPersonalDetailsWarning: boolean;
}) {
  return (
    <div className="space-y-6 text-center">
      <div className="space-y-2">
        <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          <Check className="size-4" aria-hidden /> {templateName}
        </p>
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--lc-ink)]">Your agent works.</h2>
        <p className="text-sm text-[var(--lc-muted)]">{verdict} — watched live, no surprises.</p>
      </div>

      <div className="text-left">
        <SellStage
          templateId={templateId}
          templateName={templateName}
          agentType={agentType}
          builderName={builderName}
          initialListing={initialListing}
          initialConnect={initialConnect}
          evalPass={evalPass}
          supervisedRunSucceeded={supervisedRunSucceeded}
          supervisedRunExempt={supervisedRunExempt}
          showPersonalDetailsWarning={showPersonalDetailsWarning}
        />
      </div>

      <ShareCardPanel templateId={templateId} />

      <Link
        href={`/studio/agents/${templateId}?view=full`}
        className="inline-block text-sm text-[var(--lc-muted)] underline-offset-2 hover:text-[var(--lc-ink)] hover:underline"
      >
        Take me to my agent →
      </Link>
    </div>
  );
}
