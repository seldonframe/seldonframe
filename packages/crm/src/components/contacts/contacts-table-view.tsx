"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  Mail,
  Phone,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { updateContactFieldAction } from "@/lib/contacts/actions";

/**
 * WS2.1 — Twenty-style Clients page.
 *
 * Notion-flavored data table with:
 *   - sortable column headers (click to cycle asc → desc → unsorted)
 *   - inline-editable cells: click a cell → input replaces text →
 *     blur (or Enter) saves via updateContactFieldAction. Esc cancels.
 *     Stage cell uses a select; everything else is a free-text input.
 *   - row click → slide-out detail panel (400px) with Overview /
 *     Activity / Deals / Notes tabs. Click outside or X to close.
 *   - checkbox column for bulk selection (UI only for v1; bulk
 *     actions like delete / change-stage are queued for follow-up).
 *   - colored stage pills mapping standard lifecycle stages to
 *     consistent accent colors.
 *
 * Scope notes:
 *   - Activity / Deals / Notes tabs are populated from server-fetched
 *     props (passed in via the page). The page does the fetches in
 *     parallel and hands the resolved arrays down.
 *   - Empty state lives here too: Twenty-flavored "no clients yet"
 *     state with primary CTA + secondary CSV import link.
 *   - The legacy `<ContactsPageActions>` (search / status / sort
 *     filter chrome) stays on the page above this component since
 *     it's URL-driven and works fine — we just polish the table.
 */

export type ContactRow = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  source: string | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  badges: string[];
};

export type ActivityItem = {
  id: string;
  type: string; // "booking" | "intake_submission" | "email" | "note" | "call" | "task"
  contactId: string;
  subject: string | null;
  occurredAt: string;
};

export type DealLink = {
  id: string;
  contactId: string;
  title: string;
  stage: string;
  value: string;
};

export type NoteItem = {
  id: string;
  contactId: string;
  body: string;
  createdAt: string;
};

export type ContactsTableViewProps = {
  rows: ContactRow[];
  contactLabelSingular: string;
  contactLabelPlural: string;
  stageOptions: string[];
  activityByContact: Record<string, ActivityItem[]>;
  dealsByContact: Record<string, DealLink[]>;
  notesByContact: Record<string, NoteItem[]>;
  // Surface-level totals so the page can render stat cards without
  // duplicating filter logic; passed through for tab badges in the
  // side panel.
  csvImportHref: string;
  newContactHref: string;
};

type SortKey = "name" | "email" | "phone" | "stage" | "created";
type SortDir = "asc" | "desc" | null;

type EditTarget = {
  contactId: string;
  field: "firstName" | "lastName" | "email" | "phone" | "status";
};

type EditFlash = {
  contactId: string;
  field: string;
  status: "saving" | "ok" | "error";
  error?: string;
};

const STAGE_PALETTE: Record<string, { bg: string; text: string; ring: string; dot: string }> = {
  lead: {
    bg: "bg-sky-500/10 dark:bg-sky-400/10",
    text: "text-sky-700 dark:text-sky-300",
    ring: "ring-sky-500/20",
    dot: "bg-sky-500",
  },
  prospect: {
    bg: "bg-violet-500/10 dark:bg-violet-400/10",
    text: "text-violet-700 dark:text-violet-300",
    ring: "ring-violet-500/20",
    dot: "bg-violet-500",
  },
  customer: {
    bg: "bg-emerald-500/10 dark:bg-emerald-400/10",
    text: "text-emerald-700 dark:text-emerald-300",
    ring: "ring-emerald-500/20",
    dot: "bg-emerald-500",
  },
  active: {
    bg: "bg-emerald-500/10 dark:bg-emerald-400/10",
    text: "text-emerald-700 dark:text-emerald-300",
    ring: "ring-emerald-500/20",
    dot: "bg-emerald-500",
  },
  won: {
    bg: "bg-emerald-600/10 dark:bg-emerald-400/15",
    text: "text-emerald-700 dark:text-emerald-300",
    ring: "ring-emerald-600/20",
    dot: "bg-emerald-600",
  },
  inactive: {
    bg: "bg-zinc-500/10",
    text: "text-zinc-600 dark:text-zinc-400",
    ring: "ring-zinc-500/20",
    dot: "bg-zinc-500",
  },
  lost: {
    bg: "bg-zinc-500/10",
    text: "text-zinc-600 dark:text-zinc-400",
    ring: "ring-zinc-500/20",
    dot: "bg-zinc-500",
  },
};

