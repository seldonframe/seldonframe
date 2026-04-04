"use client";

import { useTransition } from "react";
import { markEmailClickedAction, markEmailOpenedAction } from "@/lib/emails/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

type EmailRow = {
  id: string;
  provider: string;
  toEmail: string;
  subject: string;
  status: string;
  openCount: number;
  clickCount: number;
  sentAt: Date | null;
};

export function EmailListTable({ rows }: { rows: EmailRow[] }) {
  const [pending, startTransition] = useTransition();
  const { showDemoToast } = useDemoToast();

  function withDemoGuard(work: () => Promise<void>) {
    startTransition(async () => {
      try {
        if (isDemoReadonlyClient) {
          showDemoToast();
          return;
        }

        await work();
        window.location.reload();
      } catch (error) {
        if (isDemoBlockedError(error)) {
          showDemoToast();
          return;
        }

        throw error;
      }
    });
  }

  return (
    <div className="crm-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-[hsl(var(--color-surface-raised))] text-left text-label">
          <tr>
            <th className="px-3 py-3">Subject</th>
            <th className="px-3 py-3">To</th>
            <th className="px-3 py-3">Provider</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3">Stats</th>
            <th className="px-3 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="crm-table-row">
              <td className="px-3 py-3">
                <p className="font-medium text-foreground">{row.subject}</p>
                <p className="text-xs text-[hsl(var(--color-text-muted))]">
                  {row.sentAt ? new Date(row.sentAt).toLocaleString() : "Not sent"}
                </p>
              </td>
              <td className="px-3 py-3">{row.toEmail}</td>
              <td className="px-3 py-3">{row.provider}</td>
              <td className="px-3 py-3"><span className="crm-badge">{row.status}</span></td>
              <td className="px-3 py-3 text-xs text-[hsl(var(--color-text-secondary))]">
                opens: {row.openCount} · clicks: {row.clickCount}
              </td>
              <td className="px-3 py-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="h-8 rounded border border-border px-2 text-xs"
                    disabled={pending}
                    onClick={() => withDemoGuard(() => markEmailOpenedAction(row.id))}
                  >
                    Mark Opened
                  </button>
                  <button
                    type="button"
                    className="h-8 rounded border border-border px-2 text-xs"
                    disabled={pending}
                    onClick={() => withDemoGuard(() => markEmailClickedAction(row.id, "https://example.com"))}
                  >
                    Mark Clicked
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
