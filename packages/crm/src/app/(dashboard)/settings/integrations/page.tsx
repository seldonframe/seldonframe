import Link from "next/link";
import {
  getIntegrationSettings,
  testKitConnectionAction,
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

function statusLabel(connected: boolean) {
  return connected ? "Connected ✓" : "Not connected";
}

export default async function IntegrationsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; service?: string; twilioTest?: string; resendTest?: string; kitTest?: string }>;
}) {
  const params = await searchParams;
  const settings = await getIntegrationSettings();
  const googleCalendarConnectUrl =
    "/api/auth/signin/google?callbackUrl=%2Fsettings%2Fintegrations&scope=openid%20email%20profile%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar&prompt=consent&access_type=offline";

  if (!settings) {
    return null;
  }

  const savedMessage = params.saved === "1" && params.service ? `${params.service} settings saved` : null;
  const twilioTestMessage = params.twilioTest === "1" ? "Twilio connection successful" : params.twilioTest === "0" ? "Twilio connection failed" : null;
  const resendTestMessage = params.resendTest === "1" ? "Resend connection successful" : params.resendTest === "0" ? "Resend connection failed" : null;
  const kitTestMessage = params.kitTest === "1" ? "Kit connection successful" : params.kitTest === "0" ? "Kit connection failed" : null;

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">Integrations</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Connect external services for SMS, email, and automation.</p>
        </div>
      </div>

      {savedMessage ? <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{savedMessage}</p> : null}
      {twilioTestMessage ? <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">{twilioTestMessage}</p> : null}
      {resendTestMessage ? <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">{resendTestMessage}</p> : null}
      {kitTestMessage ? <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">{kitTestMessage}</p> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-card-title">Twilio (SMS)</h2>
            <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">{statusLabel(settings.twilio.connected)}</span>
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
            <h2 className="text-card-title">Resend (Email)</h2>
            <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">{statusLabel(settings.resend.connected)}</span>
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
              <input id="resend-from-email" name="fromEmail" className="crm-input h-10 w-full px-3" defaultValue={settings.resend.fromEmail} />
            </div>
            <div className="space-y-1">
              <label htmlFor="resend-from-name" className="text-label">
                From Name
              </label>
              <input id="resend-from-name" name="fromName" className="crm-input h-10 w-full px-3" defaultValue={settings.resend.fromName || settings.orgName} />
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
            <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">{statusLabel(settings.kit.connected)}</span>
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
                placeholder={settings.kit.apiKeyHint ? `${settings.kit.apiKeyHint} (leave blank to keep)` : "Enter Kit API key"}
                className="crm-input h-10 w-full px-3"
              />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="submit" className="crm-button-primary h-10 px-4">
                Save Kit
              </button>
              <button type="submit" formAction={testKitConnectionAction} className="crm-button-secondary h-10 px-4">
                Test Connection
              </button>
            </div>
          </form>
        </article>

        <article className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-card-title">Google Calendar</h2>
            <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
              {settings.google.calendarConnected ? "Connected ✓" : "Not connected"}
            </span>
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
