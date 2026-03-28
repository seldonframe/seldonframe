"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Copy, ExternalLink, FileText, Layout, Megaphone, Calendar } from "lucide-react";

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

  return "bg-amber-500/10 text-amber-300";
}

export function LandingPagesContent({
  pages,
  createAction,
}: {
  pages: PageRow[];
  createAction: (formData: FormData) => Promise<void>;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [pending, startTransition] = useTransition();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function handleTemplateClick() {
    setShowCreate(true);
  }

  function handleCopy(slug: string, id: string) {
    navigator.clipboard.writeText(`/p/${slug}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1200);
  }

  if (pages.length === 0 && !showCreate) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <p className="text-3xl">🚀</p>
          <h2 className="mt-3 text-xl font-medium text-foreground">Create your first landing page</h2>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Choose a template to get started.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {templates.map((tpl) => (
            <button
              key={tpl.key}
              type="button"
              className="glass-card rounded-2xl p-5 text-left transition hover:border-primary/30"
              onClick={() => handleTemplateClick()}
            >
              <div className="mb-3 inline-flex rounded-lg border border-primary/30 p-2 text-primary">
                {tpl.icon}
              </div>
              <p className="text-base font-medium text-foreground">{tpl.title}</p>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{tpl.description}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">{pages.length} page{pages.length !== 1 ? "s" : ""}</p>
        <button type="button" className="crm-button-primary h-10 px-6" onClick={() => setShowCreate(true)}>
          Create Page
        </button>
      </div>

      {pages.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pages.map((page) => (
            <article key={page.id} className="glass-card rounded-2xl p-5">
              <div className="mb-3 flex items-start justify-between gap-2">
                <h3 className="text-base font-medium text-foreground">{page.title}</h3>
                <span className={`rounded-full px-2 py-1 text-xs ${statusBadge(page.status)}`}>{page.status}</span>
              </div>

              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Last edited {new Date(page.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" })}
              </p>

              <div className="mt-4 flex gap-2">
                <Link href={`/landing/${page.id}`} className="crm-button-primary h-9 px-4 text-xs">
                  Edit
                </Link>
                <button
                  type="button"
                  className="crm-button-secondary h-9 px-4 text-xs"
                  onClick={() => handleCopy(page.slug, page.id)}
                >
                  <Copy className="mr-1 inline h-3 w-3" />
                  {copiedId === page.id ? "Copied" : "URL"}
                </button>
                {page.status === "published" ? (
                  <Link href={`/p/${page.slug}`} target="_blank" rel="noopener noreferrer" className="crm-button-ghost h-9 px-4 text-xs">
                    <ExternalLink className="mr-1 inline h-3 w-3" /> View
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {showCreate ? (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="Close panel"
            className="h-full flex-1 bg-[hsl(var(--muted-foreground)/0.45)]"
            onClick={() => setShowCreate(false)}
          />
          <aside className="h-full w-full max-w-md border-l border-[hsl(var(--border))] bg-[hsl(var(--background))] p-6 shadow-2xl">
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
                <label htmlFor="lp-title" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">Page title</label>
                <input id="lp-title" className="crm-input h-10 w-full px-3" name="title" placeholder="My Landing Page" required />
              </div>

              <div>
                <label htmlFor="lp-slug" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">URL slug</label>
                <input id="lp-slug" className="crm-input h-10 w-full px-3" name="slug" placeholder="my-landing-page" required />
              </div>

              <div className="pt-2">
                <button type="submit" className="crm-button-primary h-10 px-6" disabled={pending}>
                  {pending ? "Creating..." : "Create Page"}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
