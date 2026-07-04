// packages/crm/src/app/(dashboard)/settings/domain/page.tsx
//
// 2026-05-27 — Step 3 of the BYOK-first onboarding arc. Replaces the
// generic blur-the-form <UpgradeGate> with a real upsell card for
// free-tier operators who don't yet have a card on file, so the
// onboarding arc terminates with the first paid-plan ask:
//
//   Step 1 — /signup/connect-ai           (add Anthropic API key)
//   Step 2 — /clients/new → build → Ready (see the magic)
//   Step 3 — /settings/domain             (this page — card upgrade trigger)
//
// Resolution lives in lib/billing/domain-gate.ts as a pure function so
// the decision is unit-testable without spinning up a DB. The page
// composes the gate output:
//   - kind="render-upsell"  → upsell card with "Add a card to unlock"
//                              CTA → /signup/billing?next=/settings/domain
//                              (the SetupIntent page bounces back here
//                              after a successful card save).
//   - kind="render-form"    → existing domain-connection form, unchanged.
//
// Free-tier operators with a card on file fall through to the form
// (they cleared the card hurdle once; lib/domains/actions.ts gates the
// actual save via getOrgFeatures(tier).customDomains so a free-tier
// user can't accidentally bypass payment by submitting). The previous
// <UpgradeGate> overlay is gone — the upsell card is more onboarding-
// arc-shaped (full surface, not a modal over a blurred form).

import { auth } from "@/auth";

import { getCustomDomainSettings, saveCustomDomainAction } from "@/lib/domains/actions";
import { getOrgId } from "@/lib/auth/helpers";
import { resolveDomainGate } from "@/lib/billing/domain-gate";
import { DomainUpgradeButton } from "@/components/billing/domain-upgrade-button";

export default async function DomainSettingsPage({
  searchParams,
}: {
  // 2026-05-27 — `onboardingWorkspaceSlug` is added by the Ready
  // page's "Connect custom domain" CTA when the operator is mid-
  // onboarding. The slug is sanitized to lowercase alphanumerics +
  // hyphens below (matches the org-slug shape) and re-emitted as a
  // hidden form input so the save action can mark onboarding
  // complete and bounce the user back to that workspace's Ready
  // page with ?completed=1. Returning operators won't have this
  // param so the existing post-save UX is unchanged.
  searchParams: Promise<{
    saved?: string;
    domainAction?: string;
    verified?: string;
    error?: string;
    onboardingWorkspaceSlug?: string;
  }>;
}) {
  const params = await searchParams;
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const orgId = await getOrgId();

  const settings = await getCustomDomainSettings();
  if (!settings) {
    return null;
  }

  const gate = await resolveDomainGate({ userId, orgId });

  // Sanitize the workspace slug from query — only allow the org-slug
  // shape (lowercase alphanumerics + hyphens, max 60 chars) so a
  // hostile redirect can't smuggle in a path. The save action ALSO
  // re-validates by querying the org row before redirecting, so this
  // is a defense-in-depth check rather than the sole gate.
  const rawSlug = params.onboardingWorkspaceSlug ?? "";
  const onboardingWorkspaceSlug =
    typeof rawSlug === "string" && /^[a-z0-9-]{1,60}$/.test(rawSlug)
      ? rawSlug
      : "";

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
  // Apex/root domains (e.g. seldonstudio.com) can't use a CNAME — DNS forbids a
  // CNAME at the zone apex — so they need an A record pointed at Vercel's
  // anycast IP. Only subdomains (book.seldonstudio.com) use the CNAME.
  // (2-label === apex for common TLDs; multi-part TLDs are the rare exception.)
  const isApexDomain = dnsName === "@";
  const dnsRecordType = isApexDomain ? "A" : "CNAME";
  const dnsRecordValue = isApexDomain ? "76.76.21.21" : "cname.vercel-dns.com";

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

      {/* Always show the default URLs card — even free-tier-without-card
          operators benefit from seeing what they're working with so the
          upsell value lands. */}
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
      </article>

      {gate?.kind === "render-upsell" ? (
        <UpsellCard onboardingWorkspaceSlug={onboardingWorkspaceSlug} />
      ) : (
        <article className="rounded-xl border bg-card p-5 space-y-5">
          <form action={saveCustomDomainAction} className="space-y-3">
            <input type="hidden" name="intent" value="add" />
            {/* 2026-05-27 — Onboarding context passthrough. When this
                page was reached from the Ready page's step-3 CTA, the
                slug is in the URL; we round-trip it through the form
                so the save action knows to mark onboarding complete +
                bounce back to that workspace's Ready page with
                ?completed=1 once the domain save succeeds. Empty
                value for non-onboarding visits — the action treats
                empty as "no bounce, normal post-save redirect". */}
            {onboardingWorkspaceSlug ? (
              <input
                type="hidden"
                name="onboardingWorkspaceSlug"
                value={onboardingWorkspaceSlug}
              />
            ) : null}
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
            <p className="text-sm text-muted-foreground">
              Add this {dnsRecordType} record at your domain registrar:
            </p>
            <div className="rounded-md border border-border bg-background/70 p-3 text-sm font-mono">
              <p>
                <span className="text-muted-foreground">Type:</span> {dnsRecordType}
              </p>
              <p>
                <span className="text-muted-foreground">Name:</span> {dnsName}
              </p>
              <p>
                <span className="text-muted-foreground">Value:</span> {dnsRecordValue}
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
        </article>
      )}
    </section>
  );
}

/** Free-tier-no-card upsell. Full-page card (not a modal) because step
 *  3 of the onboarding arc IS this surface — there's nothing else to
 *  interrupt. CTA hits /signup/billing?next=/settings/domain so the
 *  user lands back here once the card is saved.
 *
 *  2026-05-27 — When reached from the Ready page's step-3 CTA, the
 *  workspace slug is threaded through so /signup/billing → /settings/
 *  domain hop preserves it (the next-param round-trip terminates at
 *  the form's hidden input on the second visit, then the save action
 *  bounces back to the Ready page with ?completed=1). */
function UpsellCard({
  onboardingWorkspaceSlug,
}: {
  onboardingWorkspaceSlug: string;
}) {
  // Encode the slug into the success path so a successful checkout bounces
  // back here with the onboarding context intact, same round-trip contract
  // the old /signup/billing?next=... flow honored.
  const successPath = onboardingWorkspaceSlug
    ? `/settings/domain?onboardingWorkspaceSlug=${encodeURIComponent(onboardingWorkspaceSlug)}`
    : "/settings/domain";
  return (
    <article className="rounded-xl border border-primary/30 bg-primary/5 p-6 space-y-4">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">
          Custom domains are part of a paid plan
        </h2>
        <p className="text-sm text-muted-foreground">
          Connect your client&apos;s existing domain — or yours — so the
          workspace lives at{" "}
          <i className="text-foreground">roofs-by-shiloh.com</i> instead of a
          SeldonFrame subdomain.
        </p>
      </div>

      <DomainUpgradeButton successPath={successPath} />
    </article>
  );
}