function stageStyle(stage: string) {
  const key = stage.trim().toLowerCase();
  return STAGE_PALETTE[key] ?? {
    bg: "bg-muted",
    text: "text-muted-foreground",
    ring: "ring-border",
    dot: "bg-muted-foreground",
  };
}

function fullName(row: ContactRow) {
  return `${row.firstName} ${row.lastName ?? ""}`.trim() || "(unnamed)";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function relativeFromNow(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

/* ────────────────────────────── component ────────────────────────────── */

export function ContactsTableView({
  rows,
  contactLabelSingular,
  contactLabelPlural,
  stageOptions,
  activityByContact,
  dealsByContact,
  notesByContact,
  csvImportHref,
  newContactHref,
}: ContactsTableViewProps) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [flash, setFlash] = useState<EditFlash | null>(null);
  const [, startTransition] = useTransition();

  const sortedRows = useMemo(() => {
    if (!sortDir) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    const copy = [...rows];
    copy.sort((a, b) => {
      const aVal = sortValue(a, sortKey);
      const bVal = sortValue(b, sortKey);
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return 0;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
      return;
    }
    if (sortDir === "asc") {
      setSortDir("desc");
      return;
    }
    if (sortDir === "desc") {
      setSortDir(null);
      return;
    }
    setSortDir("asc");
  }

  function toggleSelect(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((current) => {
      if (current.size === sortedRows.length) return new Set();
      return new Set(sortedRows.map((r) => r.id));
    });
  }

  const saveEdit = useCallback(
    async (target: EditTarget, value: string) => {
      setFlash({ contactId: target.contactId, field: target.field, status: "saving" });
      startTransition(async () => {
        try {
          await updateContactFieldAction({
            contactId: target.contactId,
            field: target.field,
            value,
          });
          setFlash({ contactId: target.contactId, field: target.field, status: "ok" });
          router.refresh();
          setTimeout(() => setFlash(null), 1500);
        } catch (err) {
          setFlash({
            contactId: target.contactId,
            field: target.field,
            status: "error",
            error: err instanceof Error ? err.message : "Save failed",
          });
        }
      });
    },
    [router]
  );

  // Close panel on Esc
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (edit) setEdit(null);
        else if (activeId) setActiveId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [edit, activeId]);

  const activeContact = activeId ? rows.find((r) => r.id === activeId) ?? null : null;

  if (rows.length === 0) {
    return <ContactsEmptyState csvImportHref={csvImportHref} newContactHref={newContactHref} />;
  }

  return (
    <>
      <div className="rounded-xl border bg-card text-card-foreground overflow-hidden">
        {selectedIds.size > 0 ? (
          <div className="flex items-center justify-between gap-3 border-b bg-primary/5 px-4 py-2 text-xs">
            <span className="font-medium text-foreground">
              {selectedIds.size} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled
                title="Bulk actions coming soon"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs text-muted-foreground opacity-60 cursor-not-allowed"
              >
                <Trash2 className="size-3.5" />
                Delete
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            </div>
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full caption-bottom text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="w-10 px-3 py-2.5 align-middle">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === sortedRows.length && sortedRows.length > 0}
                    onChange={toggleSelectAll}
                    aria-label="Select all"
                    className="size-3.5 rounded border-border"
                  />
                </th>
                <SortableHeader label="Name" active={sortKey === "name"} dir={sortDir} onClick={() => toggleSort("name")} />
                <SortableHeader label="Email" active={sortKey === "email"} dir={sortDir} onClick={() => toggleSort("email")} />
                <SortableHeader label="Phone" active={sortKey === "phone"} dir={sortDir} onClick={() => toggleSort("phone")} />
                <SortableHeader label="Stage" active={sortKey === "stage"} dir={sortDir} onClick={() => toggleSort("stage")} />
                <SortableHeader label="Created" active={sortKey === "created"} dir={sortDir} onClick={() => toggleSort("created")} />
                <th className="w-10 px-2" />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const checked = selectedIds.has(row.id);
                const isActive = activeId === row.id;
                return (
                  <tr
                    key={row.id}
                    className={
                      "group border-b transition-colors " +
                      (isActive ? "bg-primary/5" : "hover:bg-muted/30")
                    }
                  >
                    <td className="px-3 py-2 align-middle">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelect(row.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${fullName(row)}`}
                        className="size-3.5 rounded border-border"
                      />
                    </td>
                    {/* Name — opens panel on click; inline edit by clicking the pencil icon (small affordance) */}
                    <td
                      className="px-2 py-2 align-middle whitespace-nowrap min-w-[200px] cursor-pointer"
                      onClick={() => setActiveId(row.id)}
                    >
                      <div className="flex items-center gap-2">
                        <Avatar name={fullName(row)} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {fullName(row)}
                          </p>
                          {row.badges.length > 0 ? (
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {row.badges.map((b) => (
                                <span
                                  key={b}
                                  className="inline-flex items-center rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300"
                                >
                                  {b}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    {/* Editable cells */}
                    <EditableTextCell
                      row={row}
                      field="email"
                      type="email"
                      placeholder="—"
                      value={row.email ?? ""}
                      isEditing={edit?.contactId === row.id && edit.field === "email"}
                      onStartEdit={() => setEdit({ contactId: row.id, field: "email" })}
                      onCancel={() => setEdit(null)}
                      onCommit={async (value) => {
                        setEdit(null);
                        if (value === (row.email ?? "")) return;
                        await saveEdit({ contactId: row.id, field: "email" }, value);
                      }}
                      flash={flash}
                    />
                    <EditableTextCell
                      row={row}
                      field="phone"
                      type="tel"
                      placeholder="—"
                      value={row.phone ?? ""}
                      isEditing={edit?.contactId === row.id && edit.field === "phone"}
                      onStartEdit={() => setEdit({ contactId: row.id, field: "phone" })}
                      onCancel={() => setEdit(null)}
                      onCommit={async (value) => {
                        setEdit(null);
                        if (value === (row.phone ?? "")) return;
                        await saveEdit({ contactId: row.id, field: "phone" }, value);
                      }}
                      flash={flash}
                    />
                    <StageCell
                      row={row}
                      stageOptions={stageOptions}
                      isEditing={edit?.contactId === row.id && edit.field === "status"}
                      onStartEdit={() => setEdit({ contactId: row.id, field: "status" })}
                      onCancel={() => setEdit(null)}
                      onCommit={async (value) => {
                        setEdit(null);
                        if (value === row.status) return;
                        await saveEdit({ contactId: row.id, field: "status" }, value);
                      }}
                      flash={flash}
                    />
                    <td className="px-2 py-2 align-middle whitespace-nowrap text-xs text-muted-foreground">
                      {formatDate(row.createdAt)}
                    </td>
                    <td className="px-2 py-2 align-middle">
                      {/* Chevron navigates to the full record page;
                          row body click still opens the slide-out
                          panel (see name cell). The two paths differ:
                          panel = quick glance, full page = focused
                          editing across all tabs. */}
                      <Link
                        href={`/contacts/${row.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label={`Open full record for ${fullName(row)}`}
                      >
                        <ChevronRight className="size-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {activeContact ? (
        <ContactSidePanel
          contact={activeContact}
          activity={activityByContact[activeContact.id] ?? []}
          deals={dealsByContact[activeContact.id] ?? []}
          notes={notesByContact[activeContact.id] ?? []}
          contactLabelSingular={contactLabelSingular}
          contactLabelPlural={contactLabelPlural}
          onClose={() => setActiveId(null)}
        />
      ) : null}
    </>
  );
}

function sortValue(row: ContactRow, key: SortKey): string {
  switch (key) {
    case "name":
      return fullName(row).toLowerCase();
    case "email":
      return (row.email ?? "").toLowerCase();
    case "phone":
      return (row.phone ?? "").toLowerCase();
    case "stage":
      return row.status.toLowerCase();
    case "created":
      return row.createdAt;
  }
}

/* ──────────────────────── sortable column header ──────────────────────── */

function SortableHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <th className="px-2 py-2 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <button
        type="button"
        onClick={onClick}
        className={
          "inline-flex items-center gap-1 transition-colors hover:text-foreground " +
          (active ? "text-foreground" : "")
        }
      >
        <span>{label}</span>
        {active && dir === "asc" ? (
          <ArrowUp className="size-3" />
        ) : active && dir === "desc" ? (
          <ArrowDown className="size-3" />
        ) : (
          <ArrowUpDown className="size-3 opacity-50" />
        )}
      </button>
    </th>
  );
}

/* ──────────────────────── inline-editable cells ──────────────────────── */

function EditableTextCell({
  row,
  field,
  type,
  placeholder,
  value,
  isEditing,
  onStartEdit,
  onCancel,
  onCommit,
  flash,
}: {
  row: ContactRow;
  field: "email" | "phone";
  type: string;
  placeholder: string;
  value: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancel: () => void;
  onCommit: (value: string) => void | Promise<void>;
  flash: EditFlash | null;
}) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isEditing) {
      setDraft(value);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing, value]);

  const fieldFlash =
    flash && flash.contactId === row.id && flash.field === field ? flash : null;

  if (isEditing) {
    return (
      <td className="px-2 py-1.5 align-middle whitespace-nowrap min-w-[160px]">
        <input
          ref={inputRef}
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onCommit(draft.trim())}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onCommit(draft.trim());
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </td>
    );
  }

  const display = value || placeholder;
  const Icon = field === "email" ? Mail : Phone;

  return (
    <td
      className="px-2 py-2 align-middle whitespace-nowrap min-w-[160px] cursor-text"
      onClick={onStartEdit}
    >
      <span
        className={
          "inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-xs transition-colors " +
          (value
            ? "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            : "text-muted-foreground/60 hover:bg-muted/50")
        }
      >
        <Icon className="size-3 opacity-50" />
        <span>{display}</span>
        {fieldFlash?.status === "saving" ? (
          <span className="ml-1 text-[10px] text-muted-foreground">saving…</span>
        ) : fieldFlash?.status === "error" ? (
          <span className="ml-1 text-[10px] text-destructive" title={fieldFlash.error}>
            error
          </span>
        ) : null}
      </span>
    </td>
  );
}

