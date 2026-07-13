// v1.35.0 — /super-admin/* shell.
//
// Server-rendered. requireSuperAdmin() runs first; non-admins
// redirect to /dashboard before any UI hits the wire (no flash of
// admin chrome). Sidebar mirrors the operator dashboard's left-nav
// pattern (compact icons + labels, dark theme, sticky) so the look
// stays consistent across Seldon surfaces.

import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { SuperAdminSidebar } from "./super-admin-sidebar";

export const metadata = {
  title: "Seldon Admin · SeldonFrame",
};

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireSuperAdmin();

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <SuperAdminSidebar adminEmail={admin.email} adminName={admin.name} />
      <main className="flex-1 min-w-0 overflow-auto">{children}</main>
    </div>
  );
}
