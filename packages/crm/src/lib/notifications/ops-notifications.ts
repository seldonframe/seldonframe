// Ops-notification emails — real-time alerts to the founder for two
// business-critical events:
//
//   1. New free signup        (events.createUser in NextAuth)
//   2. Paid plan conversion   (customer.subscription.created in Stripe webhook)
//
// Why this lives in lib/notifications/ and not lib/emails/:
//   lib/emails/ is workspace-scoped (per-org Resend keys, suppression
//   lists, send-history tables, branding). Ops alerts are platform-
//   level: one global recipient (the founder), no per-workspace
//   provider lookup, no suppression, no DB writes. Folding them into
//   lib/emails/api.ts would force every send through the workspace
//   email pipeline which doesn't apply (no orgId, no template token
//   substitution, no event ledger).
//
// Why try/catch around every send:
//   - signup hook: a Resend failure would crash NextAuth's events.createUser
//     and break the user's first sign-in. We must never block auth.
//   - stripe webhook: a Resend failure would propagate to the route,
//     which would return a non-2xx to Stripe, triggering automatic
//     retries (3 attempts within 3 days). That double-processes the
//     subscription. Must always return success to Stripe regardless.
//
// Why hardcode the recipient with env override:
//   This is a founder-only alert in v1. Adding a UI for per-workspace
//   recipients is out of scope. The env override exists so we can flip
//   the recipient without a code deploy (e.g. when a second teammate
//   joins ops on-call, or during vacation forwarding).

import { resolveDefaultFromEmail } from "@/lib/emails/providers";

/**
 * Hardcoded fallback recipient when OPS_NOTIFICATION_EMAIL env var is
 * not set. Founder's personal email — the "pager" inbox.
 */
export const OPS_NOTIFICATION_EMAIL_DEFAULT = "maximehoule100@gmail.com";

/**
 * Default sender used when DEFAULT_FROM_EMAIL is not set. Matches the
 * convention in lib/emails/providers/index.ts so we don't invent a
 * new sender domain that isn't verified in Resend.
 */
const DEFAULT_OPS_FROM = "SeldonFrame Ops <welcome@seldonframe.com>";

export type NewSignupAlertParams = {
  email: string;
  userId: string;
  createdAt: Date;
  source?: string | null;
};

export type PaidConversionAlertParams = {
  email: string;
  userId: string;
  /** Display tier name — "Growth" / "Scale" / "Agency Partner" / etc. */
  tier: string;
  /** MRR in cents (Stripe convention). 2900 → $29.00/mo. */
  mrrCents: number;
  /** ISO 4217 currency code, e.g. "usd". Stored lowercase per Stripe. */
  currency: string;
  subscriptionId: string;
  /** Optional. Days between users.createdAt and now. Undefined when the
   *  webhook can't trivially look up the user row. */
  signupToPaidDays?: number;
};

export type UsageCapAlertParams = {
  /** The AGENCY operator's own display context — which client breached. */
  agencyName: string;
  /** The client sub-account's name. */
  clientName: string;
  /** The client workspace slug, for a quick reference. */
  clientOrgSlug: string;
  /** Estimated spend this period, in cents. */
  estCostCents: number;
  /** The configured cap, in cents. */
  capCents: number;
  /** "notify" | "pause" — what happens as a result of this breach. */
  mode: "notify" | "pause";
  /** The recipient — the AGENCY OWNER's email (not the platform ops inbox).
   *  Falls back to resolveOpsNotificationRecipient's default only when the
   *  caller can't resolve an owner email (shouldn't happen in practice —
   *  callers resolve this from partner_agencies before calling). */
  toEmail: string;
};

export type NewLeadAlertParams = {
  /** The SMB the lead reached out to (workspace name). */
  businessName: string;
  /** Lead's name as typed in the form. */
  name: string;
  /** Lead's phone (E.164 preferred, but rendered verbatim). */
  phone: string;
  /** What they need — the third form field. */
  need: string;
  /** Workspace slug, for a quick "which workspace" reference line. */
  orgSlug: string;
};

type OpsNotificationDeps = {
  /** Injectable for unit tests. Defaults to globalThis.fetch in prod. */
  fetcher?: typeof fetch;
  /** Resend API key. Falls back to RESEND_API_KEY env var. Pass empty
   *  string to skip the send (no-op + log). */
  apiKey?: string;
  /** Override for the recipient lookup and from-address. Defaults to
   *  process.env. Test-only — production callers omit this. */
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
};

