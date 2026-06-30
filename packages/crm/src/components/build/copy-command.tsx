"use client";

// Copy-command island — the ONLY client surface on the /build landing.
//
// Renders a dark, monospaced command/snippet block (matching the marketplace
// listing's Rent-via-MCP panel) with a copy button that writes to the clipboard
// and flips to "Copied" for ~1.8s. Mirrors the copy-button pattern in
// listing-actions-client.tsx (navigator.clipboard.writeText + a cleared
// timeout), kept tiny and presentational so the rest of /build stays a server
// component. Two shapes: a single-line command (the hero) and a multi-line
// snippet (Connect) — `multiline` switches <code> vs <pre> + a $ prompt.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { MarketplaceIcon } from "@/components/marketplace/marketplace-icons";
import { MKT } from "@/components/marketplace/marketplace-data";

export function CopyCommand({
  command,
  multiline = false,
  ariaLabel,
}: {
  command: string;
  /** When true, render as a multi-line <pre> (no leading $); else a one-line
   *  prompt with a green "$". */
  multiline?: boolean;
  ariaLabel?: string;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onCopy = useCallback(() => {
    try {
      void navigator.clipboard.writeText(command);
    } catch {
      /* clipboard unavailable — no-op */
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  }, [command]);

  return (
    <div
      style={{
        position: "relative",
        background: MKT.dark,
        borderRadius: 14,
        padding: multiline ? "16px 18px" : "16px 18px",
        boxShadow: "0 1px 2px rgba(34,29,23,0.10),0 18px 40px rgba(34,29,23,0.16)",
      }}
    >
      <button
        type="button"
        className="sf-btn"
        onClick={onCopy}
        aria-label={ariaLabel ?? "Copy command"}
        style={{
          position: "absolute",
          top: 11,
          right: 11,
          zIndex: 1,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          border: "1px solid rgba(246,242,234,0.18)",
          background: "rgba(246,242,234,0.06)",
          color: MKT.paper,
          fontFamily: "inherit",
          fontSize: 12,
          fontWeight: 600,
          padding: "6px 11px",
          borderRadius: 9,
          cursor: "pointer",
        }}
      >
        <MarketplaceIcon name={copied ? "check" : "copy"} size={13} />
        {copied ? "Copied" : "Copy"}
      </button>

      {multiline ? (
        <pre
          style={{
            margin: 0,
            paddingRight: 78,
            color: "#E8E2D6",
            fontFamily: MKT.fontMono,
            fontSize: 13,
            lineHeight: 1.65,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {command}
        </pre>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingRight: 78, flexWrap: "wrap" }}>
          <span style={{ color: MKT.greenLight, fontWeight: 700, fontFamily: MKT.fontMono, fontSize: 15 }}>$</span>
          <code style={{ color: "#fff", fontFamily: MKT.fontMono, fontSize: 15, wordBreak: "break-word" }}>
            {command}
          </code>
        </div>
      )}
    </div>
  );
}
