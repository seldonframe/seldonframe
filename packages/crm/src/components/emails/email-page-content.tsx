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
  body: string;
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

type EmailIntegrationsState = {
  // 2026-05-18 (later) — fromEmail + fromName captured at connect
  // time. Without a verified from-address Resend rejects every send
  // with "domain not verified". Was the cause of silent booking
  // confirmation failures even after the dispatcher was wired.
  resend: { connected: boolean; maskedKey: string; fromEmail: string; fromName: string };
  // 2026-05-18 — Twilio surfaced alongside Resend because the
  // /clients/:slug/ready marketing CTA mentions "Email + SMS Drip"
  // and routes operators to /emails. Before this prop, /emails had
  // no Twilio surface and operators had to wander to
  // /settings/integrations to connect SMS.
  twilio: {
    connected: boolean;
    accountSid: string;
    fromNumber: string;
    authTokenHint: string;
  };
  newsletter: {
    kit: { connected: boolean; maskedKey: string };
    mailchimp: { connected: boolean; maskedKey: string };
    beehiiv: { connected: boolean; maskedKey: string };
  };
};

function statusBadge(status: string) {
  const s = status.toLowerCase();

  if (s === "sent" || s === "delivered") {
    return "border-positive/20 bg-positive/10 text-positive";
  }

  if (s === "draft" || s === "queued" || s === "pending") {
    return "border-caution/20 bg-caution/10 text-caution";
  }

  if (s === "failed" || s === "bounced") {
    return "border-negative/20 bg-negative/10 text-negative";
  }

  return "border-border bg-muted/50 text-muted-foreground";
}

