// Marketing route-group layout.
// Updated 2026-06-18: now uses the light paper theme to match
// the redesigned home page (seldonframe.com/CLAUDE.md aesthetic).
// Routes: /docs, /blog, /demo, /pricing-public (new marketing pricing).

import type { ReactNode } from "react";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F6F2EA] text-[#221D17] font-sans antialiased selection:bg-[#1F2B24]/20">
      {children}
    </div>
  );
}
