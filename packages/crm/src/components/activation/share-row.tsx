"use client";

// 2026-07-04 — Task 9 of the win-ladder + SeldonChat plan. Slots into the
// win-ladder's go_live row (see win-ladder.tsx's shareSlot prop): a
// copy-link button + downloadable QR code, both derived from Task 9's
// buildShareAssets. First copy or download fires markShareUsedAction
// (fire-and-forget — a slow/failed stamp must never block the UI feedback),
// which stamps settings.activation.go_liveAt via Task 6's stampLadderEvent.

import { useState } from "react";
import { Copy, Check, Download } from "lucide-react";
import { markShareUsedAction } from "@/lib/activation/share-actions";

export type ShareRowProps = {
  siteUrl: string;
  qrDataUrl: string;
};

export function ShareRow({ siteUrl, qrDataUrl }: ShareRowProps) {
  const [copied, setCopied] = useState(false);
  const [markedUsed, setMarkedUsed] = useState(false);

  function markUsedOnce() {
    if (markedUsed) return;
    setMarkedUsed(true);
    void markShareUsedAction().catch(() => {});
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(siteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      markUsedOnce();
    } catch {
      // Fallback: rare non-secure-context case. Nothing else to do here.
    }
  }

  return (
    <div className="flex flex-wrap items-start gap-4 pt-1">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="crm-pressable inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-primary/90"
            aria-label={copied ? "Copied!" : "Copy your site link"}
          >
            {copied ? (
              <>
                <Check className="size-3.5" aria-hidden="true" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="size-3.5" aria-hidden="true" />
                Copy your site link
              </>
            )}
          </button>
          <a
            href={qrDataUrl}
            download="your-site-qr.png"
            onClick={markUsedOnce}
            className="crm-pressable inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/70 bg-background/40 px-3 text-xs font-medium text-foreground transition-colors hover:bg-background/70"
          >
            <Download className="size-3.5" aria-hidden="true" />
            Download QR
          </a>
        </div>
        <p className="text-xs text-muted-foreground">
          Paste this link on your Google Business Profile and social bios.
        </p>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element -- data: URL, not an optimizable asset */}
      <img
        src={qrDataUrl}
        alt="QR code linking to your site"
        width={72}
        height={72}
        className="rounded-lg border border-border/60 bg-white p-1"
      />
    </div>
  );
}
