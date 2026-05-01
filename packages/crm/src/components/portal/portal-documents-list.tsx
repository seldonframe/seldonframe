"use client";

import { useTransition } from "react";
import { Download, FileText } from "lucide-react";
import { markPortalDocumentDownloadedAction } from "@/lib/portal/actions";

export type PortalDocumentRow = {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  blobUrl: string;
  downloadCount: number;
  viewedAt: Date | null;
  createdAt: Date;
};

export function PortalDocumentsList({
  orgSlug,
  rows,
}: {
  orgSlug: string;
  rows: PortalDocumentRow[];
}) {
  const [pending, startTransition] = useTransition();

  function handleDownload(row: PortalDocumentRow) {
    // Open the blob URL immediately — the download tracking call is
    // fire-and-forget. We intentionally don't await it before opening
    // because the user-gesture context for window.open expires inside
    // a startTransition callback.
    window.open(row.blobUrl, "_blank", "noopener,noreferrer");
    startTransition(async () => {
      await markPortalDocumentDownloadedAction(orgSlug, row.id);
    });
  }

  return (
    <div className="crm-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-[hsl(var(--color-surface-raised))] text-left text-label">
          <tr>
            <th className="px-3 py-3">File</th>
            <th className="px-3 py-3">Size</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="crm-table-row">
              <td className="px-3 py-3">
                <div className="flex items-center gap-2">
                  <FileText className="size-4 shrink-0 text-[hsl(var(--color-text-secondary))]" />
                  <p className="font-medium text-foreground">{row.fileName}</p>
                </div>
              </td>
              <td className="px-3 py-3 text-[hsl(var(--color-text-secondary))]">
                {formatFileSize(row.fileSize)}
              </td>
              <td className="px-3 py-3">
                <span className="crm-badge">
                  {row.viewedAt ? `downloaded ${row.downloadCount}×` : "new"}
                </span>
              </td>
              <td className="px-3 py-3">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => handleDownload(row)}
                  className="inline-flex h-8 items-center gap-1 rounded border border-border px-2 text-xs disabled:opacity-60"
                >
                  <Download className="size-3" />
                  Download
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}
