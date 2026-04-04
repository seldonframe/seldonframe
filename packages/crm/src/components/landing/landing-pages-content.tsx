"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Copy, ExternalLink, FileText, Layout, Megaphone, Calendar } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";

/*
  Square UI class reference (source of truth):
  - templates/dashboard-2/components/dashboard/deals-table.tsx
    - section header row: "flex items-center justify-between border-b border-border px-5 py-3"
    - card/list shell: "rounded-xl border bg-card"
  - templates/tasks/components/tasks/filters/tasks-filters.tsx
    - control row spacing: "flex items-center justify-between gap-2 flex-wrap"
  - templates/dashboard-2/components/dashboard/welcome-section.tsx
    - helper copy: "text-sm sm:text-base text-muted-foreground"
*/

type PageRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  updatedAt: string;
};

type Template = {
  key: string;
  icon: React.ReactNode;
  title: string;
  description: string;
};

const templates: Template[] = [
  { key: "lead-capture", icon: <Megaphone className="h-6 w-6" />, title: "Lead Capture", description: "Hero + form + call-to-action" },
  { key: "service-overview", icon: <Layout className="h-6 w-6" />, title: "Service Overview", description: "Hero + features + testimonials + CTA" },
  { key: "booking-page", icon: <Calendar className="h-6 w-6" />, title: "Booking Page", description: "Hero + booking embed + FAQ" },
  { key: "blank", icon: <FileText className="h-6 w-6" />, title: "Blank", description: "Start from scratch" },
];

