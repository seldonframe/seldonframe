"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { updateContactFieldAction } from "@/lib/contacts/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  status: string;
};

type EditableField = "firstName" | "lastName" | "email" | "status";

function cellKey(contactId: string, field: EditableField) {
  return `${contactId}:${field}`;
}

export function ContactsInlineTable({ rows }: { rows: ContactRow[] }) {
  const { showDemoToast } = useDemoToast();
  const [pending, startTransition] = useTransition();
  const [tableRows, setTableRows] = useState(rows);
  const [editing, setEditing] = useState<{ contactId: string; field: EditableField } | null>(null);
  const [draft, setDraft] = useState("");

  function beginEdit(contact: ContactRow, field: EditableField) {
    setEditing({ contactId: contact.id, field });
    if (field === "firstName") setDraft(contact.firstName);
    if (field === "lastName") setDraft(contact.lastName ?? "");
    if (field === "email") setDraft(contact.email ?? "");
    if (field === "status") setDraft(contact.status);
  }

  function cancelEdit() {
    setEditing(null);
    setDraft("");
  }

  function commitEdit(contactId: string, field: EditableField) {
    const value = draft;

    startTransition(async () => {
      try {
        if (isDemoReadonlyClient) {
          showDemoToast();
          cancelEdit();
          return;
        }

        await updateContactFieldAction({ contactId, field, value });

        setTableRows((current) =>
          current.map((row) => {
            if (row.id !== contactId) {
              return row;
            }

            if (field === "firstName") return { ...row, firstName: value.trim() };
            if (field === "lastName") return { ...row, lastName: value.trim() || null };
            if (field === "email") return { ...row, email: value.trim() || null };
            return { ...row, status: value.trim() || "lead" };
          })
        );
      } catch (error) {
        if (isDemoBlockedError(error)) {
          showDemoToast();
          cancelEdit();
          return;
        }

        throw error;
      }

      cancelEdit();
    });
  }

  return (
    <div className="crm-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-[hsl(var(--color-surface-raised))] text-left text-label">
          <tr>
            <th className="px-3 py-3">Name</th>
            <th className="px-3 py-3">Email</th>
            <th className="px-3 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {tableRows.map((row) => {
            const isEditingFirst = editing && cellKey(editing.contactId, editing.field) === cellKey(row.id, "firstName");
            const isEditingLast = editing && cellKey(editing.contactId, editing.field) === cellKey(row.id, "lastName");
            const isEditingEmail = editing && cellKey(editing.contactId, editing.field) === cellKey(row.id, "email");
            const isEditingStatus = editing && cellKey(editing.contactId, editing.field) === cellKey(row.id, "status");

            return (
              <tr key={row.id} className="crm-table-row">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    {isEditingFirst ? (
                      <input
                        className="crm-input h-8 w-28 px-2"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onBlur={() => commitEdit(row.id, "firstName")}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            commitEdit(row.id, "firstName");
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            cancelEdit();
                          }
                        }}
                        autoFocus
                        disabled={pending}
                      />
                    ) : (
                      <button type="button" className="rounded px-1 text-white/90 hover:bg-white/10" onClick={() => beginEdit(row, "firstName")}>
                        {row.firstName}
                      </button>
                    )}

                    {isEditingLast ? (
                      <input
                        className="crm-input h-8 w-28 px-2"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onBlur={() => commitEdit(row.id, "lastName")}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            commitEdit(row.id, "lastName");
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            cancelEdit();
                          }
                        }}
                        autoFocus
                        disabled={pending}
                      />
                    ) : (
                      <button type="button" className="rounded px-1 text-white/70 hover:bg-white/10" onClick={() => beginEdit(row, "lastName")}>
                        {row.lastName ?? "—"}
                      </button>
                    )}

                    <Link href={`/contacts/${row.id}`} className="text-xs text-primary/80 hover:underline">
                      Open
                    </Link>
                  </div>
                </td>

                <td className="px-3 py-3">
                  {isEditingEmail ? (
                    <input
                      className="crm-input h-8 w-full px-2"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onBlur={() => commitEdit(row.id, "email")}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitEdit(row.id, "email");
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelEdit();
                        }
                      }}
                      autoFocus
                      disabled={pending}
                    />
                  ) : (
                    <button type="button" className="w-full rounded px-1 text-left text-white/80 hover:bg-white/10" onClick={() => beginEdit(row, "email")}>
                      {row.email ?? "—"}
                    </button>
                  )}
                </td>

                <td className="px-3 py-3">
                  {isEditingStatus ? (
                    <select
                      className="crm-input h-8 px-2"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onBlur={() => commitEdit(row.id, "status")}
                      autoFocus
                      disabled={pending}
                    >
                      <option value="lead">Lead</option>
                      <option value="customer">Customer</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  ) : (
                    <button type="button" className="rounded-full bg-white/10 px-2 py-1 text-xs text-white/80 hover:bg-white/15" onClick={() => beginEdit(row, "status")}>
                      {row.status}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
