import Link from "next/link";
import {
  testBeehiivConnectionAction,
  getIntegrationSettings,
  testKitConnectionAction,
  testMailchimpConnectionAction,
  testResendConnectionAction,
  testTwilioConnectionAction,
  updateIntegrationAction,
} from "@/lib/integrations/actions";

/*
  Square UI class reference (source of truth):
  - templates/dashboard-2/components/dashboard/welcome-section.tsx
    - title: "text-lg sm:text-[22px] font-semibold leading-relaxed"
    - helper copy: "text-sm sm:text-base text-muted-foreground"
  - templates/dashboard-2/components/dashboard/deals-table.tsx
    - card/list shell: "rounded-xl border bg-card"
*/

function renderConnectionBadge(connected: boolean) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
        connected
          ? "border-positive/20 bg-positive/10 text-positive"
          : "border-caution/20 bg-caution/10 text-caution"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${connected ? "bg-positive" : "bg-caution"}`}
        aria-hidden="true"
      />
      {connected ? "Connected" : "Not connected"}
    </span>
  );
}

export default async function IntegrationsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; service?: string; twilioTest?: string; resendTest?: string; kitTest?: string; mailchimpTest?: string; beehiivTest?: string; calendarConnected?: string }>;
}) {
  const params = await searchParams;
  const settings = await getIntegrationSettings();
  const googleCalendarConnectUrl = "/api/integrations/google-calendar?returnTo=%2Fsettings%2Fintegrations";

  if (!settings) {
    return null;
  }

  const savedMessage = params.saved === "1" && params.service ? `${params.service} settings saved` : null;
  const twilioTestMessage = params.twilioTest === "1" ? "Twilio connection successful" : params.twilioTest === "0" ? "Twilio connection failed" : null;
  const resendTestMessage = params.resendTest === "1" ? "Resend connection successful" : params.resendTest === "0" ? "Resend connection failed" : null;
  const kitTestMessage = params.kitTest === "1" ? "Kit connection successful" : params.kitTest === "0" ? "Kit connection failed" : null;
  const mailchimpTestMessage =
    params.mailchimpTest === "1" ? "Mailchimp connection successful" : params.mailchimpTest === "0" ? "Mailchimp connection failed" : null;
  const beehiivTestMessage =
    params.beehiivTest === "1" ? "Beehiiv connection successful" : params.beehiivTest === "0" ? "Beehiiv connection failed" : null;
  const calendarMessage =
    params.calendarConnected === "1"
      ? "Google Calendar connected"
      : params.calendarConnected === "0"
        ? "Google Calendar connection failed"
        : null;

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">Integrations</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Connect external services for SMS, email, and automation.</p>
        </div>
      </div>

      {savedMessage ? <p className="rounded-md border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">{savedMessage}</p> : null}
      {twilioTestMessage ? <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">{twilioTestMessage}</p> : null}
      {resendTestMessage ? <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">{resendTestMessage}</p> : null}
      {kitTestMessage ? <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">{kitTestMessage}</p> : null}
      {mailchimpTestMessage ? <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">{mailchimpTestMessage}</p> : null}
      {beehiivTestMessage ? <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">{beehiivTestMessage}</p> : null}
      {calendarMessage ? <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">{calendarMessage}</p> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-xl border bg-card p-5 xl:col-span-2 space-y-4">
          <div>
            <h2 className="text-card-title">Email</h2>
            <p className="mt-2 text-sm text-muted-foreground">SeldonFrame handles two kinds of email.</p>
          </div>

          <div className="rounded-lg border p-4 space-y-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground">AUTOMATIC EMAILS (BUILT IN)</p>
            <p className="text-sm text-muted-foreground">
              Welcome emails, session reminders, and follow-ups are sent automatically by SeldonFrame.
            </p>
            <p className="text-sm">Sending from: <span className="text-muted-foreground">noreply@seldonframe.com</span></p>
            <p className="text-xs text-muted-foreground">Self-hosted users can configure Resend in Developer/System settings.</p>
          </div>

          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground">YOUR NEWSLETTER / MARKETING</p>
            <p className="text-sm text-muted-foreground">
              Connect Kit, Mailchimp, or Beehiiv to sync new CRM contacts to your newsletter list automatically.
            </p>
            {settings.newsletter.provider ? (
              <p className="text-xs text-muted-foreground">
                Active provider: <span className="text-foreground font-medium">{settings.newsletter.provider}</span>
                {settings.newsletter.subscriberCount !== null ? ` · ${settings.newsletter.subscriberCount.toLocaleString()} subscribers` : ""}
              </p>
            ) : null}
          </div>
        </article>

        <article className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-card-title">Twilio (SMS)</h2>
            {renderConnectionBadge(settings.twilio.connected)}
          </div>
          <form action={updateIntegrationAction} className="mt-4 grid gap-3">
            <input type="hidden" name="service" value="twilio" />
            <div className="space-y-1">
              <label htmlFor="twilio-account-sid" className="text-label">
                Account SID
              </label>
              <input id="twilio-account-sid" name="accountSid" className="crm-input h-10 w-full px-3" defaultValue={settings.twilio.accountSid} />
            </div>
            <div className="space-y-1">
              <label htmlFor="twilio-auth-token" className="text-label">
                Auth Token
              </label>
              <input
                id="twilio-auth-token"
                name="authToken"
                type="password"
                placeholder={settings.twilio.authTokenHint ? "Leave blank to keep existing token" : "Enter Twilio auth token"}
                className="crm-input h-10 w-full px-3"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="twilio-from-number" className="text-label">
                Phone Number
              </label>
              <input id="twilio-from-number" name="fromNumber" className="crm-input h-10 w-full px-3" defaultValue={settings.twilio.fromNumber} placeholder="+1 555 123 4567" />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="submit" className="crm-button-primary h-10 px-4">
                Save Twilio
              </button>
              <button type="submit" formAction={testTwilioConnectionAction} className="crm-button-secondary h-10 px-4">
                Test Connection
              </button>
            </div>
          </form>
        </article>

        <article className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-card-title">Resend Email</h2>
            {renderConnectionBadge(settings.resend.connected)}
          </div>
          <form action={updateIntegrationAction} className="mt-4 grid gap-3">
            <input type="hidden" name="service" value="resend" />
            <div className="space-y-1">
              <label htmlFor="resend-api-key" className="text-label">
                API Key
              </label>
              <input
                id="resend-api-key"
                name="apiKey"
                type="password"
                placeholder={settings.resend.apiKeyHint ? `${settings.resend.apiKeyHint} (leave blank to keep)` : "Enter Resend API key"}
                className="crm-input h-10 w-full px-3"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="resend-from-email" className="text-label">
                From Email
              </label>
              <input
                id="resend-from-email"
                name="fromEmail"
                className="crm-input h-10 w-full px-3"
                defaultValue={settings.resend.fromEmail}
                placeholder="noreply@yourdomain.com"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="resend-from-name" className="text-label">
                From Name
              </label>
              <input id="resend-from-name" name="fromName" className="crm-input h-10 w-full px-3" defaultValue={settings.resend.fromName} />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="submit" className="crm-button-primary h-10 px-4">
                Save Resend
              </button>
              <button type="submit" formAction={testResendConnectionAction} className="crm-button-secondary h-10 px-4">
                Test Connection
              </button>
            </div>
          </form>
        </article>

        <article className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-card-title">Kit / ConvertKit</h2>
            {renderConnectionBadge(settings.newsletter.kit.connected)}
          </div>
          <form action={updateIntegrationAction} className="mt-4 grid gap-3">
            <input type="hidden" name="service" value="kit" />
            <div className="space-y-1">
              <label htmlFor="kit-api-key" className="text-label">
                API Key
              </label>
              <input
                id="kit-api-key"
                name="apiKey"
                type="password"
                placeholder={settings.newsletter.kit.apiKeyHint ? `${settings.newsletter.kit.apiKeyHint} (leave blank to keep)` : "Enter Kit API key"}
                className="crm-input h-10 w-full px-3"
                disabled={settings.newsletter.kit.disabled}
              />
            </div>
            {settings.newsletter.kit.disabled ? <p className="text-xs text-muted-foreground">You&apos;re already connected to {settings.newsletter.provider}.</p> : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="submit" className="crm-button-primary h-10 px-4" disabled={settings.newsletter.kit.disabled}>
                Save Kit
              </button>
              <button type="submit" formAction={testKitConnectionAction} className="crm-button-secondary h-10 px-4" disabled={settings.newsletter.kit.disabled}>
                Test Connection
              </button>
            </div>
          </form>
        </article>

        <article className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-card-title">Mailchimp</h2>
            {renderConnectionBadge(settings.newsletter.mailchimp.connected)}
          </div>
          <form action={updateIntegrationAction} className="mt-4 grid gap-3">
            <input type="hidden" name="service" value="mailchimp" />
            <div className="space-y-1">
              <label htmlFor="mailchimp-api-key" className="text-label">
                API Key
              </label>
              <input
                id="mailchimp-api-key"
                name="apiKey"
                type="password"
                placeholder={settings.newsletter.mailchimp.apiKeyHint ? `${settings.newsletter.mailchimp.apiKeyHint} (leave blank to keep)` : "Enter Mailchimp API key"}
                className="crm-input h-10 w-full px-3"
                disabled={settings.newsletter.mailchimp.disabled}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="mailchimp-list-id" className="text-label">
                List ID
              </label>
              <input id="mailchimp-list-id" name="listId" className="crm-input h-10 w-full px-3" defaultValue={settings.newsletter.listId} disabled={settings.newsletter.mailchimp.disabled} />
            </div>
            {settings.newsletter.mailchimp.disabled ? <p className="text-xs text-muted-foreground">You&apos;re already connected to {settings.newsletter.provider}.</p> : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="submit" className="crm-button-primary h-10 px-4" disabled={settings.newsletter.mailchimp.disabled}>
                Save Mailchimp
              </button>
              <button type="submit" formAction={testMailchimpConnectionAction} className="crm-button-secondary h-10 px-4" disabled={settings.newsletter.mailchimp.disabled}>
                Test Connection
              </button>
            </div>
          </form>
        </article>

        <article className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-card-title">Beehiiv</h2>
            {renderConnectionBadge(settings.newsletter.beehiiv.connected)}
          </div>
          <form action={updateIntegrationAction} className="mt-4 grid gap-3">
            <input type="hidden" name="service" value="beehiiv" />
            <div className="space-y-1">
              <label htmlFor="beehiiv-api-key" className="text-label">
                API Key
              </label>
              <input
                id="beehiiv-api-key"
                name="apiKey"
                type="password"
                placeholder={settings.newsletter.beehiiv.apiKeyHint ? `${settings.newsletter.beehiiv.apiKeyHint} (leave blank to keep)` : "Enter Beehiiv API key"}
                className="crm-input h-10 w-full px-3"
                disabled={settings.newsletter.beehiiv.disabled}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="beehiiv-publication-id" className="text-label">
                Publication ID
              </label>
              <input id="beehiiv-publication-id" name="publicationId" className="crm-input h-10 w-full px-3" defaultValue={settings.newsletter.publicationId} disabled={settings.newsletter.beehiiv.disabled} />
            </div>
            {settings.newsletter.beehiiv.disabled ? <p className="text-xs text-muted-foreground">You&apos;re already connected to {settings.newsletter.provider}.</p> : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="submit" className="crm-button-primary h-10 px-4" disabled={settings.newsletter.beehiiv.disabled}>
                Save Beehiiv
              </button>
              <button type="submit" formAction={testBeehiivConnectionAction} className="crm-button-secondary h-10 px-4" disabled={settings.newsletter.beehiiv.disabled}>
                Test Connection
              </button>
            </div>
          </form>
        </article>

        <article className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-card-title">Google Calendar</h2>
            {renderConnectionBadge(settings.google.calendarConnected)}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Connect Google to sync booking availability and calendar events.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {!settings.google.calendarConnected ? (
              <Link href={googleCalendarConnectUrl} className="crm-button-primary h-10 px-4">
                Connect Google Calendar
              </Link>
            ) : (
              <span className="crm-button-secondary inline-flex h-10 items-center px-4">Calendar connected</span>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
