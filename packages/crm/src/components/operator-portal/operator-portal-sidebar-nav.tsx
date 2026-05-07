// v1.22.0 — operator-portal sidebar nav with pathname-based active state
//
// Replaces the v1.20 sidebar that hard-coded `active` on Dashboard
// and `comingSoon` on the rest. v1.22 ships /contacts /deals /bookings
// mirrors as real pages, so all sidebar entries are real links and
// the active highlight tracks usePathname().

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  key: "dashboard" | "contacts" | "deals" | "bookings";
  label: string;
  pathTail: string;
};

const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "Dashboard", pathTail: "" },
  { key: "contacts", label: "Contacts", pathTail: "/contacts" },
  { key: "deals", label: "Deals", pathTail: "/deals" },
  { key: "bookings", label: "Bookings", pathTail: "/bookings" },
];

function isActive(pathname: string, base: string, tail: string): boolean {
  const target = base + tail;
  if (tail === "") {
    return pathname === target || pathname === `${base}/`;
  }
  return pathname === target || pathname.startsWith(`${target}/`);
}

export function OperatorPortalSidebarNav({ orgSlug }: { orgSlug: string }) {
  const pathname = usePathname() ?? "";
  const base = `/portal/${orgSlug}`;

  return (
    <nav className="flex flex-col gap-0.5 text-[13px]">
      {NAV_ITEMS.map((item) => (
        <SidebarLink
          key={item.key}
          href={`${base}${item.pathTail}`}
          active={isActive(pathname, base, item.pathTail)}
        >
          {item.label}
        </SidebarLink>
      ))}
    </nav>
  );
}

function SidebarLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center px-2 py-1.5 font-medium"
      style={{
        backgroundColor: active ? "#F0F0EC" : "transparent",
        color: active ? "#111" : "#444",
        borderRadius: "6px",
      }}
    >
      {children}
    </Link>
  );
}
