"use client";

import { useTransition } from "react";
import Link from "next/link";
import { markPortalResourceViewedAction } from "@/lib/portal/actions";

type ResourceRow = {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  viewedAt: Date | null;
};

export function PortalResourceList({ orgSlug, rows }: { orgSlug: string; rows: ResourceRow[] }) {
  const [pending, startTransition] = useTransition();

  function markViewed(id: string) {
    startTransition(async () => {
      await markPortalResourceViewedAction(orgSlug, id);
      window.location.reload();
    });
  }

  return (
    <div className="crm-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-[hsl(var(--color-surface-raised))] text-left text-label">
          <tr>
            <th className="px-3 py-3">Resource</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="crm-table-row">
              <td className="px-3 py-3">
                <p className="font-medium text-foreground">{row.title}</p>
                {row.description ? <p className="text-xs text-[hsl(var(--color-text-secondary))]">{row.description}</p> : null}
              </td>
              <td className="px-3 py-3">
                <span className="crm-badge">{row.viewedAt ? "viewed" : "new"}</span>
              </td>
              <td className="px-3 py-3">
                <div className="flex gap-2">
                  {row.url ? (
                    <Link href={row.url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
                      Open
                    </Link>
                  ) : null}
                  {!row.viewedAt ? (
                    <button type="button" className="h-8 rounded border border-border px-2 text-xs" disabled={pending} onClick={() => markViewed(row.id)}>
                      Mark Viewed
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
