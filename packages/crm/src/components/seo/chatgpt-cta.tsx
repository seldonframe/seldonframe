// Secondary "Try it inside ChatGPT" CTA — surfaced across guides, /sell, the
// AI agent pages, and the free tools. SeldonFrame is listed in the ChatGPT
// plugin directory; this nudges builders who are already living inside
// ChatGPT toward the same free, no-signup build flow via that surface.
//
// Deliberately secondary in every idiom below — it must never compete with
// the page's primary build CTA. Server component (no "use client"): it's a
// static link, nothing interactive.

import type { ReactElement } from "react";
import { MKT } from "@/components/marketplace/marketplace-data";
import { CHATGPT_PLUGIN_URL } from "@/lib/seo/chatgpt-app";

export type ChatGptCtaProps = {
  /** Render the dark idiom for placement on MKT.dark backgrounds. */
  dark?: boolean;
};

/** Secondary button — drops into an existing CTA flex row as a third link. */
export function ChatGptCtaButton({ dark }: ChatGptCtaProps): ReactElement {
  return (
    <a
      href={CHATGPT_PLUGIN_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="sf-link"
      style={{
        border: dark ? "1.5px solid rgba(246,242,234,0.35)" : `1.5px solid ${MKT.ink10}`,
        color: dark ? MKT.paper : MKT.ink,
        padding: "11px 22px",
        borderRadius: 12,
        fontWeight: 700,
        fontSize: 15,
        textDecoration: "none",
        background: dark ? "transparent" : "rgba(255,255,255,0.5)",
      }}
    >
      Try it inside ChatGPT ↗
    </a>
  );
}

/** Full-width secondary card for the free-tool pages. */
export function ChatGptCtaCard({ dark }: ChatGptCtaProps): ReactElement {
  return (
    <div
      style={{
        marginTop: 24,
        border: dark ? "none" : `1px solid ${MKT.ink10}`,
        borderRadius: 16,
        padding: "24px 26px",
        background: dark ? MKT.dark : "rgba(255,255,255,0.55)",
        color: dark ? MKT.paper : MKT.ink,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em" }}>Try it inside ChatGPT</div>
      <p
        style={{
          margin: "8px 0 16px",
          fontSize: 15,
          lineHeight: 1.6,
          color: dark ? "rgba(246,242,234,0.7)" : "rgba(34,29,23,0.7)",
        }}
      >
        SeldonFrame is in the ChatGPT plugin directory. Describe your business in a chat and get a live website,
        booking page, CRM, and AI chatbot — free, no signup.
      </p>
      <a
        href={CHATGPT_PLUGIN_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="sf-link"
        style={{
          border: dark ? "1.5px solid rgba(246,242,234,0.35)" : `1.5px solid ${MKT.ink10}`,
          color: dark ? MKT.paper : MKT.ink,
          padding: "11px 22px",
          borderRadius: 12,
          fontWeight: 700,
          fontSize: 15,
          textDecoration: "none",
          background: dark ? "transparent" : "rgba(255,255,255,0.5)",
          display: "inline-block",
        }}
      >
        Open in ChatGPT ↗
      </a>
    </div>
  );
}
