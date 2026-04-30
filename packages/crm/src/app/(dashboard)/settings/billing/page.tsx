import Link from "next/link";
import { requireAuth } from "@/lib/auth/helpers";
import { isAdminTokenUserId } from "@/lib/auth/admin-token";
import { createBillingPortalSessionAction } from "@/lib/billing/actions";
import { listManagedOrganizations } from "@/lib/billing/orgs";
import { getOrgSubscription } from "@/lib/billing/subscription";
import { normalizeTierId } from "@/lib/billing/features";
import { getUsageSummary, type UsageSummary } from "@/lib/billing/usage";
import { getOrgId } from "@/lib/auth/helpers";
import { ClaimAndUpgradeForm } from "@/components/billing/claim-and-upgrade-form";

/*
  Square UI class reference (source of truth):
  - templates/dashboard-2/components/dashboard/welcome-section.tsx
    - title: "text-lg sm:text-[22px] font-semibold leading-relaxed"
    - helper text: "text-sm sm:text-base text-muted-foreground"
  - templates/dashboard-2/components/dashboard/deals-table.tsx
    - card/list shell: "rounded-xl border bg-card"
*/

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  // Pin the locale so server SSR and client hydration produce the
  // exact same string. Passing `[]` (or undefined) here uses the
  // runtime's default locale — the server's Node default and the
  // browser's `navigator.language` can differ ("May 5" vs "5 May")
  // and that mismatch trips React hydration error #418.
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatMoney(amount: number) {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Map a stored subscription tier to the display label + tagline. The
 *  normalize layer absorbs legacy values (cloud_pro, pro_3, etc.) so
 *  paying customers from before the migration see a sensible label. */
function getTierDisplay(rawTier: string | null | undefined) {
  const tier = normalizeTierId(rawTier);
  if (tier === "scale") return { label: "Scale", caption: "$99/mo + $0.02 per agent run" };
  if (tier === "growth") return { label: "Growth", caption: "$29/mo + usage" };
  return { label: "Free", caption: "Free forever — upgrade when you grow" };
}

function ProgressBar({ percent, tone }: { percent: number; tone: "primary" | "warn" | "danger" }) {
  const safe = Math.max(0, Math.min(100, Math.round(percent)));
  const fill = tone === "danger" ? "bg-destructive" : tone === "warn" ? "bg-caution" : "bg-primary";
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div className={`h-full ${fill}`} style={{ width: `${safe}%` }} />
    </div>
  );
}

function UsageRow({
  label,
  used,
  limit,
  percent,
  tone,
  trailing,
}: {
  label: string;
  used: number;
  limit: number;
  percent: number;
  tone: "primary" | "warn" | "danger";
  trailing?: string;
}) {
  const limitLabel =
    limit === -1
      ? "unlimited"
      : limit === 0
        ? `${used.toLocaleString()} runs`
        : `${used.toLocaleString()} / ${limit.toLocaleString()} included`;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className="text-muted-foreground tabular-nums">{trailing ?? limitLabel}</span>
      </div>
      <ProgressBar percent={percent} tone={tone} />
    </div>
  );
}

function pickTone(percent: number): "primary" | "warn" | "danger" {
  if (percent >= 100) return "danger";
  if (percent >= 80) return "warn";
  return "primary";
}

