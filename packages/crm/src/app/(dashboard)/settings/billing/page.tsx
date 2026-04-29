import Link from "next/link";
import { requireAuth } from "@/lib/auth/helpers";
import { isAdminTokenUserId } from "@/lib/auth/admin-token";
import { createBillingPortalSessionAction } from "@/lib/billing/actions";
import { listManagedOrganizations } from "@/lib/billing/orgs";
import { getOrgSubscription } from "@/lib/billing/subscription";
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

// Maps legacy backend subscription tiers to the two-plan model advertised on
// /pricing. Anything with maxWorkspaces > 1 or a paid stripe tier becomes
// "Pro"; everything else becomes "Free". Legacy tier strings (cloud_pro,
// pro_3, pro_5, etc.) still exist in subscriptions for users who signed up
// before the model simplified — we surface them in a footer note but lead
// with Free/Pro to keep the UI honest.
function getTierLabel(tier: string): { label: string; legacy: string | null } {
  const normalized = tier.toLowerCase();
  const paidTiers = new Set([
    "pro",
    "starter",
    "cloud_starter",
    "cloud_pro",
    "pro_3",
    "pro_5",
    "pro_10",
    "pro_20",
  ]);
  if (paidTiers.has(normalized)) {
    return {
      label: "Pro",
      legacy: normalized === "pro" ? null : normalized.replace(/_/g, " "),
    };
  }
  return { label: "Free", legacy: null };
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
  // Per CLAUDE.md: first workspace is free forever; each additional = $9/mo.
  const ADDITIONAL_WORKSPACE_PRICE = 9;
  const additionalWorkspaces = Math.max(0, managedOrgs.length - 1);
  const estimatedMonthly = additionalWorkspaces * ADDITIONAL_WORKSPACE_PRICE;
  const tierDisplay = getTierLabel(tier);

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">Billing</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Manage your plan and subscription details.</p>
      </div>

      {wantedNewWorkspace ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="font-medium text-foreground">You&apos;ve used your free workspace.</p>
          <p className="mt-1 text-muted-foreground">
            Upgrade to Cloud Pro or Cloud Agency to add more workspaces. Each tier
            also unlocks custom domain, removes &quot;Powered by SeldonFrame&quot; branding,
            and gives you priority support.
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border bg-card space-y-4 p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Current plan</p>
            <p className="text-lg font-semibold text-foreground">{tierDisplay.label}</p>
            {tierDisplay.legacy ? (
              <p className="mt-0.5 text-xs text-muted-foreground">Legacy: {tierDisplay.legacy}</p>
            ) : null}
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Workspaces</p>
            <p className="text-lg font-semibold text-foreground">{managedOrgs.length}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {additionalWorkspaces === 0
                ? "Just your free workspace"
                : `1 free + ${additionalWorkspaces} paid`}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Estimated monthly</p>
            <p className="text-lg font-semibold text-foreground">
              ${estimatedMonthly}
              <span className="ml-1 text-xs font-normal text-muted-foreground">/ mo</span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {additionalWorkspaces === 0
                ? "First workspace is free forever"
                : `${additionalWorkspaces} × $${ADDITIONAL_WORKSPACE_PRICE}`}
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
          Billing via Stripe · {billingPeriod} cycle
          {trialEndsAt ? ` · Trial ends ${formatDate(trialEndsAt)}` : ""}
        </p>
      </div>

      {isGuestAdminToken ? (
        <ClaimAndUpgradeForm />
      ) : null}

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
                    {isFree ? "Free" : `$${ADDITIONAL_WORKSPACE_PRICE}/mo`}
                  </span>
                </li>
              );
            })}
          </ul>

          <p className="text-xs text-muted-foreground">
            Your first workspace is always free. Each additional workspace adds ${ADDITIONAL_WORKSPACE_PRICE}/month.
            Delete a workspace and the charge stops on the next billing cycle.
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
