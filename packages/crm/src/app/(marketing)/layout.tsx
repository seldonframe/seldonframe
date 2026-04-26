// Marketing route-group layout.
// Workstream 2 — minimal layout for /docs/quickstart, /blog, /demo
// (and any other launch-prep public pages that don't fit under the
// existing (public) group). No admin sidebar, no auth required, dark
// theme to match the landing-page chrome.
//
// The root layout (`app/layout.tsx`) handles <html>, <body>, fonts,
// and brand metadata. This layout adds nothing structural — it
// exists so the route group has its own segment context for
// future shared chrome (footer, top-nav, etc.) if marketing pages
// grow into a multi-page narrative.

import type { ReactNode } from "react";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] font-sans antialiased selection:bg-[#1FAE85]/20">
      {children}
    </div>
  );
}
