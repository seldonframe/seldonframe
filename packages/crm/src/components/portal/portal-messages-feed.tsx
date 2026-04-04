"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { togglePortalMessagePinAction } from "@/lib/portal/actions";

type PortalMessageRow = {
  id: string;
  subject: string | null;
  body: string;
  senderType: string;
  senderName: string | null;
  createdAt: Date;
  readAt: Date | null;
  isPinned: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
};

export function PortalMessagesFeed({ orgSlug, rows }: { orgSlug: string; rows: PortalMessageRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const timer = setInterval(() => {
      router.refresh();
    }, 30_000);

    return () => clearInterval(timer);
  }, [router]);

  if (rows.length === 0) {
    return <p className="text-label text-[hsl(var(--color-text-secondary))]">No messages yet.</p>;
  }

  return rows.map((row) => {
    const pinned = row.isPinned === "true";

    return (
      <article key={row.id} className="crm-table-row rounded-md px-3 py-3">
        <div className="mb-1 flex items-start justify-between gap-2">
          <div>
            <p className="font-medium text-foreground">{row.subject ?? "Message"}</p>
            <p className="text-xs text-[hsl(var(--color-text-muted))]">
              {row.senderName ?? "Client"} • {new Date(row.createdAt).toLocaleString()}
            </p>
          </div>

          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-xs"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await togglePortalMessagePinAction(orgSlug, row.id, !pinned);
                router.refresh();
              });
            }}
          >
            {pinned ? "Unpin" : "Pin"}
          </button>
        </div>

        <p className="text-sm text-[hsl(var(--color-text-secondary))]">{row.body}</p>

        {row.attachmentUrl ? (
          <a
            href={row.attachmentUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex rounded-md border border-border px-2 py-1 text-xs text-primary"
          >
            Attachment: {row.attachmentName ?? "Open file"}
          </a>
        ) : null}

        <p className="mt-2 text-xs text-[hsl(var(--color-text-muted))]">
          {row.senderType === "client" ? (row.readAt ? "Read ✓" : "Sent") : row.readAt ? "Viewed by you" : "Unread"}
        </p>
      </article>
    );
  });
}
