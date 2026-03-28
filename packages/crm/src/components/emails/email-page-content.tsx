"use client";

import { useState, useTransition } from "react";

type TemplateRow = {
  id: string;
  name: string;
  subject: string;
  tag: string | null;
};

type SentRow = {
  id: string;
  toEmail: string;
  subject: string;
  status: string;
  provider: string;
  sentAt: string | null;
};

type Tab = "templates" | "sent" | "settings";

function statusBadge(status: string) {
  const s = status.toLowerCase();

  if (s === "sent" || s === "delivered") {
    return "bg-primary/10 text-primary";
  }

  if (s === "queued" || s === "pending") {
    return "bg-amber-500/10 text-amber-300";
  }

  if (s === "failed" || s === "bounced") {
    return "bg-red-500/10 text-red-300";
  }

  return "bg-[hsl(var(--muted)/0.5)] text-[hsl(var(--muted-foreground))]";
}

export function EmailPageContent({
  templates,
  sent,
  createTemplateAction,
}: {
  templates: TemplateRow[];
  sent: SentRow[];
  createTemplateAction: (formData: FormData) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("templates");
  const [showCreate, setShowCreate] = useState(false);
  const [pending, startTransition] = useTransition();

  const tabs: { key: Tab; label: string }[] = [
    { key: "templates", label: `Templates (${templates.length})` },
    { key: "sent", label: `Sent (${sent.length})` },
  ];

  return (
    <>
      <div className="flex gap-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.35)] p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`rounded-md px-4 py-2 text-sm transition ${activeTab === tab.key ? "bg-primary/15 text-primary" : "text-[hsl(var(--muted-foreground))] hover:text-foreground"}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "templates" ? (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">{templates.length} template{templates.length !== 1 ? "s" : ""}</p>
            <button type="button" className="crm-button-primary h-10 px-6" onClick={() => setShowCreate(true)}>
              Create Template
            </button>
          </div>

          {templates.length === 0 ? (
            <article className="glass-card flex min-h-52 flex-col items-center justify-center rounded-2xl p-8 text-center">
              <p className="text-3xl">✉️</p>
              <p className="mt-3 text-lg font-medium text-foreground">Create your first email template</p>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Templates let you send consistent, personalized emails.</p>
              <button type="button" className="crm-button-primary mt-5 h-10 px-6" onClick={() => setShowCreate(true)}>
                Create Template
              </button>
            </article>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {templates.map((tpl) => (
                <article key={tpl.id} className="glass-card rounded-2xl p-5">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h3 className="text-base font-medium text-foreground">{tpl.name}</h3>
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">{tpl.tag || "general"}</span>
                  </div>
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">{tpl.subject}</p>
                  <div className="mt-4 flex gap-2">
                    <button type="button" className="crm-button-secondary h-9 px-4 text-xs">Edit</button>
                    <button type="button" className="crm-button-ghost h-9 px-4 text-xs">Duplicate</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {activeTab === "sent" ? (
        <section className="space-y-4">
          {sent.length === 0 ? (
            <article className="glass-card rounded-2xl p-6 text-sm text-[hsl(var(--muted-foreground))]">No sent emails yet.</article>
          ) : (
            <article className="glass-card overflow-hidden rounded-2xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                    <th className="px-4 py-3">To</th>
                    <th className="px-4 py-3">Subject</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Provider</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {sent.map((row) => (
                    <tr key={row.id} className="border-t border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/0.35)]">
                      <td className="px-4 py-3 text-foreground">{row.toEmail}</td>
                      <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">{row.subject}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs ${statusBadge(row.status)}`}>{row.status}</span>
                      </td>
                      <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">{row.provider}</td>
                      <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                        {row.sentAt ? new Date(row.sentAt).toLocaleDateString([], { month: "short", day: "numeric" }) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          )}
        </section>
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
              <h2 className="text-xl font-medium text-foreground">New email template</h2>
              <button type="button" className="crm-button-ghost h-9 px-4" onClick={() => setShowCreate(false)}>Close</button>
            </div>

            <form
              action={async (formData) => {
                startTransition(async () => {
                  await createTemplateAction(formData);
                  setShowCreate(false);
                });
              }}
              className="space-y-4"
            >
              <div>
                <label htmlFor="tpl-name" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">Template name</label>
                <input id="tpl-name" className="crm-input h-10 w-full px-3" name="name" placeholder="Welcome Email" required />
              </div>
              <div>
                <label htmlFor="tpl-tag" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">Tag</label>
                <input id="tpl-tag" className="crm-input h-10 w-full px-3" name="tag" placeholder="welcome" defaultValue="general" />
              </div>
              <div>
                <label htmlFor="tpl-subject" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">Subject</label>
                <input id="tpl-subject" className="crm-input h-10 w-full px-3" name="subject" placeholder="Welcome to {{businessName}}" required />
              </div>
              <div>
                <label htmlFor="tpl-body" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">Body</label>
                <textarea id="tpl-body" className="crm-input min-h-32 w-full p-3" name="body" placeholder="Hi {{firstName}}," required />
              </div>
              <div className="pt-2">
                <button type="submit" className="crm-button-primary h-10 px-6" disabled={pending}>
                  {pending ? "Saving..." : "Save Template"}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}
