// v1 PWA — operator portal layout.
//
// Verifies the operator session (redirects to /portal/<slug>/login if
// missing), resolves agency branding + workspace name, and wraps every
// (operator) screen in the branded mobile shell (header + bottom-tab
// nav + service worker + install button). The leaf screens render only
// their content; the shell owns the chrome.

import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { requireOperatorSessionForOrg } from "@/lib/operator-portal/auth";
import { getEffectiveBrandingForWorkspace } from "@/lib/partner-agencies/branding";
import { OperatorMobileShell } from "@/components/operator-portal/mobile/operator-mobile-shell";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug } = await params;
  return {
    manifest: `/portal/${orgSlug}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Today",
    },
    icons: { apple: "/apple-touch-icon.png" },
  };
}

export default async function OperatorPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await requireOperatorSessionForOrg(orgSlug);

  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, session.orgId))
    .limit(1);

  const branding = await getEffectiveBrandingForWorkspace(session.orgId);

  return (
    <OperatorMobileShell
      orgSlug={orgSlug}
      orgName={org?.name ?? orgSlug}
      branding={branding}
    >
      {children}
    </OperatorMobileShell>
  );
}
