import { getKitIntegrationSettings, saveKitIntegrationAction, testKitConnectionAction } from "@/lib/integrations/kit/actions";

/*
  Square UI class reference (source of truth):
  - templates/dashboard-2/components/dashboard/welcome-section.tsx
    - title: "text-lg sm:text-[22px] font-semibold leading-relaxed"
    - helper text: "text-sm sm:text-base text-muted-foreground"
  - templates/dashboard-2/components/dashboard/deals-table.tsx
    - card/list shell: "rounded-xl border bg-card"
*/

export default async function KitIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; tested?: string }>;
}) {
  const params = await searchParams;
  const settings = await getKitIntegrationSettings();

  const tested = params.tested === "1" ? "Connection successful" : params.tested === "0" ? "Connection failed" : null;
  const saved = params.saved === "1" ? "Settings saved" : null;

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">Kit Integration</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Sync subscribers and trigger automations from CRM events.</p>
      </div>

      {saved ? <p className="rounded-md border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">{saved}</p> : null}
      {tested ? <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">{tested}</p> : null}

      <div className="rounded-md border border-border bg-[hsl(var(--muted)/0.2)] px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
        API Version: {settings?.version ?? "v4"} · Token stored encrypted at rest
        {settings?.apiTokenHint ? ` (${settings.apiTokenHint})` : ""}
      </div>

      <div className="rounded-xl border bg-card p-5">
        <form action={saveKitIntegrationAction} className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <label htmlFor="apiKey" className="text-label">
              Kit API Key
            </label>
            <input
              id="apiKey"
              name="apiKey"
              defaultValue=""
              className="crm-input h-10 w-full px-3"
              placeholder={settings?.hasApiToken ? "Leave blank to keep current token" : "Enter your Kit API key"}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="defaultTagId" className="text-label">
              Default Tag ID
            </label>
            <input id="defaultTagId" name="defaultTagId" defaultValue={settings?.defaultTagId ?? ""} className="crm-input h-10 w-full px-3" />
          </div>

          <div className="space-y-1">
            <label htmlFor="defaultSequenceId" className="text-label">
              Default Sequence ID
            </label>
            <input id="defaultSequenceId" name="defaultSequenceId" defaultValue={settings?.defaultSequenceId ?? ""} className="crm-input h-10 w-full px-3" />
          </div>

          <div className="space-y-1">
            <label htmlFor="contactCreatedTag" className="text-label">
              Tag for contact.created
            </label>
            <input
              id="contactCreatedTag"
              name="contactCreatedTag"
              defaultValue={settings?.tagMap?.["contact.created"] ?? ""}
              className="crm-input h-10 w-full px-3"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="bookingCompletedTag" className="text-label">
              Tag for booking.completed
            </label>
            <input
              id="bookingCompletedTag"
              name="bookingCompletedTag"
              defaultValue={settings?.tagMap?.["booking.completed"] ?? ""}
              className="crm-input h-10 w-full px-3"
            />
          </div>

          <div className="md:col-span-2 flex flex-wrap gap-2 pt-2">
            <button type="submit" className="crm-button-primary h-10 px-4">
              Save Integration
            </button>
            <button formAction={testKitConnectionAction} type="submit" className="crm-button-secondary h-10 px-4">
              Test Connection
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
