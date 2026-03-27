import { PortalResourceList } from "@/components/portal/portal-resource-list";
import { listPortalResources } from "@/lib/portal/actions";

export default async function PortalResourcesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const rows = await listPortalResources(orgSlug);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-section-title">Resources</h2>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">Access your onboarding documents and links.</p>
      </div>

      <PortalResourceList orgSlug={orgSlug} rows={rows} />
    </section>
  );
}
