"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { BUILT_IN_EVENT_TYPE_SUGGESTIONS, isValidEventType } from "@/lib/events/event-types";
import { Sheet, SheetContent } from "@/components/ui/sheet";

/*
  Square UI class reference (source of truth):
  - templates-baseui/emails/components/emails/emails-horizontal-nav.tsx
    - nav shell: "flex h-[54px] items-center border-b border-border bg-background px-3 md:px-4"
    - folder action button: "h-[30px] gap-1.5"
    - active folder state: "bg-muted text-foreground hover:bg-muted"
  - templates-baseui/emails/components/emails/email-list.tsx
    - list shell: "flex h-full flex-col overflow-hidden bg-card"
    - list header row: "flex items-center justify-between border-b border-border px-5 py-3"
    - row shell: "flex w-full gap-2.5 border-b border-border p-4 text-left transition-colors hover:bg-muted/70"
  - templates-baseui/emails/components/emails/emails-header.tsx
    - helper text: "text-xs text-muted-foreground"
*/

type TemplateRow = {
  id: string;
  name: string;
  subject: string;
  tag: string | null;
  triggerEvent: string | null;
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
    return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }

  if (s === "failed" || s === "bounced") {
    return "bg-red-500/10 text-red-700 dark:text-red-300";
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
  const [triggerEventInput, setTriggerEventInput] = useState("");
  const [triggerEventError, setTriggerEventError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const tabs: { key: Tab; label: string }[] = [
    { key: "templates", label: `Templates (${templates.length})` },
    { key: "sent", label: `Sent (${sent.length})` },
  ];

  return (
    <>
      <div className="flex h-[54px] items-center border-b border-border bg-background px-3 md:px-4">
        <div className="flex items-center gap-2.5 w-full">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`h-[30px] gap-1.5 rounded-md px-3 text-sm transition ${activeTab === tab.key ? "bg-muted text-foreground hover:bg-muted" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "templates" ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <p className="text-xs text-muted-foreground">{templates.length} template{templates.length !== 1 ? "s" : ""}</p>
            <button type="button" className="crm-button-primary h-10 px-6" onClick={() => setShowCreate(true)}>
              Create Template
            </button>
          </div>

          {templates.length === 0 ? (
            <article className="rounded-xl border bg-card flex min-h-52 flex-col items-center justify-center p-8 text-center">
              <p className="text-3xl">✉️</p>
              <p className="mt-3 text-lg font-medium text-foreground">Create your first email template</p>
              <p className="mt-1 text-xs text-muted-foreground">Templates let you send consistent, personalized emails.</p>
              <button type="button" className="crm-button-primary mt-5 h-10 px-6" onClick={() => setShowCreate(true)}>
                Create Template
              </button>
            </article>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {templates.map((tpl) => (
                <article key={tpl.id} className="rounded-xl border bg-card p-5">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h3 className="text-base font-medium text-foreground">{tpl.name}</h3>
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">{tpl.tag || "general"}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{tpl.subject}</p>
                  {tpl.triggerEvent ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Trigger: <span className="font-mono text-foreground">{tpl.triggerEvent}</span>
                    </p>
                  ) : null}
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
            <div className="flex h-full items-center justify-center bg-card rounded-xl border min-h-52">
              <div className="text-center text-muted-foreground">
                <p>No sent emails yet.</p>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col overflow-hidden bg-card rounded-xl border">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <div className="flex items-center gap-2">
                  <div className="size-3.5 rounded border border-border" />
                  <p className="text-sm font-medium text-foreground">Sent</p>
                </div>
                <p className="text-xs text-muted-foreground">{sent.length} email{sent.length !== 1 ? "s" : ""}</p>
              </div>

              <div className="flex-1 overflow-y-auto">
                {sent.map((row) => (
                  <div
                    key={row.id}
                    className="flex w-full gap-2.5 border-b border-border p-4 text-left transition-colors hover:bg-muted/70"
                  >
                    <div className="mt-1.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Mail className="size-3.5 text-muted-foreground" />
                    </div>

                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex-1 overflow-hidden">
                          <p className="truncate text-[14px] tracking-tight font-medium text-foreground">
                            {row.toEmail}
                          </p>
                          <p className="truncate text-[12px] tracking-tight text-muted-foreground">
                            {row.subject}
                          </p>
                        </div>
                        <p className="shrink-0 text-[12px] tracking-tight text-foreground">
                          {row.sentAt ? new Date(row.sentAt).toLocaleDateString([], { month: "short", day: "numeric" }) : "—"}
                        </p>
                      </div>

                      <div className="mt-1.5 flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusBadge(row.status)}`}>{row.status}</span>
                        <span className="text-[11px] text-muted-foreground">via {row.provider}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      ) : null}

      <Sheet open={showCreate} onOpenChange={setShowCreate}>
        <SheetContent side="right" className="h-full w-full max-w-none border-0 bg-background p-0">
          <div className="h-full overflow-auto p-6">
            <div className="mx-auto w-full max-w-3xl space-y-6">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-xl font-medium text-foreground">New email template</h2>
                <button type="button" className="crm-button-ghost h-9 px-4" onClick={() => setShowCreate(false)}>Close</button>
              </div>

              <form
                action={async (formData) => {
                  const triggerEvent = String(formData.get("triggerEvent") ?? "").trim().toLowerCase();

                  if (triggerEvent && !isValidEventType(triggerEvent)) {
                    setTriggerEventError("Trigger must use lowercase entity.action format.");
                    return;
                  }

                  setTriggerEventError(null);
                  startTransition(async () => {
                    await createTemplateAction(formData);
                    setShowCreate(false);
                    setTriggerEventInput("");
                  });
                }}
                className="space-y-4"
              >
                <div>
                  <label htmlFor="tpl-name" className="mb-1 block text-sm text-muted-foreground">Template name</label>
                  <input id="tpl-name" className="crm-input h-9 w-full px-3" name="name" placeholder="Welcome Email" required />
                </div>
                <div>
                  <label htmlFor="tpl-tag" className="mb-1 block text-sm text-muted-foreground">Tag</label>
                  <input id="tpl-tag" className="crm-input h-9 w-full px-3" name="tag" placeholder="welcome" defaultValue="general" />
                </div>
                <div>
                  <label htmlFor="tpl-subject" className="mb-1 block text-sm text-muted-foreground">Subject</label>
                  <input id="tpl-subject" className="crm-input h-9 w-full px-3" name="subject" placeholder="Welcome to {{businessName}}" required />
                </div>
                <div>
                  <label htmlFor="tpl-body" className="mb-1 block text-sm text-muted-foreground">Body</label>
                  <textarea id="tpl-body" className="crm-input min-h-32 w-full p-3" name="body" placeholder="Hi {{firstName}}," required />
                </div>
                <div>
                  <label htmlFor="tpl-trigger-event" className="mb-1 block text-sm text-muted-foreground">Trigger event (optional)</label>
                  <input
                    id="tpl-trigger-event"
                    className="crm-input h-9 w-full px-3"
                    name="triggerEvent"
                    value={triggerEventInput}
                    onChange={(event) => {
                      setTriggerEventInput(event.target.value);
                      if (triggerEventError) {
                        setTriggerEventError(null);
                      }
                    }}
                    list="email-template-trigger-suggestions"
                    placeholder="course.enrolled"
                  />
                  <datalist id="email-template-trigger-suggestions">
                    {BUILT_IN_EVENT_TYPE_SUGGESTIONS.map((eventType) => (
                      <option key={eventType} value={eventType} />
                    ))}
                  </datalist>
                  <p className="mt-1 text-xs text-muted-foreground">Uses lowercase entity.action format. Leave blank for manual sends only.</p>
                  {triggerEventError ? <p className="mt-1 text-xs text-red-700 dark:text-red-300">{triggerEventError}</p> : null}
                </div>
                <div className="pt-2">
                  <button type="submit" className="crm-button-primary h-10 px-6" disabled={pending}>
                    {pending ? "Saving..." : "Save Template"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
