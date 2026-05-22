"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function LandingUrlCopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the text manually. This path is rare (only
      // affects non-secure contexts, which our app doesn't run in).
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="crm-pressable inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-primary/90"
      aria-label={copied ? "Copied!" : "Copy landing page URL"}
    >
      {copied ? (
        <>
          <Check className="size-3.5" aria-hidden="true" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="size-3.5" aria-hidden="true" />
          Copy
        </>
      )}
    </button>
  );
}
