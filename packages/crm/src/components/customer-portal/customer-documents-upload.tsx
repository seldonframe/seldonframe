"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { UploadCloud } from "lucide-react";

/**
 * Customer-portal document upload widget.
 *
 * Uses Vercel Blob client-side upload (upload() from @vercel/blob/client)
 * so files bypass the Next.js server-action body limit. The browser gets a
 * signed upload token from POST /api/portal/documents/upload, uploads
 * directly to Vercel Blob, and the route's onUploadCompleted callback inserts
 * the portal_documents row. This supports images, videos, and large files —
 * no ~1 MB cap.
 *
 * Upload progress is shown live via the onUploadProgress callback.
 * On success we router.refresh() so the document list below updates
 * without a full page reload.
 */
interface CustomerDocumentsUploadProps {
  orgSlug: string;
  orgId: string;
  contactId: string;
}

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; fileName: string; progress: number }
  | { status: "error"; message: string };

export function CustomerDocumentsUpload({
  orgSlug,
  orgId,
  contactId,
}: CustomerDocumentsUploadProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setDragging] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>({ status: "idle" });

  async function uploadFile(file: File) {
    setUploadState({ status: "uploading", fileName: file.name, progress: 0 });

    try {
      // Build a safe path for the blob. We embed orgId + contactId so
      // onUploadCompleted can re-derive them from the pathname if tokenPayload
      // is unavailable, and the uuid suffix prevents collisions.
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128);
      const pathname = `portal/client/${orgId}/${contactId}/${crypto.randomUUID()}-${safeName}`;

      await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/portal/documents/upload",
        clientPayload: JSON.stringify({ orgId, contactId }),
        onUploadProgress: ({ percentage }) => {
          setUploadState((prev) =>
            prev.status === "uploading"
              ? { ...prev, progress: percentage }
              : prev
          );
        },
      });

      setUploadState({ status: "idle" });
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Upload failed. Please try again.";
      setUploadState({ status: "error", message: humanizeError(message) });
    }
  }

  function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    // Sequential per-file uploads so each shows its own progress and
    // failures are file-scoped rather than batch-scoped.
    for (const file of Array.from(list)) {
      void uploadFile(file);
    }
  }

  const isPending = uploadState.status === "uploading";

  return (
    <div className="space-y-3">
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
        style={{
          border: `2px dashed ${isDragging ? "#111" : "#D0D0CC"}`,
          borderRadius: "10px",
          padding: "24px 16px",
          textAlign: "center",
          backgroundColor: isDragging ? "rgba(0,0,0,0.03)" : "#FAFAF8",
          transition: "border-color 0.15s, background-color 0.15s",
        }}
      >
        <UploadCloud
          style={{ color: "#888", margin: "0 auto 8px", display: "block" }}
          size={24}
        />
        {isPending && uploadState.status === "uploading" ? (
          <div className="space-y-1">
            <p style={{ color: "#111", fontSize: "13px", fontWeight: 500 }}>
              Uploading {uploadState.fileName}…
            </p>
            <div
              style={{
                height: "4px",
                backgroundColor: "#E5E5E1",
                borderRadius: "2px",
                overflow: "hidden",
                maxWidth: "200px",
                margin: "0 auto",
              }}
            >
              <div
                style={{
                  height: "100%",
                  backgroundColor: "#111",
                  borderRadius: "2px",
                  width: `${uploadState.progress}%`,
                  transition: "width 0.2s",
                }}
              />
            </div>
            <p style={{ color: "#888", fontSize: "12px" }}>
              {uploadState.progress}%
            </p>
          </div>
        ) : (
          <>
            <p style={{ color: "#333", fontSize: "13px", fontWeight: 500 }}>
              Drag files here or click to browse
            </p>
            <p style={{ color: "#888", fontSize: "12px", marginTop: "4px" }}>
              Images, videos, PDFs, and documents — no size limit
            </p>
            <button
              type="button"
              disabled={isPending}
              onClick={() => inputRef.current?.click()}
              style={{
                marginTop: "12px",
                display: "inline-flex",
                alignItems: "center",
                height: "32px",
                padding: "0 12px",
                fontSize: "12px",
                fontWeight: 600,
                backgroundColor: "#111",
                color: "#FFF",
                border: "1px solid #111",
                borderRadius: "6px",
                cursor: isPending ? "not-allowed" : "pointer",
                opacity: isPending ? 0.6 : 1,
              }}
            >
              Choose file
            </button>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {uploadState.status === "error" ? (
        <p
          style={{
            color: "#DC2626",
            fontSize: "12px",
            padding: "8px 10px",
            backgroundColor: "#FEF2F2",
            borderRadius: "6px",
            border: "1px solid #FECACA",
          }}
        >
          {uploadState.message}
        </p>
      ) : null}
    </div>
  );
}

function humanizeError(message: string): string {
  if (message.includes("plan_gate_denied") || message.includes("upgrade required")) {
    return "Document uploads require a Growth or Scale plan. Please ask your team to upgrade.";
  }
  if (message.includes("Unauthorized") || message.includes("unauthorized")) {
    return "You need to be signed in to upload documents.";
  }
  if (message.includes("contact_not_found")) {
    return "Account not found. Try refreshing the page.";
  }
  return message;
}
