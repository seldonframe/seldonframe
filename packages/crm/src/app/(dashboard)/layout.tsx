import { requireAuth } from "@/lib/auth/helpers";
import { SoulProvider } from "@/components/soul/soul-provider";
import { getSoul } from "@/lib/soul/server";
import { adjustBrightness } from "@/lib/utils/colors";
import { Sidebar } from "@/components/layout/sidebar";
import { CommandPalette } from "@/components/layout/command-palette";
import { DemoBanner } from "@/components/layout/demo-banner";
import { DashboardTopbar } from "@/components/layout/dashboard-topbar";
import { registerCrmEventListeners } from "@/lib/events/listeners";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  registerCrmEventListeners();

  const session = await requireAuth();
  const soul = await getSoul();
  const user = session.user;
  const businessName = soul?.businessName || "CRM Framework";
  const avatarFallback = user?.name?.trim()?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "U";

  const bodyStyle = soul?.branding
    ? ({
        "--soul-primary": soul.branding.primaryColor,
        "--soul-primary-hover": adjustBrightness(soul.branding.primaryColor, -8),
        "--soul-accent": soul.branding.accentColor,
      } as React.CSSProperties)
    : undefined;

  return (
    <SoulProvider soul={soul}>
      <div className="crm-page !px-8 !pb-8 !pt-6" data-soul-primary style={bodyStyle}>
        <div className="animate-page-enter flex flex-col gap-6 md:flex-row">
          <Sidebar />
          <div className="flex-1 space-y-4">
            <DemoBanner />
            <DashboardTopbar userName={user?.name || "Account"} avatarFallback={avatarFallback} businessName={businessName} />
            {children}
          </div>
        </div>
        <CommandPalette />
      </div>
    </SoulProvider>
  );
}
