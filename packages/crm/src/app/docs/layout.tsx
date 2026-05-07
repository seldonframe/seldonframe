// v1.30.0 — Linear-class /docs shell
//
// Standalone layout outside the dashboard route group. The dashboard
// chrome (sidebar with Customers/Deals/etc., topbar with workspace
// switcher) is wrong here — docs need their OWN navigation oriented
// around documentation categories, not workspace operations.
//
// Inspired by linear.app/docs structure: top bar with brand + theme
// toggle + Sign up CTA; left sidebar with collapsible category tree;
// main content area with generous whitespace; bottom-left footer
// links to Docs / Developers / Learn / Contact support.
//
// Layout choices that diverge from the dashboard:
//   - Wider content max-width (1280px vs 1080px) for cards-grid pages
//   - Bigger heading sizes (text-4xl on h1, was text-2xl in dashboard)
//   - Mono-spaced code with subtle border instead of rounded chip
//   - No workspace context — docs are public, not workspace-scoped

import type { Metadata } from "next";
import { DocsSidebar } from "./docs-sidebar";
import { DocsHeader } from "./docs-header";

export const metadata: Metadata = {
  title: "SeldonFrame Docs",
  description:
    "Get an overview of SeldonFrame's features, agents, integrations, and how to use them.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <DocsHeader />
      <div className="flex">
        <DocsSidebar />
        <main className="flex-1 min-w-0">
          <div className="mx-auto max-w-[1080px] px-6 py-12 sm:px-10 sm:py-16">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
