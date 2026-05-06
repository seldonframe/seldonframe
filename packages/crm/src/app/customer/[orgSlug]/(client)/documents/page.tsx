// v1.21.0 — customer-portal documents (renamed from /resources, redesigned)
//
// Two sources merged: portal_documents (uploaded files) +
// portal_resources (link-only references). Both render in the same
// light-mode list with consistent row styling. Industry-aware
// section heading via copy pack ("Your documents" / "Your records" /
// "Project files" etc.).

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import {
  listPortalDocuments,
  listPortalResources,
} from "@/lib/portal/actions";
import { requirePortalSessionForOrg } from "@/lib/portal/auth";
import { pickCustomerCopyPack } from "@/lib/customer-portal/copy-packs";

export default async function CustomerDocumentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await requirePortalSessionForOrg(orgSlug);

  const [documents, resources, orgRow] = await Promise.all([
    listPortalDocuments(orgSlug),
    listPortalResources(orgSlug),
    db
      .select({ soul: organizations.soul })
      .from(organizations)
      .where(eq(organizations.id, session.orgId))
      .limit(1)
      .then((r) => r[0] ?? null),
  ]);

  const soul = (orgRow?.soul ?? {}) as { industry?: string };
  const copy = pickCustomerCopyPack(soul.industry ?? null);

  const hasAny = documents.length > 0 || resources.length > 0;

  return (
    <div className="space-y-5">
      <header>
        <h1
          className="text-[22px] font-semibold tracking-tight"
          style={{ color: "#111" }}
        >
          {copy.documentsHeading}
        </h1>
        <p className="text-[13px]" style={{ color: "#666" }}>
          Files and links your team has shared with you.
        </p>
      </header>

      {!hasAny ? (
        <article
          className="px-6 py-7 text-center"
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px dashed #E5E5E1",
            borderRadius: "12px",
          }}
        >
          <p className="text-[14px]" style={{ color: "#888" }}>
            {copy.noDocumentsMessage}
          </p>
        </article>
      ) : null}

      {documents.length > 0 ? (
        <section
          className="px-5 py-4 sm:px-6 sm:py-5"
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #E5E5E1",
            borderRadius: "12px",
          }}
        >
          <h2
            className="text-[12px] uppercase tracking-wide pb-3 mb-3"
            style={{ color: "#888", borderBottom: "1px solid #F0F0EC" }}
          >
            Files
          </h2>
          <ul className="divide-y" style={{ borderColor: "#F0F0EC" }}>
            {documents.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[14px] font-medium truncate"
                    style={{ color: "#111" }}
                  >
                    {row.fileName}
                  </p>
                  <p className="text-[12px]" style={{ color: "#888" }}>
                    {formatFileSize(row.fileSize)} ·{" "}
                    {new Date(row.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <a
                  href={row.blobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center px-3 text-[12px] font-semibold whitespace-nowrap"
                  style={{
                    backgroundColor: "#111",
                    color: "#FFFFFF",
                    border: "1px solid #111",
                    borderRadius: "6px",
                  }}
                >
                  Download
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {resources.length > 0 ? (
        <section
          className="px-5 py-4 sm:px-6 sm:py-5"
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #E5E5E1",
            borderRadius: "12px",
          }}
        >
          <h2
            className="text-[12px] uppercase tracking-wide pb-3 mb-3"
            style={{ color: "#888", borderBottom: "1px solid #F0F0EC" }}
          >
            Links
          </h2>
          <ul className="divide-y" style={{ borderColor: "#F0F0EC" }}>
            {resources.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[14px] font-medium truncate"
                    style={{ color: "#111" }}
                  >
                    {row.title}
                  </p>
                  {row.description ? (
                    <p className="text-[12px] truncate" style={{ color: "#888" }}>
                      {row.description}
                    </p>
                  ) : null}
                </div>
                {row.url ? (
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center px-3 text-[12px] font-semibold whitespace-nowrap"
                    style={{
                      backgroundColor: "#FFFFFF",
                      color: "#111",
                      border: "1px solid #E5E5E1",
                      borderRadius: "6px",
                    }}
                  >
                    Open
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
