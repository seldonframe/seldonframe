// Admin theme provider — React wrapper that injects the workspace's
// OrgTheme as scoped CSS var overrides into the admin layout.
//
// Shipped in SLICE 4a PR 1 C2 per audit §2.3 + §1.2.4. Paired with
// `lib/theme/admin-theme.ts` which computes the narrow override set.
//
// Usage (in an admin layout):
//   <AdminThemeProvider theme={orgTheme}>
//     <SidebarChrome>{children}</SidebarChrome>
//   </AdminThemeProvider>
//
// The provider is a server component — no state, no effects. It
// renders a wrapper div with `style={...cssVars}`, which Tailwind +
// shadcn components pick up because they all reference `var(--X)`
// internally. The override is scoped to the provider's subtree;
// anything outside (e.g., a toast portal rendered above) uses the
// default shadcn tokens.

import type { ReactNode } from "react";

import { adminThemeToCSSVars } from "@/lib/theme/admin-theme";
import type { OrgTheme } from "@/lib/theme/types";

export function AdminThemeProvider({
  theme,
  children,
}: {
  theme: OrgTheme | null;
  children: ReactNode;
}) {
  // theme=null means no workspace-specific branding — render
  // children unchanged so default shadcn tokens apply.
  if (!theme) {
    return <>{children}</>;
  }
  const cssVars = adminThemeToCSSVars(theme);

  return (
    <div
      data-admin-theme-provider=""
      style={cssVars as React.CSSProperties}
    >
      {children}
    </div>
  );
}
