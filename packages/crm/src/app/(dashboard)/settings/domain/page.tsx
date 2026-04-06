import { getCustomDomainSettings, saveCustomDomainAction } from "@/lib/domains/actions";
import { UpgradeGate } from "@/components/upgrade-gate";
import { getOrgFeatures } from "@/lib/billing/features";
import { getOrgId } from "@/lib/auth/helpers";
import { getOrgSubscription } from "@/lib/billing/subscription";

export default async function DomainSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; domainAction?: string; verified?: string; error?: string }>;
}) {
  const params = await searchParams;
  const settings = await getCustomDomainSettings();
  const orgId = await getOrgId();
  const subscription = await getOrgSubscription(orgId);
  const features = getOrgFeatures(subscription.tier ?? "free");
  const hasCustomDomainAccess = features.customDomains;

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

  const errorMessage = typeof params.error === "string" ? decodeURIComponent(params.error) : "";
  const domainParts = settings.customDomain ? settings.customDomain.split(".") : [];
  const dnsName = domainParts.length > 2 ? domainParts.slice(0, -2).join(".") : "@";

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">Custom Domain</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Connect a custom domain for this workspace&apos;s public pages.</p>
      </div>

      {successMessage ? (
        <p className="rounded-md border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">{successMessage}</p>
      ) : null}

      {errorMessage ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage}</p>
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

        <UpgradeGate
          feature="custom-domain"
          requiredPlan="cloud"
          hasAccess={hasCustomDomainAccess}
          message="Custom domains are available on Cloud+. Keep your pages on your own domain instead of app.seldonframe.com routes."
        >
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
            <p className="text-sm font-medium text-foreground">DNS Configuration Required</p>
            <p className="text-sm text-muted-foreground">Add this CNAME record at your domain registrar:</p>
            <div className="rounded-md border border-border bg-background/70 p-3 text-sm font-mono">
              <p>
                <span className="text-muted-foreground">Type:</span> CNAME
              </p>
              <p>
                <span className="text-muted-foreground">Name:</span> {dnsName}
              </p>
              <p>
                <span className="text-muted-foreground">Value:</span> cname.vercel-dns.com
              </p>
            </div>
            <p className="text-xs text-muted-foreground">DNS changes can take up to 48 hours to propagate.</p>
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
        </UpgradeGate>
      </article>
    </section>
  );
}
