// v1 PWA — operator mobile bottom-tab nav.
//
// Mirrors components/customer-portal/customer-portal-nav.tsx's path-
// based active-state pattern (usePathname in a client subtree so the
// server layout doesn't have to prop-drill the active route), but
// renders a FIXED BOTTOM tab bar (LeadConnector-style) for the
// contractor app. Four tabs: Today / Leads / Messages / Appts.
//
// Safe-area aware (env(safe-area-inset-bottom)) so it clears the iOS
// home indicator when launched standalone.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  key: "today" | "leads" | "messages" | "appointments";
  label: string;
  /** Path tail after `/portal/<slug>`. "" = Today. */
  pathTail: string;
  icon: React.ReactNode;
};

const NAV_ITEMS: NavItem[] = [
  {
    key: "today",
    label: "Today",
    pathTail: "",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><path d="M9 22V12h6v10" />
      </svg>
    ),
  },
  {
    key: "leads",
    label: "Leads",
    pathTail: "/leads",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    key: "messages",
    label: "Messages",
    pathTail: "/messages",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
      </svg>
    ),
  },
  {
    key: "appointments",
    label: "Appts",
    pathTail: "/appointments",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
];

function isActive(pathname: string, base: string, tail: string): boolean {
  const target = base + tail;
  if (tail === "") {
    return pathname === base || pathname === `${base}/`;
  }
  return pathname === target || pathname.startsWith(`${target}/`);
}

export function OperatorMobileNav({
  orgSlug,
  activeColor,
}: {
  orgSlug: string;
  activeColor: string;
}) {
  const pathname = usePathname() ?? "";
  const base = `/portal/${orgSlug}`;

  return (
    <nav
      data-operator-mobile-nav=""
      className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[640px] items-stretch justify-around"
      style={{
        backgroundColor: "#FFFFFF",
        borderTop: "1px solid #E5E5E1",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, base, item.pathTail);
        return (
          <Link
            key={item.key}
            href={`${base}${item.pathTail}`}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2"
            style={{ color: active ? activeColor : "#9A9A95" }}
          >
            {item.icon}
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
