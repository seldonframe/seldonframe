// v1.22.0 — operator portal /contacts mirror
//
// Twenty-CRM-style table view of the workspace's contacts. Scoped
// to the operator session's orgId so URL slug tampering can't
// reveal another workspace's data. Read-only in v1.22; v1.23 will
// add inline edit + status changes.

import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { requireOperatorSessionForOrg } from "@/lib/operator-portal/auth";

const STATUS_PILLS: Record<string, { bg: string; text: string }> = {
  lead: { bg: "#DBEAFE", text: "#1E40AF" },
  qualified: { bg: "#E0E7FF", text: "#3730A3" },
  customer: { bg: "#DCFCE7", text: "#166534" },
  churned: { bg: "#FEE2E2", text: "#991B1B" },
};

export default async function OperatorPortalContactsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await requireOperatorSessionForOrg(orgSlug);

  const rows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      company: contacts.company,
      status: contacts.status,
      tags: contacts.tags,
      score: contacts.score,
      createdAt: contacts.createdAt,
    })
    .from(contacts)
    .where(eq(contacts.orgId, session.orgId))
    .orderBy(desc(contacts.createdAt))
    .limit(200);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1
            className="text-[20px] font-semibold tracking-tight"
            style={{ color: "#111" }}
          >
            Contacts
          </h1>
          <p className="text-[13px]" style={{ color: "#666" }}>
            {rows.length} {rows.length === 1 ? "contact" : "contacts"} in your
            workspace
          </p>
        </div>
      </header>

      {rows.length === 0 ? (
        <article
          className="px-6 py-7 text-center"
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px dashed #E5E5E1",
            borderRadius: "12px",
          }}
        >
          <p className="text-[14px]" style={{ color: "#888" }}>
            No contacts yet. They&apos;ll appear here as bookings, intake
            submissions, and manual adds happen.
          </p>
        </article>
      ) : (
        <article
          className="overflow-hidden"
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #E5E5E1",
            borderRadius: "12px",
          }}
        >
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ backgroundColor: "#F7F7F5" }}>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Phone</Th>
                <Th>Company</Th>
                <Th>Status</Th>
                <Th>Score</Th>
                <Th>Added</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const pill = STATUS_PILLS[row.status] ?? {
                  bg: "#F3F4F6",
                  text: "#4B5563",
                };
                const fullName =
                  `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() ||
                  "—";
                return (
                  <tr
                    key={row.id}
                    style={{
                      borderTop: idx === 0 ? "1px solid #E5E5E1" : "1px solid #F0F0EC",
                    }}
                  >
                    <Td>
                      <Link
                        href={`/portal/${orgSlug}/contacts/${row.id}`}
                        className="font-medium hover:underline"
                        style={{ color: "#111" }}
                      >
                        {fullName}
                      </Link>
                    </Td>
                    <Td muted>
                      {row.email ? (
                        <a
                          href={`mailto:${row.email}`}
                          className="hover:underline"
                          style={{ color: "#444" }}
                        >
                          {row.email}
                        </a>
                      ) : (
                        <span style={{ color: "#BBB" }}>—</span>
                      )}
                    </Td>
                    <Td muted>
                      {row.phone ? (
                        <a
                          href={`tel:${row.phone}`}
                          className="hover:underline"
                          style={{ color: "#444" }}
                        >
                          {row.phone}
                        </a>
                      ) : (
                        <span style={{ color: "#BBB" }}>—</span>
                      )}
                    </Td>
                    <Td muted>{row.company ?? <span style={{ color: "#BBB" }}>—</span>}</Td>
                    <Td>
                      <span
                        className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium"
                        style={{
                          backgroundColor: pill.bg,
                          color: pill.text,
                          borderRadius: "9999px",
                        }}
                      >
                        {row.status}
                      </span>
                    </Td>
                    <Td muted>{row.score}</Td>
                    <Td muted>
                      {new Date(row.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </article>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wide"
      style={{ color: "#666" }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <td
      className="px-4 py-2.5 align-middle"
      style={{ color: muted ? "#444" : "#111" }}
    >
      {children}
    </td>
  );
}