function UsageCard({ usage }: { usage: UsageSummary }) {
  const isFree = usage.tier === "free";
  const isScale = usage.tier === "scale";

  const contactsTone = pickTone(usage.contacts.percent);
  const agentRunsTone = pickTone(usage.agentRuns.percent);

  return (
    <div className="rounded-xl border bg-card space-y-4 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-section-title">Current usage</h2>
          <p className="text-sm text-muted-foreground">This billing period</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Estimated total</p>
          <p className="text-lg font-semibold text-foreground tabular-nums">
            {formatMoney(usage.estimatedTotal)}
          </p>
          <p className="text-xs text-muted-foreground">
            base {formatMoney(usage.plan.price)}
            {usage.contacts.overageCost + usage.agentRuns.overageCost > 0
              ? ` + ${formatMoney(usage.contacts.overageCost + usage.agentRuns.overageCost)} usage`
              : ""}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <UsageRow
          label={isScale ? "Contacts" : "Contacts"}
          used={usage.contacts.used}
          limit={usage.contacts.included}
          percent={usage.contacts.percent}
          tone={contactsTone}
          trailing={
            isScale
              ? `${usage.contacts.used.toLocaleString()} (unlimited)`
              : undefined
          }
        />
        <UsageRow
          label={
            isScale
              ? `Agent runs · ${formatMoney(usage.plan.metered.agentRuns?.pricePerUnit ?? 0)} each`
              : "Agent runs"
          }
          used={usage.agentRuns.used}
          limit={usage.agentRuns.included}
          percent={usage.agentRuns.percent}
          tone={agentRunsTone}
          trailing={
            isScale
              ? `${usage.agentRuns.used.toLocaleString()} runs · ${formatMoney(usage.agentRuns.overageCost)}`
              : undefined
          }
        />
      </div>

      {isFree ? (
        <div className="space-y-1.5 text-xs text-muted-foreground">
          {usage.contacts.percent >= 100 || usage.agentRuns.percent >= 100 ? (
            <p className="text-destructive font-medium">
              Limit reached. Upgrade to Growth to keep adding contacts and running agents.
            </p>
          ) : usage.contacts.percent >= 80 || usage.agentRuns.percent >= 80 ? (
            <p className="text-caution font-medium">
              Approaching the Free tier limit. Upgrade to Growth before you hit the cap.
            </p>
          ) : (
            <p>Free tier includes 50 contacts + 100 agent runs per month.</p>
          )}
        </div>
      ) : usage.contacts.overageCost + usage.agentRuns.overageCost > 0 ? (
        <p className="text-xs text-muted-foreground">
          Overage charges this period: {formatMoney(usage.contacts.overageCost + usage.agentRuns.overageCost)}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">No overage charges this period.</p>
      )}
    </div>
  );
}

