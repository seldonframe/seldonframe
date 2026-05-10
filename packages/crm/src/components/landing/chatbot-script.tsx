// v1.40.7 — chatbot embed script tag.
//
// Server-rendered <script> that loads the workspace's published
// chatbot agent's embed.js. The embed.js is responsible for rendering
// the floating chat bubble (fixed bottom-right, custom-element-based)
// — this component only loads the script.
//
// Lives in components/landing/ (not in a page-specific spot) so both
// /s/ and /l/ public routes can render it identically. async loading
// keeps it off the critical path; the bubble appears a moment after
// initial paint, which is fine since the visitor needs to scroll
// past the hero to even consider chatting.

import Script from "next/script";

export function ChatbotEmbedScript({ embedUrl }: { embedUrl: string }) {
  if (!embedUrl) return null;
  return <Script src={embedUrl} strategy="afterInteractive" />;
}
