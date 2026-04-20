"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { updateContactFieldAction } from "@/lib/contacts/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

/*
Square UI Leads class references (from template source):
- Table wrapper: "bg-card text-card-foreground rounded-xl border"
- Header row: "bg-muted/50"
- Table row behavior: "hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors"
- Table head cell: "text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap"
- Table body cell: "p-2 align-middle whitespace-nowrap"
- Badge base: "h-5 gap-1 rounded-4xl ... inline-flex items-center justify-center w-fit whitespace-nowrap"
*/

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  status: string;
  badges?: string[];
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
    <div className="bg-card text-card-foreground rounded-xl border">
      <table className="w-full text-sm">
        <thead className="[&_tr]:border-b">
          <tr className="bg-muted/50">
            <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">Name</th>
            <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">Email</th>
            <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">Status</th>
          </tr>
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {tableRows.map((row) => {
            const isEditingFirst = editing && cellKey(editing.contactId, editing.field) === cellKey(row.id, "firstName");
            const isEditingLast = editing && cellKey(editing.contactId, editing.field) === cellKey(row.id, "lastName");
            const isEditingEmail = editing && cellKey(editing.contactId, editing.field) === cellKey(row.id, "email");
            const isEditingStatus = editing && cellKey(editing.contactId, editing.field) === cellKey(row.id, "status");

            return (
              <tr key={row.id} className="hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors">
                <td className="p-2 align-middle whitespace-nowrap">
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
                      <button type="button" className="rounded px-1 text-foreground hover:bg-muted/45" onClick={() => beginEdit(row, "firstName")}>
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
                      <button type="button" className="rounded px-1 text-muted-foreground hover:bg-muted/45" onClick={() => beginEdit(row, "lastName")}>
                        {row.lastName ?? "—"}
                      </button>
                    )}

                    <Link href={`/contacts/${row.id}`} className="text-xs text-primary hover:underline">
                      Open
                    </Link>
                  </div>
                  {row.badges && row.badges.length > 0 ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {row.badges.map((badge) => (
                        <span key={badge} className="h-5 gap-1 rounded-4xl border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-medium inline-flex items-center justify-center w-fit whitespace-nowrap shrink-0 text-primary">
                          {badge}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </td>

                <td className="p-2 align-middle whitespace-nowrap">
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
                    <button type="button" className="w-full rounded px-1 text-left text-muted-foreground hover:bg-muted/45" onClick={() => beginEdit(row, "email")}>
                      {row.email ?? "—"}
                    </button>
                  )}
                </td>

                <td className="p-2 align-middle whitespace-nowrap">
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
                    <button type="button" className="h-5 gap-1 rounded-4xl border border-border px-2 py-0.5 text-xs font-medium inline-flex items-center justify-center w-fit whitespace-nowrap shrink-0 bg-secondary text-secondary-foreground" onClick={() => beginEdit(row, "status")}>
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
