import Link from "next/link";
import { CheckCircle2, FileText, Eye, ListTodo, Palette } from "lucide-react";
import { listForms } from "@/lib/forms/actions";
import { getLabels } from "@/lib/soul/labels";
import { getOrgId } from "@/lib/auth/helpers";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { FormsPageActions } from "@/components/forms/forms-page-actions";
// 2026-05-18 — surface the theme controls that govern intake form
// design (logo / colors / fonts) so operators don't think they need
// a separate visual editor. Theme already drives the Formbricks-style
// rendering of public intake forms; the gap was discoverability.
import { getThemeSettings } from "@/lib/theme/actions";

/*
  Square UI class reference (source of truth):
  - templates/dashboard-2/components/dashboard/welcome-section.tsx
    - title: "text-lg sm:text-[22px] font-semibold leading-relaxed"
    - helper copy: "text-sm sm:text-base text-muted-foreground"
  - templates/dashboard-2/components/dashboard/deals-table.tsx
    - card/list shell: "rounded-xl border bg-card"
*/

export default async function FormsPage() {
  const [labels, forms, orgId, themeSettings] = await Promise.all([
    getLabels(),
    listForms(),
    getOrgId(),
    getThemeSettings().catch(() => null),
  ]);
  const [org] = orgId ? await db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, orgId)).limit(1) : [null];
  const orgSlug = org?.slug ?? "";
  // 2026-05-18 — design callout state. We highlight EITHER "your
  // intake design is using the workspace theme — open Brand & Theme
  // to customize" (with a primary-color swatch + logo thumb when
  // available) OR a CTA when theme.logoUrl is empty.
  const themeLogoUrl = themeSettings?.theme.logoUrl ?? null;
  const themePrimary = themeSettings?.theme.primaryColor ?? "#0ea5e9";

  // v1.29.1 — show stats grid only when there's meaningful data.
  // Empty stats with "+0 vs last month" labels feel like dashboard
  // inflation. Hide them when the workspace has no forms yet — the
  // empty-state hero below carries the moment instead.
  const showStats = forms.length > 0;
  const stats = showStats
    ? ([
        { title: "Total", value: String(forms.length), icon: FileText },
        { title: "Published", value: String(forms.filter((f) => f.isActive).length), icon: CheckCircle2 },
        { title: "Draft", value: String(forms.filter((f) => !f.isActive).length), icon: Eye },
        { title: "Submissions", value: "0", icon: ListTodo },
      ] as const)
    : [];

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

      {/* 2026-05-18 — design customization callout. The Formbricks-style
          single-question-at-a-time rendering picks up logo / primary
          color / font from the workspace theme. We surface that here
          so operators don't think they need a separate visual editor.
          Clicking "Customize design" lands on /settings/branding for
          the logo; colors/fonts are changed by asking the copilot
          (update_theme) — every saved field cascades to all intake
          forms automatically. */}
      <Link
        href="/settings/branding"
        className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 hover:bg-accent/30 transition-colors"
      >
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${themePrimary}1a`, color: themePrimary }}
        >
          {themeLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={themeLogoUrl} alt="Workspace logo" className="size-8 rounded object-contain" />
          ) : (
            <Palette className="size-5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            {themeLogoUrl
              ? "Intake forms inherit your workspace theme"
              : "Make your intake forms beautiful"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {themeLogoUrl
              ? "Logo, primary color, and font cascade automatically. Tweak your logo in Branding, or ask the copilot to change colors."
              : "Upload a logo in Branding — or ask the copilot to change colors and fonts. Every intake form picks them up automatically."}
          </p>
        </div>
        <span className="text-xs font-medium text-foreground shrink-0">Customize design →</span>
      </Link>

      {showStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map((stat) => (
            <div key={stat.title} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{stat.title}</p>
                  <p className="text-2xl font-semibold text-foreground tabular-nums">{stat.value}</p>
                </div>
                <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted shrink-0">
                  <stat.icon className="size-4 text-muted-foreground" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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
