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
  event: "new_signup" | "paid_conversion";
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