function statusBadge(status: string) {
  if (status === "published") {
    return "bg-primary/10 text-primary";
  }

  if (status === "draft") {
    return "bg-[hsl(var(--muted)/0.5)] text-[hsl(var(--muted-foreground))]";
  }

  return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

export function LandingPagesContent({
  pages,
  orgSlug,
  createAction,
}: {
  pages: PageRow[];
  orgSlug: string;
  createAction: (formData: FormData) => Promise<void>;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [pending, startTransition] = useTransition();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [draftMode, setDraftMode] = useState("soul-template");

  function handleTemplateClick() {
    setShowCreate(true);
  }

  function handleCopy(slug: string, id: string) {
    navigator.clipboard.writeText(`/l/${orgSlug}/${slug}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1200);
  }

  if (pages.length === 0 && !showCreate) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-sm">Create your first landing page</h3>
          </div>
          <p className="text-sm text-muted-foreground">Choose a template to get started.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {templates.map((tpl) => (
            <button
              key={tpl.key}
              type="button"
              className="p-4 rounded-xl border bg-card hover:bg-accent/50 transition-all cursor-pointer group text-left"
              onClick={() => handleTemplateClick()}
            >
              <div className="size-10 rounded-lg flex items-center justify-center mb-3 bg-muted">
                {tpl.icon}
              </div>
              <p className="font-medium text-sm truncate mb-0.5">{tpl.title}</p>
              <p className="text-xs text-muted-foreground">{tpl.description}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <p className="text-xs text-muted-foreground">{pages.length} page{pages.length !== 1 ? "s" : ""}</p>
          <button type="button" className="crm-button-primary h-9 px-6" onClick={() => setShowCreate(true)}>
            Create Page
          </button>
        </div>

        <div className="hidden sm:grid grid-cols-[1fr_120px_140px_180px] gap-4 px-4 py-3 border-b bg-muted/50 text-xs font-medium text-muted-foreground">
          <span>Name</span>
          <span>Status</span>
          <span>Last edited</span>
          <span>URL</span>
        </div>

        <div className="divide-y">
          {pages.map((page) => (
            <div key={page.id} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_120px_140px_180px] gap-2 sm:gap-4 px-4 py-3 hover:bg-accent/50 transition-colors items-center">
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{page.title}</p>
                <p className="text-xs text-muted-foreground sm:hidden">
                  {new Date(page.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                </p>
              </div>
              <div>
                <span className={`rounded-full px-2 py-1 text-xs ${statusBadge(page.status)}`}>{page.status}</span>
              </div>
              <span className="hidden sm:block text-sm text-muted-foreground">
                {new Date(page.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" })}
              </span>
              <div className="hidden sm:flex items-center gap-2 min-w-0">
                <span className="text-sm text-muted-foreground truncate">/l/{orgSlug}/{page.slug}</span>
                <button type="button" className="size-7 rounded-md border border-border hover:bg-accent inline-flex items-center justify-center" onClick={() => handleCopy(page.slug, page.id)}>
                  <Copy className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {pages.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {pages.map((page) => (
            <article key={page.id} className="p-4 rounded-xl border bg-card hover:bg-accent/50 transition-all cursor-pointer group">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-medium text-sm truncate mb-0.5">{page.title}</h3>
                <span className={`rounded-full px-2 py-1 text-xs ${statusBadge(page.status)}`}>{page.status}</span>
              </div>

              <p className="text-xs text-muted-foreground">
                Last edited {new Date(page.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground truncate">/l/{orgSlug}/{page.slug}</p>

              <div className="mt-3 flex gap-2">
                <Link href={`/landing/${page.id}`} className="crm-button-primary h-9 px-4 text-xs">
                  Edit
                </Link>
                <button
                  type="button"
                  className="crm-button-secondary h-9 px-4 text-xs"
                  onClick={() => handleCopy(page.slug, page.id)}
                >
                  <Copy className="mr-1 inline h-3 w-3" />
                  {copiedId === page.id ? "Copied" : "Copy URL"}
                </button>
                {page.status === "published" ? (
                  <Link href={`/l/${orgSlug}/${page.slug}`} target="_blank" rel="noopener noreferrer" className="crm-button-ghost h-9 px-4 text-xs">
                    <ExternalLink className="mr-1 inline h-3 w-3" /> View
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <Sheet open={showCreate} onOpenChange={setShowCreate}>
        <SheetContent side="right" className="h-full w-full max-w-none border-0 bg-background p-0">
          <div className="h-full overflow-auto p-6">
            <div className="mx-auto w-full max-w-3xl space-y-6">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-xl font-medium text-foreground">New landing page</h2>
                <button type="button" className="crm-button-ghost h-9 px-4" onClick={() => setShowCreate(false)}>
                  Close
                </button>
              </div>

              <form
                action={async (formData) => {
                  startTransition(async () => {
                    await createAction(formData);
                    setShowCreate(false);
                  });
                }}
                className="space-y-4"
              >
                <div>
                  <label htmlFor="lp-title" className="mb-1 block text-sm text-muted-foreground">Page title</label>
                  <input id="lp-title" className="crm-input h-9 w-full px-3" name="title" placeholder="My Landing Page" required />
                </div>

                <div>
                  <label htmlFor="lp-slug" className="mb-1 block text-sm text-muted-foreground">URL slug</label>
                  <input id="lp-slug" className="crm-input h-9 w-full px-3" name="slug" placeholder="my-landing-page" required />
                </div>

                <div>
                  <label htmlFor="lp-mode" className="mb-1 block text-sm text-muted-foreground">Start mode</label>
                  <select
                    id="lp-mode"
                    className="crm-input h-9 w-full px-3"
                    name="mode"
                    value={draftMode}
                    onChange={(event) => setDraftMode(event.target.value)}
                  >
                    <option value="soul-template">From Soul Template</option>
                    <option value="scratch">Blank</option>
                  </select>
                </div>

                {draftMode === "soul-template" ? (
                  <div>
                    <label htmlFor="lp-template" className="mb-1 block text-sm text-muted-foreground">Template preset</label>
                    <select id="lp-template" className="crm-input h-9 w-full px-3" name="template" defaultValue="lead-capture">
                      <option value="lead-capture">Lead Capture</option>
                      <option value="service-overview">Service Overview</option>
                      <option value="booking-page">Booking Page</option>
                      <option value="about-page">About Page</option>
                      <option value="contact-page">Contact Page</option>
                      <option value="blank">Blank Page</option>
                    </select>
                  </div>
                ) : null}

                <div className="pt-2">
                  <button type="submit" className="crm-button-primary h-9 px-6" disabled={pending}>
                    {pending ? "Creating..." : "Create Page"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
