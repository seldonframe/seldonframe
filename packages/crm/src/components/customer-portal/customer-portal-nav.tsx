// v1.21.0 — customer-portal nav (client-side path-based active state)
//
// Renders both the desktop sidebar (sm+) and the mobile top-tabs
// row (below sm). Each link auto-detects active state via
// usePathname so the layout doesn't need to know which page is
// rendering — pages just `<children>`.
//
// Why client-side: server-component layouts in Next.js don't have
// access to the active pathname for the rendered child page (they
// know the layout's route params but not the leaf URL). Reading
// usePathname in a client subtree is the cleanest way to drive the
// "active" highlight without prop-drilling activeNav through every
// page or duplicating the shell per route.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type CustomerPortalNavProps = {
  orgSlug: string;
  customerEmail: string | null;
  signOutAction: () => Promise<void>;
  /** Autopay console (2026-07-08, Task 3) — flag-gated Billing tab. Absent
   *  (or false) → the nav item + route both stay dark. */
  showBilling?: boolean;
};

type NavItem = {
  key: "home" | "appointments" | "documents" | "messages" | "billing" | "account";
  label: string;
  /** Path tail after `/customer/<slug>`. "" = home. */
  pathTail: string;
};

const BASE_NAV_ITEMS: NavItem[] = [
  { key: "home", label: "Home", pathTail: "" },
  { key: "appointments", label: "Appointments", pathTail: "/appointments" },
  { key: "documents", label: "Documents", pathTail: "/documents" },
  { key: "messages", label: "Messages", pathTail: "/messages" },
  { key: "account", label: "Account", pathTail: "/account" },
];

const BILLING_NAV_ITEM: NavItem = { key: "billing", label: "Billing", pathTail: "/billing" };

function isActive(
  pathname: string,
  base: string,
  tail: string,
): boolean {
  const target = base + tail;
  // Exact match for home (empty tail) — otherwise sub-path like
  // /appointments/<id> would highlight Home if we used startsWith on
  // base alone. For non-home, prefix match (so /appointments and
  // /appointments/<id> both highlight Appointments).
  if (tail === "") {
    return pathname === target || pathname === `${base}/`;
  }
  return pathname === target || pathname.startsWith(`${target}/`);
}

export function CustomerPortalNav({
  orgSlug,
  customerEmail,
  signOutAction,
  showBilling = false,
}: CustomerPortalNavProps) {
  const pathname = usePathname() ?? "";
  const base = `/customer/${orgSlug}`;
  const NAV_ITEMS: NavItem[] = showBilling ? [...BASE_NAV_ITEMS, BILLING_NAV_ITEM] : BASE_NAV_ITEMS;

  return (
    <>
      {/* Mobile top-tabs row */}
      <nav
        data-customer-portal-mobile-nav=""
        className="sm:hidden flex items-center gap-1 overflow-x-auto px-3 py-2"
        style={{
          backgroundColor: "#FFFFFF",
          borderBottom: "1px solid #E5E5E1",
        }}
      >
        {NAV_ITEMS.map((item) => (
          <MobileNavLink
            key={item.key}
            href={`${base}${item.pathTail}`}
            active={isActive(pathname, base, item.pathTail)}
          >
            {item.label}
          </MobileNavLink>
        ))}
      </nav>

      {/* Desktop sidebar — fixed positioning so the spacer in the
          shell doesn't double-render. Width matches shell's spacer
          (w-52 = 13rem = 208px). */}
      <aside
        data-customer-portal-sidebar=""
        className="hidden sm:flex flex-col fixed left-0 top-[57px] bottom-0 w-52 px-3 py-5 z-10"
        style={{
          backgroundColor: "#FFFFFF",
          borderRight: "1px solid #E5E5E1",
        }}
      >
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

        {customerEmail ? (
          <div
            className="mt-auto pt-4"
            style={{ borderTop: "1px solid #E5E5E1" }}
          >
            <p
              className="px-2 text-[10px] uppercase tracking-wide"
              style={{ color: "#999" }}
            >
              Signed in
            </p>
            <div
              className="px-2 mt-1 text-[12px] truncate"
              style={{ color: "#444" }}
            >
              {customerEmail}
            </div>
            <form action={signOutAction} className="px-2 mt-3">
              <button
                type="submit"
                className="text-[12px] underline"
                style={{ color: "#666" }}
              >
                Sign out
              </button>
            </form>
          </div>
        ) : null}
      </aside>
    </>
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

function MobileNavLink({
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
      className="px-3 py-1.5 text-[12px] font-medium whitespace-nowrap"
      style={{
        backgroundColor: active ? "#F0F0EC" : "transparent",
        color: active ? "#111" : "#666",
        borderRadius: "6px",
      }}
    >
      {children}
    </Link>
  );
}
