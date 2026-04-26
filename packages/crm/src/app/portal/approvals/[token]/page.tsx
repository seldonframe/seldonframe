// /portal/approvals/[token] — customer-facing magic-link approval
// surface. SLICE 10 PR 2 C5 per audit §8 + Max's gate-resolution
// prompt.
//
// HIGH polish bar — this is the first SeldonFrame surface that
// clients of agency operators encounter directly. Spot-check:
// "would Max ship this to a real client of a real agency?"
//
// Polish criteria (from PR 2 baseline):
//   - Mobile-first responsive design (single-column flex layout;
//     buttons full-width on small screens)
//   - Empty / loading / error / success states all polished
//   - Professional, jargon-free copy
//   - SeldonFrame "Powered by" attribution stays SeldonFrame brand
//     colors (theme bridge isolation per SLICE 4b)
//   - Workspace customer theme applied to the page chrome
//   - Each error case has a specific page with clear next steps
//
// Server flow:
//   1. Verify the token (HMAC + expiration) via authorizeMagicLinkResolution
//   2. If invalid_token / expired → render the corresponding state
//   3. If already_resolved → render the resolved-state page
//   4. If ok → render the decision page (with the client component
//      handling approve/reject + optional comment)
//   5. Apply the workspace theme + powered-by badge + test-mode badge
//      via the existing PublicThemeProvider pattern.

import { eq } from "drizzle-orm";
import { PoweredByBadge } from "@seldonframe/core/virality";

import { db } from "@/db";
import { organizations } from "@/db/schema";
import { TestModePublicBadge } from "@/components/layout/test-mode-public-badge";
import { PublicThemeProvider } from "@/components/theme/public-theme-provider";
import {
  DrizzleApprovalStorage,
  authorizeMagicLinkResolution,
  getMagicLinkSecretForWorkspace,
} from "@/lib/workflow/approvals";
import { shouldShowPoweredByBadgeForOrg } from "@/lib/billing/public";
import { getPublicOrgThemeById } from "@/lib/theme/actions";
import { DEFAULT_ORG_THEME } from "@/lib/theme/types";

import { ApprovalDecisionForm } from "./decision-form";

export const dynamic = "force-dynamic";

type OutcomeKind = "ok" | "expired" | "invalid_token" | "already_resolved";

export default async function CustomerApprovalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Resolve workspace HMAC secret. Failure = 503 surface (no secret
  // configured = magic-link disabled at this deployment).
  let secret: string | null = null;
  try {
    secret = await getMagicLinkSecretForWorkspace("");
  } catch {
    secret = null;
  }
  if (!secret) {
    return <DisabledShell />;
  }

  const storage = new DrizzleApprovalStorage(db);
  const authz = await authorizeMagicLinkResolution(storage, {
    token,
    secret,
    now: new Date(),
  });

  // Resolve the workspace's public theme + branding state when we
  // have an approval to display (ok or already_resolved). For
  // invalid_token / expired (no row found) we fall back to a
  // SeldonFrame-default chrome since we don't know which workspace
  // the (possibly forged) token came from.
  const orgId =
    authz.kind === "ok" || authz.kind === "already_resolved" ? authz.approval.orgId : null;
  const theme = orgId ? await getPublicOrgThemeById(orgId) : DEFAULT_ORG_THEME;
  const showBadge = orgId ? await shouldShowPoweredByBadgeForOrg(orgId) : true;
  const isTestMode = orgId ? await loadTestMode(orgId) : false;

  return (
    <PublicThemeProvider theme={theme}>
      <main className="crm-page flex items-center justify-center px-4 py-8 sm:py-12 min-h-screen">
        <div className="w-full max-w-md space-y-6">
          {renderOutcome(authz.kind, authz, token)}

          {(showBadge || isTestMode) ? (
            <div className="flex flex-col items-center gap-2 pt-4">
              {isTestMode ? <TestModePublicBadge testMode={true} /> : null}
              {showBadge ? <PoweredByBadge /> : null}
            </div>
          ) : null}
        </div>
      </main>
    </PublicThemeProvider>
  );
}

async function loadTestMode(orgId: string): Promise<boolean> {
  const [row] = await db
    .select({ testMode: organizations.testMode })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return row?.testMode ?? false;
}

function renderOutcome(
  kind: OutcomeKind | "wrong_org" | "not_found" | "forbidden",
  authz: Awaited<ReturnType<typeof authorizeMagicLinkResolution>>,
  token: string,
): React.ReactNode {
  if (kind === "ok" && authz.kind === "ok") {
    return (
      <section className="space-y-5">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--sf-foreground)" }}>
            {authz.approval.contextTitle}
          </h1>
          <p className="text-sm" style={{ color: "var(--sf-muted)" }}>
            {authz.approval.contextSummary}
          </p>
        </div>
        {authz.approval.contextPreview ? (
          <div
            className="rounded-md border p-3 text-sm whitespace-pre-wrap"
            style={{
              borderColor: "var(--sf-border)",
              background: "var(--sf-card)",
              color: "var(--sf-foreground)",
            }}
          >
            {authz.approval.contextPreview}
          </div>
        ) : null}
        {authz.approval.timeoutAt ? (
          <p className="text-xs" style={{ color: "var(--sf-muted)" }}>
            This request expires at {new Date(authz.approval.timeoutAt).toLocaleString()}.
          </p>
        ) : null}
        <ApprovalDecisionForm token={token} />
      </section>
    );
  }

  if (kind === "expired") {
    return (
      <Stateful
        title="This link has expired"
        body="Approval requests expire 24 hours after they're sent. The original team can resend a fresh link."
        tone="warn"
      />
    );
  }

  if (kind === "already_resolved" && authz.kind === "already_resolved") {
    const verb =
      authz.approval.status === "approved"
        ? "approved"
        : authz.approval.status === "rejected"
          ? "declined"
          : authz.approval.status;
    return (
      <Stateful
        title={`This request was already ${verb}`}
        body={`Resolved ${authz.approval.resolvedAt ? new Date(authz.approval.resolvedAt).toLocaleString() : "previously"}. No further action is needed.`}
        tone="info"
      />
    );
  }

  // invalid_token / forbidden / not_found / wrong_org / fallback
  return (
    <Stateful
      title="This link can't be opened"
      body="The link may be malformed or no longer valid. If this is unexpected, ask the original sender for a fresh link."
      tone="warn"
    />
  );
}

function Stateful({
  title,
  body,
  tone,
}: {
  title: string;
  body: string;
  tone: "info" | "warn" | "success";
}) {
  const accent =
    tone === "success" ? "var(--sf-success)" : tone === "warn" ? "var(--sf-warning)" : "var(--sf-accent)";
  return (
    <section className="space-y-3 text-center sm:text-left">
      <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--sf-foreground)" }}>
        {title}
      </h1>
      <p className="text-sm" style={{ color: "var(--sf-muted)" }}>
        {body}
      </p>
      <div className="h-1 w-12 rounded-full mx-auto sm:mx-0" style={{ background: accent }} />
    </section>
  );
}

function DisabledShell() {
  // No theme provider — when magic-link is disabled at the deployment
  // we don't know which workspace this is and can't theme. Default
  // SeldonFrame chrome.
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <section className="w-full max-w-md space-y-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Approval link unavailable</h1>
        <p className="text-sm text-muted-foreground">
          This SeldonFrame deployment hasn&apos;t enabled customer approval links yet. If
          you&apos;re expecting to act on a request, please contact the sender.
        </p>
        <div className="pt-4">
          <PoweredByBadge />
        </div>
      </section>
    </main>
  );
}