export function EmailPageContent({
  templates,
  sent,
  createTemplateAction,
  emailIntegrations,
  saveIntegrationAction,
  disconnectIntegrationAction,
  newLeadsLast30Days = 0,
}: {
  templates: TemplateRow[];
  sent: SentRow[];
  createTemplateAction: (formData: FormData) => Promise<void>;
  emailIntegrations: EmailIntegrationsState;
  saveIntegrationAction: (formData: FormData) => Promise<void>;
  disconnectIntegrationAction: (formData: FormData) => Promise<void>;
  /** 2026-05-18 (messaging-layer slice 1) — count of contacts with
   *  an email created in the last 30 days. Used as a proxy for
   *  "leads synced to newsletter" — every contact_created event in
   *  this window fires syncContactToNewsletter for any connected
   *  provider. Shown per-provider when connected so operators can
   *  see the integration is actually working. */
  newLeadsLast30Days?: number;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("templates");
  const [showCreate, setShowCreate] = useState(false);
  const [triggerEventInput, setTriggerEventInput] = useState("");
  const [triggerEventError, setTriggerEventError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [previewTemplate, setPreviewTemplate] = useState<TemplateRow | null>(null);
  const [editTemplate, setEditTemplate] = useState<TemplateRow | null>(null);

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
          <article className="rounded-xl border bg-card p-5 space-y-4">
            <div>
              <h3 className="text-base font-medium text-foreground">Newsletter Connections</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                When connected, every new lead from a booking or intake form
                is added to your list automatically. You keep your newsletter
                tool; SeldonFrame doesn't store subscribers.
              </p>
            </div>

            {/* 2026-05-18 (messaging-layer slice 1) — surface the
                sync activity so operators know the integration is
                actually working. Until this banner shipped, operators
                connected Kit and had no signal anything was happening. */}
            {newLeadsLast30Days > 0 ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
                <p className="text-xs text-foreground">
                  <span className="font-medium">{newLeadsLast30Days}</span>{" "}
                  new lead{newLeadsLast30Days === 1 ? "" : "s"} captured in
                  the last 30 days
                  {[
                    emailIntegrations.newsletter.kit.connected ? "Kit" : null,
                    emailIntegrations.newsletter.mailchimp.connected ? "Mailchimp" : null,
                    emailIntegrations.newsletter.beehiiv.connected ? "Beehiiv" : null,
                  ].filter(Boolean).length > 0 ? (
                    <>
                      {" "}
                      — relayed automatically to{" "}
                      {[
                        emailIntegrations.newsletter.kit.connected ? "Kit" : null,
                        emailIntegrations.newsletter.mailchimp.connected ? "Mailchimp" : null,
                        emailIntegrations.newsletter.beehiiv.connected ? "Beehiiv" : null,
                      ]
                        .filter(Boolean)
                        .join(" + ")}
                      .
                    </>
                  ) : (
                    <>. Connect a provider below to start syncing them automatically.</>
                  )}
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-3">
              {[
                { id: "kit", title: "Kit", placeholder: "Kit API key", state: emailIntegrations.newsletter.kit },
                { id: "mailchimp", title: "Mailchimp", placeholder: "Mailchimp API key", state: emailIntegrations.newsletter.mailchimp },
                { id: "beehiiv", title: "Beehiiv", placeholder: "Beehiiv API key", state: emailIntegrations.newsletter.beehiiv },
              ].map((provider) => (
                <div key={provider.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{provider.title}</p>
                    {provider.state.connected ? (
                      <span className="rounded-full border border-positive/30 bg-positive/10 px-2 py-0.5 text-[11px] text-positive">Connected</span>
                    ) : null}
                  </div>

                  {provider.state.connected ? (
                    <div className="space-y-2">
                      <p className="text-xs font-mono text-muted-foreground">{provider.state.maskedKey}</p>
                      {/* When connected, the cross-system message above
                          already summarises sync activity. Keep this card
                          minimal — just the masked key + disconnect. */}
                      <form action={disconnectIntegrationAction}>
                        <input type="hidden" name="service" value={provider.id} />
                        <button type="submit" className="crm-button-secondary h-9 px-4 text-xs w-full">Disconnect</button>
                      </form>
                    </div>
                  ) : (
                    <form action={saveIntegrationAction} className="space-y-2">
                      <input type="hidden" name="service" value={provider.id} />
                      <input className="crm-input h-10 w-full px-3" placeholder={provider.placeholder} name="apiKey" type="password" required />
                      <button type="submit" className="crm-button-secondary h-9 px-4 text-xs w-full">Connect</button>
                    </form>
                  )}
                </div>
              ))}
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <div>
                <h4 className="text-sm font-medium text-foreground">Transactional Email (Resend)</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Bring your own Resend API key for outbound transactional email. The from-address MUST be on a domain you've verified in Resend, otherwise sends are rejected.
                </p>
              </div>

              {emailIntegrations.resend.connected ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full border border-positive/30 bg-positive/10 px-2 py-0.5 text-[11px] text-positive">Connected</span>
                    <p className="text-xs font-mono text-muted-foreground">{emailIntegrations.resend.maskedKey}</p>
                  </div>
                  {/* 2026-05-18 — surface the from-address back to the
                      operator + let them edit it without disconnecting.
                      Empty fromEmail is the silent-failure footgun —
                      Resend rejects sends from hello@seldonframe.local
                      (our fallback) so the operator sees no email arrive
                      but no error in the dashboard either. Highlighting
                      the input red when empty makes the gap visible. */}
                  <form action={saveIntegrationAction} className="space-y-2">
                    <input type="hidden" name="service" value="resend" />
                    <div className="space-y-1">
                      <label htmlFor="resend-from-email" className="text-xs text-muted-foreground">
                        From email <span className="text-negative">*</span>
                      </label>
                      <input
                        id="resend-from-email"
                        className={`crm-input h-10 w-full px-3 ${emailIntegrations.resend.fromEmail ? "" : "border-negative/40"}`}
                        name="fromEmail"
                        type="email"
                        defaultValue={emailIntegrations.resend.fromEmail}
                        placeholder="bookings@yourdomain.com"
                        required
                      />
                      {!emailIntegrations.resend.fromEmail ? (
                        <p className="text-[11px] text-negative">
                          No from-address set — every outbound email will fail at Resend. Save a verified address to fix.
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="resend-from-name" className="text-xs text-muted-foreground">From name (optional)</label>
                      <input
                        id="resend-from-name"
                        className="crm-input h-10 w-full px-3"
                        name="fromName"
                        defaultValue={emailIntegrations.resend.fromName}
                        placeholder="Roofs by Shiloh"
                      />
                    </div>
                    <button type="submit" className="crm-button-primary h-9 px-4 text-xs">Save from address</button>
                  </form>
                  <form action={disconnectIntegrationAction}>
                    <input type="hidden" name="service" value="resend" />
                    <button type="submit" className="crm-button-secondary h-9 px-4 text-xs">Disconnect Resend</button>
                  </form>
                </div>
              ) : (
                <form action={saveIntegrationAction} className="space-y-2">
                  <input type="hidden" name="service" value="resend" />
                  <input
                    className="crm-input h-10 w-full px-3"
                    name="apiKey"
                    placeholder="Resend API key (re_xxxxxxxxx)"
                    type="password"
                    required
                  />
                  <input
                    className="crm-input h-10 w-full px-3"
                    name="fromEmail"
                    type="email"
                    placeholder="From email (bookings@yourverifieddomain.com)"
                    required
                  />
                  <input
                    className="crm-input h-10 w-full px-3"
                    name="fromName"
                    placeholder="From name (e.g. Roofs by Shiloh) — optional"
                  />
                  {/* 2026-05-18 — button is labelled "Save & Connect"
                      (not just "Connect") because it's the SAVE button
                      for the API key + from-email + from-name combo.
                      Operator feedback: previous "Connect Resend"
                      label felt like it wouldn't persist the form. */}
                  <button type="submit" className="crm-button-primary h-10 px-4 text-sm">Save &amp; Connect Resend</button>
                </form>
              )}
            </div>

            {/* 2026-05-18 — Transactional SMS (Twilio) block. Mirrors
                the Resend block above but takes the three Twilio
                fields (Account SID, Auth Token, From Number). Routes
                through the same saveIntegrationAction with
                service="twilio" — the server-side updateIntegration
                already knows how to handle Twilio. */}
            <div className="rounded-lg border p-4 space-y-3">
              <div>
                <h4 className="text-sm font-medium text-foreground">Transactional SMS (Twilio)</h4>
                <p className="mt-1 text-xs text-muted-foreground">Bring your own Twilio credentials for outbound SMS (booking confirmations, 24h reminders, intake auto-replies).</p>
              </div>

              {emailIntegrations.twilio.connected ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full border border-positive/30 bg-positive/10 px-2 py-0.5 text-[11px] text-positive">Connected</span>
                    <p className="text-xs font-mono text-muted-foreground">
                      {emailIntegrations.twilio.fromNumber || emailIntegrations.twilio.accountSid}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Account SID: <span className="font-mono text-foreground">{emailIntegrations.twilio.accountSid}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    From: <span className="font-mono text-foreground">{emailIntegrations.twilio.fromNumber || "—"}</span> &nbsp;·&nbsp;
                    Auth token: <span className="font-mono text-foreground">{emailIntegrations.twilio.authTokenHint}</span>
                  </p>
                  <form action={disconnectIntegrationAction}>
                    <input type="hidden" name="service" value="twilio" />
                    <button type="submit" className="crm-button-secondary h-9 px-4 text-xs">Disconnect Twilio</button>
                  </form>
                </div>
              ) : (
                <form action={saveIntegrationAction} className="space-y-2">
                  <input type="hidden" name="service" value="twilio" />
                  <input className="crm-input h-10 w-full px-3" name="accountSid" placeholder="Twilio Account SID (ACxxxxxxxx)" required />
                  <input className="crm-input h-10 w-full px-3" name="authToken" placeholder="Twilio Auth Token" type="password" required />
                  <input className="crm-input h-10 w-full px-3" name="fromNumber" placeholder="From number (+15551234567)" required />
                  <button type="submit" className="crm-button-secondary h-9 px-4 text-xs">Connect Twilio</button>
                </form>
              )}

              {/* 2026-05-18 (later) — Twilio inbound webhook setup hint.
                  Without this, operators connect Twilio but inbound SMS
                  (customer replies to speed-to-lead, missed-call-text-back,
                  etc.) never reach the conversation engine — Twilio drops
                  the message or routes it through whatever default
                  handler is on the number. Confirmed by operator dogfood
                  2026-05-18: replies to the conversation opener returned
                  "We couldn't find your appointment. Please call us."
                  from some external handler because Twilio's webhook URL
                  wasn't pointed at our app.
                  Shown to BOTH connected + not-connected operators —
                  some connect via the form and forget the inbound side,
                  others connect via MCP / API and don't see the form
                  at all. Idempotent reading: hint is informational only. */}
              <div className="mt-3 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 space-y-2">
                <p className="text-xs font-medium text-foreground">
                  Inbound SMS setup (one-time, in Twilio Console)
                </p>
                <p className="text-xs text-muted-foreground">
                  After connecting your Twilio number above, point its inbound webhook at the URL below so customer replies reach your agents. Open the{" "}
                  <a
                    href="https://console.twilio.com/us1/develop/phone-numbers/manage/incoming"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-primary underline underline-offset-4"
                  >
                    Twilio Console
                  </a>
                  , click your number, find <span className="font-medium text-foreground">Messaging Configuration → A message comes in</span>, choose <span className="font-medium text-foreground">Webhook</span>, and paste:
                </p>
                <code className="block break-all rounded bg-background px-2 py-1.5 text-[11px] text-foreground border border-border">
                  https://app.seldonframe.com/api/webhooks/twilio/sms
                </code>
                <p className="text-[11px] text-muted-foreground">
                  Method: <span className="font-medium text-foreground">HTTP POST</span>. Leave the failover URL blank. Signature verification uses your saved auth token — no extra setup. STOP / HELP replies are auto-handled per carrier rules.
                </p>
              </div>
            </div>
          </article>

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
                    <button type="button" className="crm-button-secondary h-9 px-4 text-xs" onClick={() => setPreviewTemplate(tpl)}>Preview</button>
                    <button type="button" className="crm-button-ghost h-9 px-4 text-xs" onClick={() => setEditTemplate(tpl)}>Edit</button>
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
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusBadge(row.status)}`}>{row.status}</span>
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
                  {triggerEventError ? <p className="mt-1 text-xs text-negative">{triggerEventError}</p> : null}
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

      <Sheet open={Boolean(previewTemplate)} onOpenChange={(open) => !open && setPreviewTemplate(null)}>
        <SheetContent side="right" className="h-full w-full max-w-none border-0 bg-background p-0">
          <div className="h-full overflow-auto p-6">
            <div className="mx-auto w-full max-w-3xl space-y-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl font-medium text-foreground">Preview Template</h2>
                <button type="button" className="crm-button-ghost h-9 px-4" onClick={() => setPreviewTemplate(null)}>Close</button>
              </div>
              {previewTemplate ? (
                <article className="rounded-xl border bg-card p-6 space-y-3">
                  <p className="text-sm text-muted-foreground">{previewTemplate.name}</p>
                  <p className="text-lg font-medium text-foreground">{previewTemplate.subject}</p>
                  <pre className="rounded-lg border bg-background p-4 text-sm whitespace-pre-wrap">{previewTemplate.body}</pre>
                </article>
              ) : null}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={Boolean(editTemplate)} onOpenChange={(open) => !open && setEditTemplate(null)}>
        <SheetContent side="right" className="h-full w-full max-w-none border-0 bg-background p-0">
          <div className="h-full overflow-auto p-6">
            <div className="mx-auto w-full max-w-3xl space-y-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl font-medium text-foreground">Edit Template</h2>
                <button type="button" className="crm-button-ghost h-9 px-4" onClick={() => setEditTemplate(null)}>Close</button>
              </div>
              {editTemplate ? (
                <form className="rounded-xl border bg-card p-6 space-y-3" onSubmit={(event) => event.preventDefault()}>
                  <input className="crm-input h-10 w-full px-3" defaultValue={editTemplate.name} />
                  <input className="crm-input h-10 w-full px-3" defaultValue={editTemplate.subject} />
                  <textarea className="crm-input min-h-40 w-full p-3" defaultValue={editTemplate.body} />
                  <p className="text-xs text-muted-foreground">Editing is currently local preview only for framework templates.</p>
                </form>
              ) : null}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