/**
 * Pick the recipient address. Env override wins; otherwise the hardcoded
 * default. Empty / whitespace env values are ignored so a misconfigured
 * deployment doesn't silently drop alerts.
 */
export function resolveOpsNotificationRecipient(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): string {
  const override = typeof env.OPS_NOTIFICATION_EMAIL === "string" ? env.OPS_NOTIFICATION_EMAIL.trim() : "";
  return override || OPS_NOTIFICATION_EMAIL_DEFAULT;
}

/**
 * Format MRR cents → human-readable currency string.
 *
 *   formatMrr(2900, "usd") → "USD $29.00"
 *   formatMrr(2500, "eur") → "EUR 25.00"
 *
 * USD gets the $ symbol because that's what the recipient (founder)
 * reads daily; other currencies use the code only to avoid hardcoding
 * a symbol table.
 */
export function formatMrr(cents: number, currency: string): string {
  const code = (currency || "usd").toUpperCase();
  const amount = (cents / 100).toFixed(2);
  if (code === "USD") {
    return `USD $${amount}`;
  }
  return `${code} ${amount}`;
}

function resolveFromAddress(env: NodeJS.ProcessEnv | Record<string, string | undefined>): string {
  // Prefer an explicit ops sender if configured; otherwise fall back
  // to DEFAULT_FROM_EMAIL (used everywhere else in the app) and finally
  // the hardcoded verified seldonframe.com sender.
  const ops = typeof env.OPS_NOTIFICATION_FROM === "string" ? env.OPS_NOTIFICATION_FROM.trim() : "";
  if (ops) return ops;

  const def = typeof env.DEFAULT_FROM_EMAIL === "string" ? env.DEFAULT_FROM_EMAIL.trim() : "";
  // resolveDefaultFromEmail() returns "hello@seldonframe.local" when
  // DEFAULT_FROM_EMAIL isn't set; .local domains aren't verified in
  // Resend so prefer our verified welcome@ sender as the floor.
  if (def && def !== "hello@seldonframe.local") return def;

  // resolveDefaultFromEmail is imported so the dependency is explicit
  // even though we override its fallback above; keeps the surface
  // discoverable for future-self.
  void resolveDefaultFromEmail;
  return DEFAULT_OPS_FROM;
}

function resolveApiKey(
  override: string | undefined,
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): string {
  if (typeof override === "string") return override;
  const envKey = typeof env.RESEND_API_KEY === "string" ? env.RESEND_API_KEY.trim() : "";
  const authKey = typeof env.AUTH_RESEND_KEY === "string" ? env.AUTH_RESEND_KEY.trim() : "";
  return envKey || authKey;
}

/**
 * Internal: dispatch one email via Resend. Returns void — never throws.
 * Logs every failure as a structured JSON blob so the alert pipeline
 * itself stays observable from Vercel function logs.
 */
async function dispatch(params: {
  event:
    | "new_signup"
    | "paid_conversion"
    | "new_lead"
    | "usage_cap_breach"
    | "retainer_payment_failed"
    | "replay_heartbeat_silent";
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
  apiKey: string;
  fetcher: typeof fetch;
}): Promise<void> {
  if (!params.apiKey) {
    console.warn(
      JSON.stringify({
        event: "ops_notification_skipped",
        reason: "no_api_key",
        type: params.event,
        to: params.to,
      }),
    );
    return;
  }

  try {
    const response = await params.fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: params.from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
        tags: [
          { name: "category", value: "ops_notification" },
          { name: "event", value: params.event },
        ],
      }),
    });

    if (!response.ok) {
      let detail = "";
      try {
        detail = await response.text();
      } catch {
        detail = "<no body>";
      }
      console.warn(
        JSON.stringify({
          event: "ops_notification_failed",
          type: params.event,
          to: params.to,
          status: response.status,
          detail: detail.slice(0, 300),
        }),
      );
    }
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "ops_notification_failed",
        type: params.event,
        to: params.to,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Send the "new free signup" alert. Fires once per brand-new users
 * row insert from NextAuth's events.createUser callback.
 *
 * Never throws. A Resend outage logs to stdout but otherwise returns
 * silently so the signup flow proceeds.
 */