function StageCell({
  row,
  stageOptions,
  isEditing,
  onStartEdit,
  onCancel,
  onCommit,
  flash,
}: {
  row: ContactRow;
  stageOptions: string[];
  isEditing: boolean;
  onStartEdit: () => void;
  onCancel: () => void;
  onCommit: (value: string) => void | Promise<void>;
  flash: EditFlash | null;
}) {
  const selectRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    if (isEditing) {
      selectRef.current?.focus();
    }
  }, [isEditing]);

  const fieldFlash =
    flash && flash.contactId === row.id && flash.field === "status" ? flash : null;

  if (isEditing) {
    return (
      <td className="px-2 py-1.5 align-middle whitespace-nowrap min-w-[140px]">
        <select
          ref={selectRef}
          defaultValue={row.status}
          onBlur={(e) => onCommit(e.target.value)}
          onChange={(e) => onCommit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          {/* Show the union of canonical stages + soul-defined stages so
              the operator can rotate between them. */}
          {Array.from(
            new Set(["lead", "prospect", "customer", "active", "won", "lost", "inactive", ...stageOptions, row.status])
          ).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </td>
    );
  }

  const style = stageStyle(row.status);

  return (
    <td
      className="px-2 py-2 align-middle whitespace-nowrap min-w-[140px] cursor-pointer"
      onClick={onStartEdit}
    >
      <span
        className={
          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset " +
          `${style.bg} ${style.text} ${style.ring}`
        }
      >
        <span className={`size-1.5 rounded-full ${style.dot}`} />
        {row.status}
        {fieldFlash?.status === "saving" ? (
          <span className="ml-0.5 text-[10px] opacity-70">…</span>
        ) : null}
      </span>
    </td>
  );
}

/* ──────────────────────── side panel ──────────────────────── */

function ContactSidePanel({
  contact,
  activity,
  deals,
  notes,
  contactLabelSingular,
  contactLabelPlural,
  onClose,
}: {
  contact: ContactRow;
  activity: ActivityItem[];
  deals: DealLink[];
  notes: NoteItem[];
  contactLabelSingular: string;
  contactLabelPlural: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"overview" | "activity" | "deals" | "notes">("overview");
  const style = stageStyle(contact.status);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      {/* Panel */}
      <aside
        role="dialog"
        aria-label={`${contactLabelSingular} detail`}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[420px] flex-col border-l bg-card text-card-foreground shadow-(--shadow-modal) animate-in slide-in-from-right duration-200"
      >
        {/* Open-full-record handoff: explicit affordance at the top
            of the panel so operators learn the panel is the quick
            view and the full record page is for sustained editing. */}
        <div className="flex items-center justify-between gap-2 border-b px-5 py-2 text-[11px]">
          <span className="text-muted-foreground">Quick view</span>
          <Link
            href={`/contacts/${contact.id}`}
            className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
          >
            Open full record →
          </Link>
        </div>
        <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar name={fullName(contact)} large />
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-foreground">
                {fullName(contact)}
              </h2>
              <span
                className={
                  "mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset " +
                  `${style.bg} ${style.text} ${style.ring}`
                }
              >
                <span className={`size-1.5 rounded-full ${style.dot}`} />
                {contact.status}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </header>

        <nav className="flex shrink-0 gap-1 border-b px-3 py-2 text-xs">
          {[
            { key: "overview", label: "Overview" },
            { key: "activity", label: `Activity${activity.length ? ` (${activity.length})` : ""}` },
            { key: "deals", label: `Deals${deals.length ? ` (${deals.length})` : ""}` },
            { key: "notes", label: `Notes${notes.length ? ` (${notes.length})` : ""}` },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key as typeof tab)}
              className={
                "rounded-md px-2.5 py-1.5 font-medium transition-colors " +
                (tab === t.key
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground")
              }
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {tab === "overview" ? (
            <OverviewTab contact={contact} />
          ) : tab === "activity" ? (
            <ActivityTab activity={activity} />
          ) : tab === "deals" ? (
            <DealsTab deals={deals} contactLabelPlural={contactLabelPlural} />
          ) : (
            <NotesTab notes={notes} />
          )}
        </div>

        <footer className="border-t px-5 py-3 text-[11px] text-muted-foreground">
          Created {formatDate(contact.createdAt)} · Updated {relativeFromNow(contact.updatedAt)}
        </footer>
      </aside>
    </>
  );
}

function OverviewTab({ contact }: { contact: ContactRow }) {
  const fields: Array<{ label: string; value: string | null; icon?: React.ReactNode }> = [
    { label: "Email", value: contact.email, icon: <Mail className="size-3.5 text-muted-foreground" /> },
    { label: "Phone", value: contact.phone, icon: <Phone className="size-3.5 text-muted-foreground" /> },
    { label: "Source", value: contact.source ?? null },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Contact info
        </h3>
        <dl className="space-y-2">
          {fields.map((f) => (
            <div key={f.label} className="flex items-start gap-2">
              {f.icon ? <div className="mt-1">{f.icon}</div> : <div className="size-3.5" />}
              <div className="min-w-0 flex-1">
                <dt className="text-[11px] text-muted-foreground">{f.label}</dt>
                <dd className="truncate text-sm text-foreground">{f.value || "—"}</dd>
              </div>
            </div>
          ))}
        </dl>
      </div>

      <div>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Quick actions
        </h3>
        <div className="flex flex-col gap-2">
          {contact.email ? (
            <a
              href={`mailto:${contact.email}`}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground hover:bg-muted/50"
            >
              <Mail className="size-3.5" />
              Email
            </a>
          ) : null}
          {contact.phone ? (
            <a
              href={`tel:${contact.phone}`}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground hover:bg-muted/50"
            >
              <Phone className="size-3.5" />
              Call
            </a>
          ) : null}
          <Link
            href={`/contacts/${contact.id}`}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Open full record →
          </Link>
        </div>
      </div>
    </div>
  );
}

function ActivityTab({ activity }: { activity: ActivityItem[] }) {
  if (activity.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No activity yet.</p>
    );
  }
  return (
    <ol className="space-y-3 border-l border-border pl-4">
      {activity.map((item) => (
        <li key={item.id} className="relative">
          <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary ring-4 ring-card" />
          <div className="text-xs text-muted-foreground">{relativeFromNow(item.occurredAt)}</div>
          <p className="text-sm text-foreground">
            {item.subject || activityTypeLabel(item.type)}
          </p>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
            {activityTypeLabel(item.type)}
          </p>
        </li>
      ))}
    </ol>
  );
}

function activityTypeLabel(type: string): string {
  switch (type) {
    case "booking":
      return "Booking";
    case "intake_submission":
      return "Intake submission";
    case "email":
      return "Email";
    case "task":
      return "Task";
    case "note":
      return "Note";
    case "call":
      return "Call";
    default:
      return type.replace(/_/g, " ");
  }
}

function DealsTab({
  deals,
  contactLabelPlural,
}: {
  deals: DealLink[];
  contactLabelPlural: string;
}) {
  if (deals.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No deals linked to this {contactLabelPlural.toLowerCase().replace(/s$/, "")}.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {deals.map((d) => (
        <li key={d.id}>
          <Link
            href={`/deals/${d.id}`}
            className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background/50 p-3 transition-colors hover:bg-muted/50"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{d.title}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{d.stage}</p>
            </div>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              ${Number(d.value || 0).toLocaleString()}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function NotesTab({ notes }: { notes: NoteItem[] }) {
  if (notes.length === 0) {
    return <p className="text-sm text-muted-foreground">No notes yet.</p>;
  }
  return (
    <ul className="space-y-3">
      {notes.map((n) => (
        <li key={n.id} className="rounded-lg border border-border bg-background/50 p-3">
          <p className="text-xs text-muted-foreground">{relativeFromNow(n.createdAt)}</p>
          <p className="mt-1 whitespace-pre-line text-sm text-foreground">{n.body}</p>
        </li>
      ))}
    </ul>
  );
}

/* ──────────────────────── empty state ──────────────────────── */

function ContactsEmptyState({
  csvImportHref,
  newContactHref,
}: {
  csvImportHref: string;
  newContactHref: string;
}) {
  return (
    <div className="rounded-xl border bg-card text-card-foreground p-12">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
        <div className="relative">
          <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Users className="size-7 text-primary" />
          </div>
          <span className="absolute -right-1 -top-1 inline-flex size-5 items-center justify-center rounded-full bg-card ring-4 ring-card text-base">
            ✨
          </span>
        </div>
        <div className="space-y-1.5">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            No clients yet
          </h3>
          <p className="text-sm text-muted-foreground">
            Clients appear here when someone books a call or submits an intake form. You
            can also add them manually or import a CSV.
          </p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Link
            href={newContactHref}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Users className="size-4" />
            Add your first client
          </Link>
          <Link
            href={csvImportHref}
            className="text-xs text-muted-foreground underline-offset-4 hover:underline hover:text-foreground"
          >
            Or import from CSV
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────── avatar ──────────────────────── */

function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s.charAt(0).toUpperCase())
    .join("");
  // Hash the name to pick a deterministic accent so each contact has a
  // stable color across renders.
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const palettes = [
    "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  ];
  const accent = palettes[Math.abs(hash) % palettes.length];
  return (
    <div
      className={
        "shrink-0 inline-flex items-center justify-center rounded-full font-semibold " +
        accent +
        " " +
        (large ? "size-10 text-sm" : "size-7 text-[10px]")
      }
      aria-hidden
    >
      {initials || "·"}
    </div>
  );
}