export default async function BillingSettingsPage({
  searchParams,
}: {
  // Next.js 15+ Promise-based searchParams. We resolve before reading.
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // P0-2: requireAuth recognizes both NextAuth sessions AND admin-token
  // cookies (via the C6 synthetic-session path). Admin-token sessions
  // get a different UI: a claim-and-upgrade form instead of the
  // "Manage subscription" button (which would 401 because the synthetic
  // user.id isn't in the users table).
  const session = await requireAuth();
  const isGuestAdminToken = isAdminTokenUserId(session.user.id);

  // ?intent=new-workspace lands here from the sidebar's "Create new
  // workspace" link when the operator already has one (or is on a
  // guest admin session). Surface a contextual banner so it's clear
  // why they were redirected here instead of seeing the create form.
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const intentRaw = resolvedSearchParams?.intent;
  const intent = Array.isArray(intentRaw) ? intentRaw[0] : intentRaw;
  const wantedNewWorkspace = intent === "new-workspace";

  const orgId = await getOrgId();
  const activeOrgId = orgId ?? session.user.orgId ?? null;
  const subscription = await getOrgSubscription(activeOrgId);
  const tier = subscription.tier ?? "free";
  const trialEndsAt = subscription.trialEndsAt ?? null;
  const status = subscription.status ?? "trialing";
  const billingPeriod = subscription.stripePriceId?.includes("year") ? "yearly" : "monthly";
  // listManagedOrganizations does a `users` table lookup that throws
  // for admin-token sessions (sentinel UUID isn't there). Skip for
  // guests — they only have one workspace anyway.
  const managedOrgs = isGuestAdminToken ? [] : await listManagedOrganizations(session.user.id);

  const tierDisplay = getTierDisplay(tier);
  const usage = await getUsageSummary(activeOrgId, tier);

  return (
    // P2 — TODO: track down the underlying React #418 source. The
    // ClaimAndUpgradeForm and `formatDate` locale fixes did not
    // eliminate it, which means the mismatch is in the dashboard
    // layout chrome (sidebar / topbar / SeldonChat / providers) and
    // needs the React dev-mode error to identify. `suppressHydrationWarning`
    // is a band-aid that keeps the console clean for the launch demo;
    // it suppresses the warning at the section root and on direct text
    // children, which covers most observed cases. Replace once the
    // root cause is known.
    <section className="animate-page-enter space-y-4 sm:space-y-6" suppressHydrationWarning>
      <div>
        <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">Billing</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Manage your plan and subscription details.</p>
      </div>

      {wantedNewWorkspace ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="font-medium text-foreground">You&apos;ve used your free workspace.</p>
          <p className="mt-1 text-muted-foreground">
            Upgrade to Growth ($29/mo) for up to 3 workspaces, or Scale ($99/mo) for unlimited.
            Both tiers also unlock custom domain, remove SeldonFrame branding, and add the client portal.
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border bg-card space-y-4 p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Current plan</p>
            <p className="text-lg font-semibold text-foreground">{tierDisplay.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{tierDisplay.caption}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Workspaces</p>
            <p className="text-lg font-semibold text-foreground">{managedOrgs.length}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {usage.tier === "scale"
                ? "Unlimited on Scale"
                : usage.tier === "growth"
                  ? `up to ${usage.plan.limits.maxOrgs}`
                  : "1 included on Free"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Estimated monthly</p>
            <p className="text-lg font-semibold text-foreground tabular-nums">
              {formatMoney(usage.estimatedTotal)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {usage.tier === "free" ? "No charge" : "Base + metered usage"}
            </p>
          </div>
        </div>

        {status !== "trialing" && status !== "active" ? (
          <div className="rounded-lg border border-caution/30 bg-caution/10 px-3 py-2 text-xs text-caution">
            Subscription status: <span className="font-medium capitalize">{status.replace("_", " ")}</span>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {isGuestAdminToken ? null : (
            <form action={createBillingPortalSessionAction}>
              <button type="submit" className="crm-button-primary h-10 px-4">
                Manage subscription
              </button>
            </form>
          )}
          <Link href="/pricing" className="crm-button-secondary inline-flex h-10 items-center px-4">
            See pricing
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          Billed monthly · cancel anytime
          {trialEndsAt ? ` · Trial ends ${formatDate(trialEndsAt)}` : ""}
          {billingPeriod === "yearly" ? " · yearly cycle" : ""}
        </p>
      </div>

      <UsageCard usage={usage} />

      {isGuestAdminToken ? <ClaimAndUpgradeForm /> : null}

      {managedOrgs.length > 0 ? (
        <div className="rounded-xl border bg-card space-y-4 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-section-title">Your workspaces</h2>
            <p className="text-sm text-muted-foreground">
              {managedOrgs.length} {managedOrgs.length === 1 ? "workspace" : "workspaces"}
            </p>
          </div>

          <ul className="space-y-2 text-sm text-muted-foreground">
            {managedOrgs.map((org, index) => {
              const isFree = index === 0;
              return (
                <li key={org.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground">{org.name}</span>
                    <span className="text-xs">/{org.slug}</span>
                  </div>
                  <span
                    className={
                      isFree
                        ? "rounded-full border border-border bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground"
                        : "rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary"
                    }
                  >
                    {isFree ? "First (free)" : tierDisplay.label}
                  </span>
                </li>
              );
            })}
          </ul>

          <p className="text-xs text-muted-foreground">
            {usage.tier === "scale"
              ? "Scale includes unlimited workspaces. Each workspace uses your shared agent-run + contact pool."
              : usage.tier === "growth"
                ? `Growth includes up to ${usage.plan.limits.maxOrgs} workspaces. Upgrade to Scale for unlimited.`
                : "Free includes 1 workspace. Upgrade to Growth for up to 3, or Scale for unlimited."}
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border border-dashed border-border bg-card/30 p-5">
        <h2 className="text-section-title mb-2">Seldon It &amp; Brain v2 inference</h2>
        <p className="text-sm text-muted-foreground">
          Seldon It runs through your own Claude API key via the MCP server — we don&apos;t meter or
          cap requests on our side. Usage is billed directly by Anthropic against your key.
        </p>
        <div className="mt-3">
          <Link href="/settings/integrations" className="crm-button-secondary inline-flex h-9 items-center px-3 text-xs">
            Manage API keys
          </Link>
        </div>
      </div>
    </section>
  );
}