export async function sendNewSignupAlert(
  params: NewSignupAlertParams,
  deps: OpsNotificationDeps = {},
): Promise<void> {
  const env = deps.env ?? process.env;
  const fetcher = deps.fetcher ?? globalThis.fetch;
  const apiKey = resolveApiKey(deps.apiKey, env);
  const to = resolveOpsNotificationRecipient(env);
  const from = resolveFromAddress(env);

  const source = params.source && params.source.trim().length > 0 ? params.source.trim() : "direct";
  const subject = `New SeldonFrame signup: ${params.email}`;
  const createdAtIso = params.createdAt.toISOString();

  const text = `New free account just created.

Email: ${params.email}
User ID: ${params.userId}
Signed up: ${createdAtIso}
Source: ${source}

Reach out within the first hour for highest activation.`;

  const safeEmail = escapeHtml(params.email);
  const safeUserId = escapeHtml(params.userId);
  const safeSource = escapeHtml(source);
  const safeCreated = escapeHtml(createdAtIso);

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#0b0b10;padding:20px 24px;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#9aa0a6;margin-bottom:6px;">SeldonFrame Ops</div>
          <div style="font-size:20px;font-weight:600;line-height:1.25;">New free account just created.</div>
        </td></tr>
        <tr><td style="padding:20px 24px;font-size:14px;line-height:1.6;color:#1a1a1f;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:4px 0;color:#6b7280;width:120px;">Email</td><td style="padding:4px 0;font-weight:500;">${safeEmail}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;">User ID</td><td style="padding:4px 0;font-family:monospace;font-size:13px;">${safeUserId}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;">Signed up</td><td style="padding:4px 0;">${safeCreated}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;">Source</td><td style="padding:4px 0;">${safeSource}</td></tr>
          </table>
          <p style="margin:16px 0 0 0;font-size:13px;color:#6b7280;">Reach out within the first hour for highest activation.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await dispatch({
    event: "new_signup",
    to,
    from,
    subject,
    text,
    html,
    apiKey,
    fetcher,
  });
}

/**
 * Send the "paid conversion" alert. Fires from the Stripe webhook
 * handler on customer.subscription.created.
 *
 * Never throws. A Resend outage logs to stdout but otherwise returns
 * silently so the webhook returns 2xx to Stripe (no retry storm).
 */
export async function sendPaidConversionAlert(
  params: PaidConversionAlertParams,
  deps: OpsNotificationDeps = {},
): Promise<void> {
  const env = deps.env ?? process.env;
  const fetcher = deps.fetcher ?? globalThis.fetch;
  const apiKey = resolveApiKey(deps.apiKey, env);
  const to = resolveOpsNotificationRecipient(env);
  const from = resolveFromAddress(env);

  const mrr = formatMrr(params.mrrCents, params.currency);
  // Subject uses the emoji prefix as a hard-to-miss visual marker in
  // the inbox — "💰" jumps out among normal signup alerts and lets
  // the founder eyeball which alerts are revenue events.
  const subject = `💰 Paid conversion: ${params.email} → ${params.tier} (${mrr}/mo)`;

  const signupLine =
    typeof params.signupToPaidDays === "number"
      ? `Signup → paid: ${params.signupToPaidDays} days\n`
      : "";

  const text = `A user just upgraded to a paid plan.

Email: ${params.email}
Tier: ${params.tier}
MRR: ${mrr}/mo
Subscription ID: ${params.subscriptionId}
${signupLine}`;

  const safeEmail = escapeHtml(params.email);
  const safeTier = escapeHtml(params.tier);
  const safeMrr = escapeHtml(mrr);
  const safeSubId = escapeHtml(params.subscriptionId);
  const safeUserId = escapeHtml(params.userId);
  const signupRow =
    typeof params.signupToPaidDays === "number"
      ? `<tr><td style="padding:4px 0;color:#6b7280;">Signup → paid</td><td style="padding:4px 0;">${params.signupToPaidDays} days</td></tr>`
      : "";

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#047857;padding:20px 24px;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#a7f3d0;margin-bottom:6px;">SeldonFrame Ops · Revenue</div>
          <div style="font-size:20px;font-weight:600;line-height:1.25;">💰 ${safeEmail} just upgraded to ${safeTier}</div>
        </td></tr>
        <tr><td style="padding:20px 24px;font-size:14px;line-height:1.6;color:#1a1a1f;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:4px 0;color:#6b7280;width:130px;">Email</td><td style="padding:4px 0;font-weight:500;">${safeEmail}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;">Tier</td><td style="padding:4px 0;font-weight:600;">${safeTier}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;">MRR</td><td style="padding:4px 0;font-weight:600;color:#047857;">${safeMrr}/mo</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;">Subscription</td><td style="padding:4px 0;font-family:monospace;font-size:13px;">${safeSubId}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;">User ID</td><td style="padding:4px 0;font-family:monospace;font-size:13px;">${safeUserId}</td></tr>
            ${signupRow}
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await dispatch({
    event: "paid_conversion",
    to,
    from,
    subject,
    text,
    html,
    apiKey,
    fetcher,
  });
}

