import { getBrandingSettings, saveBrandingSettingsAction } from "@/lib/branding/actions";

export default async function BrandingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const params = await searchParams;
  const settings = await getBrandingSettings();

  if (!settings) {
    return null;
  }

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">Branding</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Control how your public pages appear to visitors.</p>
      </div>

      {params.saved === "1" ? (
        <p className="rounded-md border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">Branding settings saved</p>
      ) : null}

      <article className="rounded-xl border bg-card p-5 space-y-5">
        <form action={saveBrandingSettingsAction} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="publicBrandName" className="text-label">
              Public brand name
            </label>
            <input
              id="publicBrandName"
              name="publicBrandName"
              defaultValue={settings.publicBrandName}
              placeholder={settings.orgName}
              className="crm-input h-10 w-full px-3"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="logoUrl" className="text-label">
              Logo URL
            </label>
            <input
              id="logoUrl"
              name="logoUrl"
              defaultValue={settings.logoUrl}
              placeholder="https://example.com/logo.png"
              className="crm-input h-10 w-full px-3"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="primaryColor" className="text-label">
              Primary color
            </label>
            <input
              id="primaryColor"
              name="primaryColor"
              defaultValue={settings.primaryColor}
              placeholder="#0ea5e9"
              className="crm-input h-10 w-full px-3"
            />
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-border bg-background/40 px-3 py-3">
            <input
              type="checkbox"
              name="removePoweredBy"
              defaultChecked={settings.removePoweredBy}
              disabled={!settings.canHideBadge}
              className="mt-0.5 size-4 rounded border-input accent-primary"
            />
            <span className="space-y-1">
              <span className="text-sm font-medium text-foreground">Remove “Powered by SeldonFrame” on public pages</span>
              <span className="block text-xs text-muted-foreground">
                {settings.canHideBadge
                  ? "Enabled on your current plan."
                  : "Upgrade to a Pro plan to hide the badge."}
              </span>
            </span>
          </label>

          <button type="submit" className="crm-button-primary h-10 px-4">
            Save Branding
          </button>
        </form>
      </article>
    </section>
  );
}
