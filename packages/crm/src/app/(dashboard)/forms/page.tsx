import Link from "next/link";
import { CheckCircle2, FileText, Eye, ListTodo } from "lucide-react";
import { listForms } from "@/lib/forms/actions";
import { getLabels } from "@/lib/soul/labels";
import { getOrgId } from "@/lib/auth/helpers";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { FormsPageActions } from "@/components/forms/forms-page-actions";

/*
  Square UI class reference (source of truth):
  - templates/dashboard-2/components/dashboard/welcome-section.tsx
    - title: "text-lg sm:text-[22px] font-semibold leading-relaxed"
    - helper copy: "text-sm sm:text-base text-muted-foreground"
  - templates/dashboard-2/components/dashboard/deals-table.tsx
    - card/list shell: "rounded-xl border bg-card"
*/

export default async function FormsPage() {
  const [labels, forms, orgId] = await Promise.all([getLabels(), listForms(), getOrgId()]);
  const [org] = orgId ? await db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, orgId)).limit(1) : [null];
  const orgSlug = org?.slug ?? "";

  const stats = [
    {
      title: "Total Forms",
      value: String(forms.length),
      change: "+0",
      icon: FileText,
    },
    {
      title: "Active Forms",
      value: String(forms.filter((form) => form.isActive).length),
      change: "+0",
      icon: CheckCircle2,
    },
    {
      title: "Draft Forms",
      value: String(forms.filter((form) => !form.isActive).length),
      change: "+0",
      icon: Eye,
    },
    {
      title: "Submissions",
      value: "0",
      change: "+0",
      icon: ListTodo,
    },
  ] as const;

  return (
    <section className="animate-page-enter space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{labels.intakeForm.plural}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Submissions become {labels.contact.plural.toLowerCase()} in your CRM automatically.
          </p>
        </div>
        <FormsPageActions buttonLabel={`+ New ${labels.intakeForm.singular}`} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.title} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{stat.title}</p>
                <p className="text-2xl font-medium text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.change} vs last month</p>
              </div>
              <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted shrink-0">
                <stat.icon className="size-5 text-muted-foreground" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {forms.length === 0 ? (
        <article className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="size-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <FileText className="size-7 text-muted-foreground" />
            </div>
            <h3 className="font-medium text-lg mb-1">Create your first intake form</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Submissions become {labels.contact.plural.toLowerCase()} in your CRM automatically.
            </p>
            <div className="mt-5">
              <FormsPageActions buttonLabel={`+ New ${labels.intakeForm.singular}`} />
            </div>
          </div>
        </article>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-b">
            <div>
              <h3 className="font-medium text-base">Your forms</h3>
              <p className="text-xs text-muted-foreground">Create, edit, and preview the forms your clients will actually complete.</p>
            </div>
            <FormsPageActions buttonLabel={`+ New ${labels.intakeForm.singular}`} />
          </div>

          <div className="hidden sm:grid grid-cols-[1fr_120px_140px_220px] gap-4 px-4 py-3 border-b bg-muted/50 text-xs font-medium text-muted-foreground">
            <span>Name</span>
            <span>Status</span>
            <span>Submissions</span>
            <span>Actions</span>
          </div>

          <div className="divide-y">
            {forms.map((form) => (
              <div key={form.id} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_120px_140px_220px] gap-2 sm:gap-4 px-4 py-3 hover:bg-accent/50 transition-colors items-center">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{form.name}</p>
                  <p className="text-xs text-muted-foreground sm:hidden">/{form.slug}</p>
                </div>
                <span
                  className={`rounded-full border px-2 py-1 text-xs w-fit ${
                    form.isActive
                      ? "border-positive/20 bg-positive/10 text-positive"
                      : "border-caution/20 bg-caution/10 text-caution"
                  }`}
                >
                  {form.isActive ? "Published" : "Draft"}
                </span>
                <span className="hidden sm:block text-sm text-muted-foreground">0</span>
                <div className="hidden sm:flex items-center gap-2">
                  <Link href={`/forms/${form.id}/edit`} className="crm-button-primary h-9 px-4 text-xs">
                    Edit form
                  </Link>
                  <Link href={`/forms/${orgSlug}/${form.slug}`} target="_blank" rel="noopener noreferrer" className="crm-button-secondary h-9 px-4 text-xs">
                    Preview
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