/**
 * Send the "new lead" alert to the operator. Fires from the public
 * lead-form action on every submission (create or upsert).
 *
 * Mirrors sendNewSignupAlert: platform-level send (one global recipient,
 * no per-workspace Resend lookup, no suppression, no DB write) so it has
 * NO Twilio/workspace dependency and works even on demos with no email
 * integration configured. Never throws — a Resend outage logs to stdout
 * but the lead-form submission still succeeds.
 */
export async function sendNewLeadAlert(
  params: NewLeadAlertParams,
  deps: OpsNotificationDeps = {},
): Promise<void> {
  const env = deps.env ?? process.env;
  const fetcher = deps.fetcher ?? globalThis.fetch;
  const apiKey = resolveApiKey(deps.apiKey, env);
  const to = resolveOpsNotificationRecipient(env);
  const from = resolveFromAddress(env);

  const subject = `New lead — ${params.name} · ${params.phone}`;

  const text = `New lead captured from the ${params.businessName} landing page.

Name: ${params.name}
Phone: ${params.phone}
Need: ${params.need}
Workspace: ${params.orgSlug}

Follow up fast — speed-to-lead wins the job.`;

  const safeBusiness = escapeHtml(params.businessName);
  const safeName = escapeHtml(params.name);
  const safePhone = escapeHtml(params.phone);
  const safeNeed = escapeHtml(params.need);
  const safeSlug = escapeHtml(params.orgSlug);

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#0b0b10;padding:20px 24px;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#9aa0a6;margin-bottom:6px;">${safeBusiness} · New lead</div>
          <div style="font-size:20px;font-weight:600;line-height:1.25;">${safeName} just reached out.</div>
        </td></tr>
        <tr><td style="padding:20px 24px;font-size:14px;line-height:1.6;color:#1a1a1f;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:4px 0;color:#6b7280;width:120px;">Name</td><td style="padding:4px 0;font-weight:500;">${safeName}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;">Phone</td><td style="padding:4px 0;font-weight:500;">${safePhone}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;">Need</td><td style="padding:4px 0;">${safeNeed}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;">Workspace</td><td style="padding:4px 0;font-family:monospace;font-size:13px;">${safeSlug}</td></tr>
          </table>
          <p style="margin:16px 0 0 0;font-size:13px;color:#6b7280;">Follow up fast — speed-to-lead wins the job.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await dispatch({
    event: "new_lead",
    to,
    from,
    subject,
    text,
    html,
    apiKey,
    fetcher,
  });
}

/**
 * Send the "usage cap breach" alert to the AGENCY OWNER (not the platform ops
 * inbox — `params.toEmail` is the agency owner's own email, resolved by the
 * caller from partner_agencies). Fires once per period per sub-account (the
 * once-per-period idempotency is enforced by the caller via
 * evaluateUsageCap/lastNotifiedPeriod BEFORE calling this — this function
 * always sends when called).
 *
 * Never throws — same fail-soft contract as every other function in this
 * module: a Resend outage logs to stdout and the caller's flow continues
 * (dashboard render / cron loop) uninterrupted.
 */
