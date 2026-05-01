"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, UploadCloud } from "lucide-react";
import { uploadPortalDocumentAction } from "@/lib/portal/admin-actions";

/**
 * May 1, 2026 — Client Portal V1: Operator Documents tab.
 *
 * Lives on the contact record under the Documents tab. The operator
 * either drags a file onto the dropzone or clicks "Choose file"; the
 * upload runs as a server action that pushes to Vercel Blob and inserts
 * a portal_documents row. On success we router.refresh() so the row
 * appears in the list below without a manual reload.
 *
 * Plan-gate is enforced server-side; the UI shows the friendly reason
 * back to the operator when the action returns it. No client-side
 * progress UI in V1 — files are bounded by the Next.js server-action
 * body limit (1 MB default), so uploads complete in a few hundred ms
 * for the realistic operator-uploads-a-PDF case.
 */

export type DocumentRow = {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  blobUrl: string;
  downloadCount: number;
  viewedAt: string | null;
  createdAt: string;
};

interface ContactDocumentsTabProps {
  orgId: string;
  contactId: string;
  documents: DocumentRow[];
}

export function ContactDocumentsTab({
  orgId,
  contactId,
  documents,
}: ContactDocumentsTabProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function upload(file: File) {
    setError(null);
    const fd = new FormData();
    fd.set("orgId", orgId);
    fd.set("contactId", contactId);
    fd.set("file", file);
    startTransition(async () => {
      const res = await uploadPortalDocumentAction(fd);
      if (!res.ok) {
        setError(humanizeReason(res.reason));
        return;
      }
      router.refresh();
    });
  }

  function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    // V1 uploads one file per action invocation. Multi-file selection
    // queues sequential uploads — keeps the per-file body within the
    // server-action limit and lets each row fail independently.
    for (const file of Array.from(list)) {
      upload(file);
    }
  }

  return (
    <section className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors " +
          (isDragging
            ? "border-primary bg-primary/5"
            : "border-border bg-muted/20 hover:bg-muted/30")
        }
      >
        <UploadCloud className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">
          {pending ? "Uploading…" : "Drag files here or click to browse"}
        </p>
        <p className="text-xs text-muted-foreground">
          Files appear in this client&apos;s portal Documents page
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
          className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Choose file
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            // Reset so re-selecting the same file re-fires onChange.
            e.target.value = "";
          }}
        />
      </div>

      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : null}

      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No documents uploaded yet.
        </p>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-medium">File</th>
                <th className="px-3 py-2.5 font-medium">Size</th>
                <th className="px-3 py-2.5 font-medium">Uploaded</th>
                <th className="px-3 py-2.5 font-medium">Downloads</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-muted/20">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium text-foreground">
                        {doc.fileName}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {formatFileSize(doc.fileSize)}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {formatRelative(doc.createdAt)}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-muted-foreground">
                    {doc.downloadCount}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <a
                      href={doc.blobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground hover:bg-muted/50"
                    >
                      <Download className="size-3" />
                      Open
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function humanizeReason(reason: string): string {
  switch (reason) {
    case "unauthorized":
      return "You don't have permission to upload here.";
    case "missing_file":
      return "Choose a file before uploading.";
    case "missing_fields":
      return "Couldn't read contact context — try refreshing the page.";
    case "org_not_found":
      return "Workspace not found.";
    case "contact_not_found":
      return "Contact not found.";
    case "plan_gate_denied":
      return "Document uploads are a Growth or Scale feature.";
    case "insert_failed":
      return "Upload succeeded but the database write failed. Try again.";
    default:
      return reason;
  }
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

function formatRelative(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return "just now";
  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

