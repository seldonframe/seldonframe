// v1.21.0 — customer-portal messages (light Twenty-CRM aesthetic)
//
// Same data plumbing as pre-1.21 (listPortalMessages, PortalMessagesClient
// for the thread/composer interactions). Light-themed shell + search
// header replace the legacy crm-card / crm-input chrome.

import { PortalMessagesClient } from "@/components/portal/portal-messages-client";
import { listPortalMessages } from "@/lib/portal/actions";
import { requirePortalSessionForOrg } from "@/lib/portal/auth";

export default async function CustomerMessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { orgSlug } = await params;
  const { q } = await searchParams;
  const session = await requirePortalSessionForOrg(orgSlug);
  const rows = await listPortalMessages(orgSlug, q);
  const clientName =
    `${session.contact.firstName} ${session.contact.lastName ?? ""}`.trim() ||
    null;

  return (
    <div className="space-y-5">
      <header>
        <h1
          className="text-[22px] font-semibold tracking-tight"
          style={{ color: "#111" }}
        >
          Messages
        </h1>
        <p className="text-[13px]" style={{ color: "#666" }}>
          Send a message to your account team.
        </p>
      </header>

      <form
        className="flex flex-wrap items-center gap-2 px-4 py-3"
        style={{
          backgroundColor: "#FFFFFF",
          border: "1px solid #E5E5E1",
          borderRadius: "12px",
        }}
        action={`/customer/${orgSlug}/messages`}
      >
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search messages..."
          className="h-9 min-w-[240px] flex-1 px-3 text-[13px]"
          style={{
            backgroundColor: "#F7F7F5",
            color: "#111",
            border: "1px solid #E5E5E1",
            borderRadius: "8px",
          }}
        />
        <button
          type="submit"
          className="h-9 px-4 text-[13px] font-semibold"
          style={{
            backgroundColor: "#111",
            color: "#FFFFFF",
            border: "1px solid #111",
            borderRadius: "8px",
          }}
        >
          Search
        </button>
      </form>

      <PortalMessagesClient
        orgSlug={orgSlug}
        rows={rows}
        clientName={clientName}
      />
    </div>
  );
}
