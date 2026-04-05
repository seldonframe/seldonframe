import { getCustomDomainSettings, saveCustomDomainAction } from "@/lib/domains/actions";

export default async function DomainSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; domainAction?: string; verified?: string }>;
}) {
  const params = await searchParams;
  const settings = await getCustomDomainSettings();

  if (!settings) {
    return null;
  }

  const successMessage =
    params.saved === "1"
      ? params.domainAction === "removed"
        ? "Custom domain removed"
        : params.domainAction === "checked"
          ? "Domain status refreshed"
          : "Domain saved"
      : null;

  const verificationMessage =
    params.verified === "1"
      ? "Verified"
      : settings.domainVerified
        ? "Verified"
        : settings.customDomain
          ? "Pending DNS verification"
          : "Not configured";

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">Custom Domain</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Connect a custom domain for this workspace&apos;s public pages.</p>
      </div>

      {successMessage ? (
        <p className="rounded-md border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">{successMessage}</p>
      ) : null}

      <article className="rounded-xl border bg-card p-5 space-y-5">
        <div>
          <h2 className="text-card-title">Your default URLs</h2>
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            <p>
              Landing: <span className="text-foreground">{settings.defaultUrls.landing}</span>
            </p>
            <p>
              Booking: <span className="text-foreground">{settings.defaultUrls.booking}</span>
            </p>
            <p>
              Forms: <span className="text-foreground">{settings.defaultUrls.forms}</span>
            </p>
          </div>
        </div>

        <form action={saveCustomDomainAction} className="space-y-3">
          <input type="hidden" name="intent" value="add" />
          <div className="space-y-1">
            <label htmlFor="custom-domain" className="text-label">
              Custom domain
            </label>
            <input
              id="custom-domain"
              name="domain"
              defaultValue={settings.customDomain}
              placeholder="crm.cleardrain.com"
              className="crm-input h-10 w-full px-3"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="submit" className="crm-button-primary h-10 px-4">
              {settings.customDomain ? "Save Domain" : "Add Domain"}
            </button>
            {settings.customDomain ? (
              <button type="submit" formAction={saveCustomDomainAction} name="intent" value="check" className="crm-button-secondary h-10 px-4">
                Check Status
              </button>
            ) : null}
            {settings.customDomain ? (
              <button type="submit" formAction={saveCustomDomainAction} name="intent" value="remove" className="crm-button-secondary h-10 px-4">
                Remove Domain
              </button>
            ) : null}
          </div>
        </form>

        <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2">
          <p className="text-sm font-medium text-foreground">After adding, update your DNS:</p>
          <p className="text-sm text-muted-foreground">CNAME → cname.vercel-dns.com</p>
          <p className="text-sm text-muted-foreground">
            Status: <span className={settings.domainVerified ? "text-positive" : "text-caution"}>{verificationMessage}</span>
          </p>
          {settings.customDomain ? (
            <p className="text-xs text-muted-foreground">
              Domain: <span className="text-foreground">{settings.customDomain}</span>
              {settings.domainStatus ? ` · ${settings.domainStatus}` : ""}
            </p>
          ) : null}
        </div>
      </article>
    </section>
  );
}