export async function sendUsageCapAlert(
  params: UsageCapAlertParams,
  deps: OpsNotificationDeps = {},
): Promise<void> {
  const env = deps.env ?? process.env;
  const fetcher = deps.fetcher ?? globalThis.fetch;
  const apiKey = resolveApiKey(deps.apiKey, env);
  const from = resolveFromAddress(env);

  const estDollars = (params.estCostCents / 100).toFixed(2);
  const capDollars = (params.capCents / 100).toFixed(2);
  const actionLine =
    params.mode === "pause"
      ? "The agent will send a holding reply and stop responding with AI until you raise the cap."
      : "The agent keeps responding — this is a notify-only cap.";

  const subject = `Usage cap reached — ${params.clientName} (~$${estDollars} of $${capDollars} estimated)`;

  const text = `${params.clientName}'s estimated AI usage this month has crossed the cap you set.

Client: ${params.clientName}
Workspace: ${params.clientOrgSlug}
Estimated cost: ~$${estDollars}
Cap: $${capDollars}
Mode: ${params.mode}

${actionLine}

Costs are estimated by SeldonFrame's internal price table — under BYOK the real bill is your provider's, billed at their rates.`;

  const safeClientName = escapeHtml(params.clientName);
  const safeSlug = escapeHtml(params.clientOrgSlug);
  const safeAction = escapeHtml(actionLine);

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#b45309;padding:20px 24px;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#fde68a;margin-bottom:6px;">Usage cap reached</div>
          <div style="font-size:20px;font-weight:600;line-height:1.25;">${safeClientName} crossed its usage cap</div>
        </td></tr>
        <tr><td style="padding:20px 24px;font-size:14px;line-height:1.6;color:#1a1a1f;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:4px 0;color:#6b7280;width:130px;">Client</td><td style="padding:4px 0;font-weight:500;">${safeClientName}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;">Workspace</td><td style="padding:4px 0;font-family:monospace;font-size:13px;">${safeSlug}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;">Estimated cost</td><td style="padding:4px 0;font-weight:600;">~$${estDollars}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;">Cap</td><td style="padding:4px 0;">$${capDollars}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;">Mode</td><td style="padding:4px 0;text-transform:capitalize;">${params.mode}</td></tr>
          </table>
          <p style="margin:16px 0 0 0;font-size:13px;color:#6b7280;">${safeAction}</p>
          <p style="margin:8px 0 0 0;font-size:12px;color:#9ca3af;">Estimated by SeldonFrame's internal price table — billed by your provider at their rates.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await dispatch({
    event: "usage_cap_breach",
    to: params.toEmail,
    from,
    subject,
    text,
    html,
    apiKey,
    fetcher,
  });
}

export type PaymentFailedAlertParams = {
  /** The AGENCY owner's own display name. */
  agencyName: string;
  /** The AGENCY owner's own email — resolved by the caller (mirrors
   *  sendUsageCapAlert's toEmail contract, NOT the platform ops inbox). */
  toEmail: string;
  amount: string;
  currency: string;
  /** Which dunning notice this is (1 = day-3 first notice, 2 = day-7 second
   *  notice — Task 4's escalation stages). */
  stage: number;
};

/**
 * Sibling of sendUsageCapAlert — notifies the AGENCY OWNER that a client's
 * retainer card was declined (Autopay console Task 4, dunning). Stripe's own
 * smart retries handle re-charging the card; this is a notify-only alert.
 * Never throws — same fail-soft contract as every other function here.
 */
export async function sendPaymentFailedAlert(
  params: PaymentFailedAlertParams,
  deps: OpsNotificationDeps = {},
): Promise<void> {
  const env = deps.env ?? process.env;
  const fetcher = deps.fetcher ?? globalThis.fetch;
  const apiKey = resolveApiKey(deps.apiKey, env);
  const from = resolveFromAddress(env);

  const amountDisplay = `$${Number(params.amount).toFixed(2)} ${params.currency}`;
  const noticeLabel = params.stage >= 2 ? "Second notice" : "First notice";

  const subject = `Retainer payment failed — ${amountDisplay} (${noticeLabel})`;

  const text = `A client's retainer payment failed.

Amount: ${amountDisplay}
Notice: ${noticeLabel}

Stripe is automatically retrying the charge on the card on file. The client has also been emailed a link to update their payment method or pay the outstanding invoice directly.`;

  const safeAmount = escapeHtml(amountDisplay);
  const safeNotice = escapeHtml(noticeLabel);

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#b91c1c;padding:20px 24px;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#fecaca;margin-bottom:6px;">Retainer payment failed</div>
          <div style="font-size:20px;font-weight:600;line-height:1.25;">${safeAmount} — ${safeNotice}</div>
        </td></tr>
        <tr><td style="padding:20px 24px;font-size:14px;line-height:1.6;color:#1a1a1f;">
          <p style="margin:0;">Stripe is automatically retrying the charge on the card on file.</p>
          <p style="margin:8px 0 0 0;color:#6b7280;font-size:13px;">The client has also been emailed a link to update their payment method or pay the outstanding invoice directly.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await dispatch({
    event: "retainer_payment_failed",
    to: params.toEmail,
    from,
    subject,
    text,
    html,
    apiKey,
    fetcher,
  });
}

