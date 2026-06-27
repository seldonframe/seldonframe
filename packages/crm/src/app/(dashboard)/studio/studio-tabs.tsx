"use client";

// ICP-3 — the shared sub-nav for the Agents Studio console. Tabs:
//   Agents    (/studio/agents)   — the builder's reusable template roster
//   Activity  (/studio/agents/activity) — recent fires from outbound agents
//   Clients   (/studio/clients)  — the builder's book of deployments
//   Revenue   (/studio/earnings) — recurring revenue (MRR/ARR) + marketplace
//                                  income. Route kept at /studio/earnings; only
//                                  the visible label is "Revenue".
// so all surfaces are reachable and the Studio reads as one console. Mirrors
// the agents/[id]/agent-tabs.tsx active-link chrome exactly.
//
// Deliberately NOT a /studio/layout.tsx: that route group also contains the
// separate Creator Studio (/studio, the block generator), which must NOT get
// these tabs. So this is an explicit shared component the pages render.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Activity, UsersRound, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** The Studio sub-nav tabs. Exported (read-only) so the nav spec can pin the
 *  label/href contract without rendering the client component. The Revenue tab
 *  keeps the legacy `/studio/earnings` href — only its visible label changed.
 *
 *  Icons mirror the Claude Design "direction A (calm)" dashboard mockup tab
 *  bar (layout-grid · activity · users-round · wallet); the `icon` field is
 *  presentation-only and does not touch the href/label contract above. */
export const STUDIO_TABS = [
  { href: "/studio/agents", label: "Agents" },
  { href: "/studio/agents/activity", label: "Activity" },
  { href: "/studio/clients", label: "Clients" },
  { href: "/studio/earnings", label: "Revenue" },
] as const;

const TABS = STUDIO_TABS;

/** Tab href → calm-tab icon (keyed off the stable href so the exported
 *  label/href contract stays untouched). */
const TAB_ICONS: Record<string, LucideIcon> = {
  "/studio/agents": LayoutGrid,
  "/studio/agents/activity": Activity,
  "/studio/clients": UsersRound,
  "/studio/earnings": Wallet,
};

export function StudioTabs() {
  const pathname = usePathname();
  // Calm segmented control (Claude Design direction A): a quiet inset track
  // (bg-muted/60) holding pills; the active pill lifts onto the card surface
  // with a hairline + soft shadow, inactive pills stay flush + muted. Replaces
  // the old underline-tab chrome — same nav, same active-detection logic.
  return (
    <nav
      className="inline-flex flex-wrap gap-1 rounded-xl border border-border/70 bg-muted/60 p-1"
      aria-label="Studio sections"
    >
      {TABS.map((t) => {
        // Prefix-match so a tab stays active on its subpages, EXCEPT a tab that is
        // a strict prefix of a sibling (Agents ⊂ Agents/Activity) must not also
        // light up on the sibling's path — so a tab is active only when no other,
        // longer tab href is a better (longer) prefix of the current path.
        const matches =
          pathname === t.href || pathname.startsWith(`${t.href}/`);
        const betterMatchExists = TABS.some(
          (o) =>
            o.href !== t.href &&
            o.href.length > t.href.length &&
            (pathname === o.href || pathname.startsWith(`${o.href}/`)),
        );
        const isActive = matches && !betterMatchExists;
        const Icon = TAB_ICONS[t.href];
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm transition-[color,background-color,box-shadow] duration-150 ease-out ${
              isActive
                ? "bg-card font-medium text-foreground shadow-(--shadow-xs)"
                : "font-normal text-muted-foreground hover:text-foreground"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            {Icon ? <Icon className="size-4" aria-hidden /> : null}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
