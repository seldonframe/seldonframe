import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Inbox, FileText, Mail, Phone, User } from "lucide-react";
import { db } from "@/db";
import { intakeForms } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { listIntakeSubmissions } from "@/lib/forms/actions";

/*
  Square UI class reference (source of truth):
  - templates/dashboard-2/components/dashboard/welcome-section.tsx
    - title: "text-lg sm:text-[22px] font-semibold leading-relaxed"
    - helper copy: "text-sm sm:text-base text-muted-foreground"
  - templates/dashboard-2/components/dashboard/deals-table.tsx
    - card/list shell: "rounded-xl border bg-card"
*/

function relativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const min = 60 * 1000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return "just now";
  if (diff < hr) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hr)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return date.toLocaleDateString();
}

function formatAnswerSummary(data: unknown, max = 3): string {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "—";
  const entries = Object.entries(data as Record<string, unknown>)
    .filter(([k]) => !["fullName", "name", "firstName", "email", "phone"].includes(k))
    .slice(0, max);
  if (entries.length === 0) return "—";
  return entries
    .map(([k, v]) => {
      const value = Array.isArray(v) ? v.join(", ") : String(v ?? "").slice(0, 60);
      return `${k}: ${value}`;
    })
    .join(" · ");
}

export default async function FormDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orgId = await getOrgId();

  if (!orgId) {
    notFound();
  }

  const [form] = await db
    .select()
    .from(intakeForms)
    .where(and(eq(intakeForms.orgId, orgId), eq(intakeForms.id, id)))
    .limit(1);

  if (!form) {
    notFound();
  }

  const submissions = await listIntakeSubmissions({ formId: form.id });
  const fields = Array.isArray(form.fields) ? form.fields : [];

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">
            {form.name}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage form fields, view submissions, and follow up with leads.
          </p>
        </div>
        <Link
          href={`/forms/${form.id}/edit`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
        >
          Edit fields
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Inbox className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Submissions</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-foreground">{submissions.length}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {submissions.length === 100 ? "(showing latest 100)" : "all-time"}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Fields</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-foreground">{fields.length}</p>
          <p className="text-xs text-muted-foreground mt-1">slug: <code className="font-mono">{form.slug}</code></p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Contacts created</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {submissions.filter((s) => s.contactId).length}
          </p>
          <p className="text-xs text-muted-foreground mt-1">auto-linked from email</p>
        </div>
      </div>

      {/* Submissions table */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-base font-semibold text-foreground">Recent submissions</h2>
          <p className="text-xs text-muted-foreground">
            Newest first · click a row to open the contact
          </p>
        </div>
        {submissions.length === 0 ? (
          <div className="p-8 text-center">
            <Inbox className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground">No submissions yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Share your form link, and submissions will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium">Contact</th>
                  <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Email</th>
                  <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Phone</th>
                  <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Snippet</th>
                  <th className="px-4 py-3 text-left font-medium">When</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => {
                  const fullName = [s.contactFirstName, s.contactLastName]
                    .filter(Boolean)
                    .join(" ")
                    .trim() || "(unnamed)";
                  const isNew = Date.now() - s.createdAt.getTime() < 24 * 60 * 60 * 1000;
                  return (
                    <tr
                      key={s.id}
                      className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {s.contactId ? (
                            <Link
                              href={`/contacts/${s.contactId}`}
                              className="font-medium text-foreground hover:underline"
                            >
                              {fullName}
                            </Link>
                          ) : (
                            <span className="font-medium text-muted-foreground">{fullName}</span>
                          )}
                          {isNew ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                              New
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                        {s.contactEmail ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5" />
                            <a
                              href={`mailto:${s.contactEmail}`}
                              className="hover:text-foreground hover:underline"
                            >
                              {s.contactEmail}
                            </a>
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                        {s.contactPhone ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5" />
                            <a
                              href={`tel:${s.contactPhone}`}
                              className="hover:text-foreground hover:underline"
                            >
                              {s.contactPhone}
                            </a>
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell max-w-xs truncate">
                        {formatAnswerSummary(s.data)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {relativeTime(s.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {s.contactId ? (
                          <Link
                            href={`/contacts/${s.contactId}`}
                            className="text-xs font-medium text-foreground hover:underline inline-flex items-center gap-1"
                          >
                            Open
                            <ChevronRight className="h-3 w-3" />
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground/60">no contact</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
