import { PortalResourceList } from "@/components/portal/portal-resource-list";
import { PortalDocumentsList } from "@/components/portal/portal-documents-list";
import { listPortalDocuments, listPortalResources } from "@/lib/portal/actions";

export default async function PortalResourcesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;

  // May 1, 2026 — Client Portal V1 ships file uploads alongside the
  // existing link-only portal_resources. The two tables coexist; this
  // page renders documents (uploaded files) above resources (URL links)
  // and shows a single empty state when both are absent.
  const [documents, resources] = await Promise.all([
    listPortalDocuments(orgSlug),
    listPortalResources(orgSlug),
  ]);

  const hasAny = documents.length > 0 || resources.length > 0;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-section-title">Documents</h2>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">
          Files and links your team has shared with you.
        </p>
      </div>

      {!hasAny ? (
        <p className="text-sm text-[hsl(var(--color-text-secondary))]">
          Nothing here yet. Documents and links your team uploads will appear on this page.
        </p>
      ) : null}

      {documents.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-label text-[hsl(var(--color-text-secondary))]">Files</h3>
          <PortalDocumentsList orgSlug={orgSlug} rows={documents} />
        </div>
      ) : null}

      {resources.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-label text-[hsl(var(--color-text-secondary))]">Links</h3>
          <PortalResourceList orgSlug={orgSlug} rows={resources} />
        </div>
      ) : null}
    </section>
  );
}
