// The (buyer) route group — a marketplace BUYER's focused post-purchase surface.
//
// A thin paper-theme wrapper, mirroring the (marketing) group: the root
// app/layout.tsx already provides <html>/<body> + the fonts + the theme
// provider, so this is just a wrapper <div> that pins the cream paper bg + ink
// text + the teal selection colour. The per-page chrome (the real brand header,
// the CSS-var palette) lives in <BuyerShell>, which each buyer page renders —
// so this group is NEVER the agency dashboard layout (no sidebar, no agency nav,
// no requireAuth here; the pages enforce their own org-scoped auth).

import type { ReactNode } from "react";

export default function BuyerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F6F2EA] text-[#221D17] font-sans antialiased selection:bg-[#00897B]/20">
      {children}
    </div>
  );
}
