"use client";

// ICP-3 — the shared sub-nav for the Agents Studio console. Two tabs:
//   Agents   (/studio/agents)  — the builder's reusable template roster
//   Clients  (/studio/clients) — the builder's book of deployments
// so both surfaces are reachable and the Studio reads as one console. Mirrors
// the agents/[id]/agent-tabs.tsx active-link chrome exactly.
//
// Deliberately NOT a /studio/layout.tsx: that route group also contains the
// separate Creator Studio (/studio, the block generator), which must NOT get
// these tabs. So this is an explicit shared component the two pages render.

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/studio/agents", label: "Agents" },
  { href: "/studio/clients", label: "Clients" },
];

export function StudioTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b" aria-label="Studio sections">
      {TABS.map((t) => {
        const isActive = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`relative px-4 py-2 text-sm border-b-2 -mb-px transition-[color,border-color,background-color] duration-150 ease-out rounded-t-md ${
              isActive
                ? "border-primary text-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/40"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
