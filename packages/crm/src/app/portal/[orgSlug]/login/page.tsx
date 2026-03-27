import { PortalLoginForm } from "@/components/portal/portal-login-form";

export default async function PortalLoginPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;

  return (
    <main className="crm-page flex min-h-[70vh] items-center justify-center">
      <PortalLoginForm orgSlug={orgSlug} />
    </main>
  );
}