export type HeartbeatSilentDeploymentRow = {
  deploymentId: string;
  clientName: string;
  orgName: string | null;
  orgId: string;
  /** Hours since the deployment's last agent_workflow_traces row. Always a
   *  number here (a 'silent' row always has a prior lastActivityAt — see
   *  heartbeat.ts's computeHeartbeat; 'never' rows are never passed to this
   *  function). */
  hoursSinceActivity: number;
};

export type ReplayHeartbeatAlertParams = {
  /** Only 'silent' deployments — the caller (the cron route) filters before
   *  calling; this function sends unconditionally when invoked. */
  silentDeployments: HeartbeatSilentDeploymentRow[];
};

/**
 * Send the "replay heartbeat" alert — the inbound-chain dead-man's switch
 * (roadmap #7). Fires from the replay-heartbeat cron ONLY when at least one
 * ACTIVE email-surface deployment has gone silent (no agent_workflow_traces
 * row) for more than 24h — the exact shape of the 2026-07-16 incident where
 * the email-agent chain died silently for two days before anyone noticed.
 *
 * Platform-level send (one global recipient, no per-workspace Resend
 * lookup) — mirrors sendNewSignupAlert/sendNewLeadAlert. Never throws — the
 * cron route must always return 200 for the cron log even if Resend is down.
 */
export async function sendReplayHeartbeatAlert(
  params: ReplayHeartbeatAlertParams,
  deps: OpsNotificationDeps = {},
): Promise<void> {
  const env = deps.env ?? process.env;
  const fetcher = deps.fetcher ?? globalThis.fetch;
  const apiKey = resolveApiKey(deps.apiKey, env);
  const to = resolveOpsNotificationRecipient(env);
  const from = resolveFromAddress(env);

  const n = params.silentDeployments.length;
  const subject = `Replay heartbeat: ${n} deployment(s) silent >24h`;

  const textRows = params.silentDeployments
    .map(
      (d) =>
        `- ${d.clientName} (deployment ${d.deploymentId}) — org ${d.orgName ?? d.orgId} — last activity ${d.hoursSinceActivity.toFixed(1)}h ago`,
    )
    .join("\n");

  const text = `${n} active email deployment(s) have had no activity in over 24 hours.

${textRows}

This is the daily inbound-chain heartbeat check — it catches a deployment going silent (e.g. a canceled upstream connection) before it goes unnoticed for days.`;

  const htmlRows = params.silentDeployments
    .map((d) => {
      const safeName = escapeHtml(d.clientName);
      const safeOrg = escapeHtml(d.orgName ?? d.orgId);
      const safeDeploymentId = escapeHtml(d.deploymentId);
      const hours = d.hoursSinceActivity.toFixed(1);
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${safeName}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:12px;">${safeDeploymentId}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${safeOrg}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${hours}h ago</td>
      </tr>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#b91c1c;padding:20px 24px;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#fecaca;margin-bottom:6px;">Replay heartbeat</div>
          <div style="font-size:20px;font-weight:600;line-height:1.25;">${n} deployment(s) silent &gt;24h</div>
        </td></tr>
        <tr><td style="padding:20px 24px;font-size:14px;line-height:1.6;color:#1a1a1f;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <thead>
              <tr>
                <th align="left" style="padding:6px 8px;border-bottom:2px solid #e5e7eb;color:#6b7280;font-size:12px;text-transform:uppercase;">Deployment</th>
                <th align="left" style="padding:6px 8px;border-bottom:2px solid #e5e7eb;color:#6b7280;font-size:12px;text-transform:uppercase;">ID</th>
                <th align="left" style="padding:6px 8px;border-bottom:2px solid #e5e7eb;color:#6b7280;font-size:12px;text-transform:uppercase;">Org</th>
                <th align="left" style="padding:6px 8px;border-bottom:2px solid #e5e7eb;color:#6b7280;font-size:12px;text-transform:uppercase;">Last activity</th>
              </tr>
            </thead>
            <tbody>
              ${htmlRows}
            </tbody>
          </table>
          <p style="margin:16px 0 0 0;font-size:13px;color:#6b7280;">Daily inbound-chain heartbeat check — catches a canceled/broken email deployment before it goes unnoticed for days.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await dispatch({
    event: "replay_heartbeat_silent",
    to,
    from,
    subject,
    text,
    html,
    apiKey,
    fetcher,
  });
}
