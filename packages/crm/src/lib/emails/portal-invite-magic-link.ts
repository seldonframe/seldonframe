// ============================================================================
// v1.20.1 — customer-portal magic-link invite email
// ============================================================================
//
// Sent when an OPERATOR invites a CUSTOMER to the homeowner-facing
// portal at /customer/<orgSlug>. Distinct from:
//
//   - portal-access-code.ts (lib/emails/) — used when the customer
//     SELF-INITIATES login by typing email at /customer/<slug>/login.
//     Customer gets a 6-digit code in the email; types it back on
//     the page they're already on.
//
//   - operator-magic-link.ts (lib/emails/) — used when an agency or
//     workspace owner invites a sub-tenant OPERATOR to /portal/<slug>
//     for full CRM admin access. Different audience, different
//     destination URL, different copy.
//
// The flow we ship in v1.20.1:
//   1. Operator on /contacts/<id> clicks "Send invite email"
//   2. Backend mints a portal magic-link via createPortalMagicLink
//      (existing primitive — produces a /customer/<slug>/magic?token=
//      URL bound to a specific contactId)
//   3. We email this URL (not a 6-digit code)
//   4. Customer clicks → /customer/<slug>/magic verifies token →
//      sets session cookie → lands at /customer/<slug>
//
// Why this fixes the v1.18 → v1.20 UX gap: pre-1.20.1 the customer
// got an email containing just "your code is 712420" with NO clickable
// URL. They had to know to navigate to /customer/<slug>/login
// themselves. Most customers don't know the URL — invite drop-off
// was high and unattributable. Magic-link is one click in their inbox.

const DEFAULT_FROM = "SeldonFrame <welcome@seldonframe.com>";
const SANDBOX_FROM_PATTERN = /@resend\.dev>?$/i;

export interface PortalInviteMagicLinkEmailRequest {
  email: string;
  workspaceName: string;
  /** Full clickable URL — already includes the magic-link token in
   *  the query string. Example: https://app.seldonframe.com/customer/
   *  cypress-pine-hvac/magic?token=... */
  inviteUrl: string;
  /** Minutes until the magic link expires (display only). */
  expiresInMinutes: number;
  /** Optional — contact's first name for personalization. Falls
   *  back to a generic "Hello" greeting when null. */
  firstName?: string | null;
  /** v1.18+ partner-agency branding overrides (same shape as the
   *  other portal emails). Null = SeldonFrame defaults. */
  brandName?: string | null;
  logoUrl?: string | null;
  supportUrl?: string | null;
}

export interface PortalInviteMagicLinkEmailDeps {
  fetcher?: typeof fetch;
  apiKey: string;
  fromAddress: string;
}

export type PortalInviteMagicLinkSendResult =
  | { ok: true; messageId: string }
  | { ok: false; status: number; error: string };

export function pickFromAddress(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): string {
  const configured =
    typeof env.RESEND_FROM_ADDRESS === "string"
      ? env.RESEND_FROM_ADDRESS.trim()
      : "";
  if (configured && SANDBOX_FROM_PATTERN.test(configured)) {
    return DEFAULT_FROM;
  }
  if (configured && !/seldonframe\.com>?$/i.test(configured)) {
    return DEFAULT_FROM;
  }
  return configured || DEFAULT_FROM;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function portalInviteMagicLinkEmailSubject(
  req: PortalInviteMagicLinkEmailRequest,
): string {
  return `You're invited to ${req.workspaceName}'s client portal`;
}

export function renderPortalInviteMagicLinkEmailHtml(
  req: PortalInviteMagicLinkEmailRequest,
): string {
  const safeWorkspace = escapeHtml(req.workspaceName);
  const safeUrl = escapeHtml(req.inviteUrl);
  const greeting = req.firstName
    ? `Hi ${escapeHtml(req.firstName)},`
    : "Hi there,";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>You're invited to ${safeWorkspace}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111;line-height:1.55;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f5f3;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;background:#ffffff;border:1px solid #e5e5e1;border-radius:12px;padding:32px;">
<tr><td>
<h1 style="margin:0 0 16px;font-size:22px;font-weight:600;letter-spacing:-0.01em;">You&rsquo;re invited to ${safeWorkspace}</h1>
<p style="margin:0 0 16px;color:#444;">${greeting}</p>
<p style="margin:0 0 24px;color:#444;">${safeWorkspace} just gave you access to your client portal &mdash; one place to see your appointments, documents, and messages with us. Click below to sign in.</p>
<p style="margin:0 0 24px;text-align:center;">
  <a href="${safeUrl}" style="display:inline-block;background:#111;border:1px solid #111;border-radius:8px;padding:14px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.01em;">Sign in to ${safeWorkspace}</a>
</p>
<p style="margin:0 0 8px;color:#666;font-size:12px;">If the button doesn&rsquo;t work, copy and paste this URL into your browser:</p>
<p style="margin:0 0 16px;color:#666;font-size:12px;word-break:break-all;"><a href="${safeUrl}" style="color:#666;">${safeUrl}</a></p>
<p style="margin:0;color:#666;font-size:13px;">The link expires in ${req.expiresInMinutes} minutes. If you didn&rsquo;t expect this invite, you can safely ignore the email.</p>
</td></tr>
</table>
${renderFooter(req)}
</td></tr>
</table>
</body>
</html>`;
}

function renderFooter(req: PortalInviteMagicLinkEmailRequest): string {
  const safeWorkspace = escapeHtml(req.workspaceName);
  if (req.brandName) {
    const safeBrand = escapeHtml(req.brandName);
    const supportUrl = req.supportUrl
      ? escapeHtml(req.supportUrl)
      : "https://seldonframe.com";
    return `<p style="margin:16px 0 0;color:#999;font-size:12px;">${safeWorkspace} on ${safeBrand} &middot; <a href="${supportUrl}" style="color:#666;">${escapeHtml(req.supportUrl ?? "")}</a></p>`;
  }
  return `<p style="margin:16px 0 0;color:#999;font-size:12px;">${safeWorkspace} on SeldonFrame &middot; <a href="https://seldonframe.com" style="color:#666;">seldonframe.com</a></p>`;
}

export function renderPortalInviteMagicLinkEmailText(
  req: PortalInviteMagicLinkEmailRequest,
): string {
  const platformLine = req.brandName
    ? `— ${req.workspaceName} on ${req.brandName}`
    : `— ${req.workspaceName} on SeldonFrame`;
  const greeting = req.firstName ? `Hi ${req.firstName},` : "Hi there,";
  return [
    `You're invited to ${req.workspaceName}'s client portal`,
    "",
    greeting,
    "",
    `${req.workspaceName} just gave you access to your client portal — one place to see your appointments, documents, and messages with us.`,
    "",
    `Sign in here:`,
    "",
    `    ${req.inviteUrl}`,
    "",
    `The link expires in ${req.expiresInMinutes} minutes.`,
    "",
    `If you didn't expect this invite, you can safely ignore the email.`,
    "",
    platformLine,
  ].join("\n");
}

export async function sendPortalInviteMagicLinkEmail(
  req: PortalInviteMagicLinkEmailRequest,
  deps: PortalInviteMagicLinkEmailDeps,
): Promise<PortalInviteMagicLinkSendResult> {
  const fetcher = deps.fetcher ?? globalThis.fetch;
  const subject = portalInviteMagicLinkEmailSubject(req);
  const html = renderPortalInviteMagicLinkEmailHtml(req);
  const text = renderPortalInviteMagicLinkEmailText(req);

  let response: Response;
  try {
    response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${deps.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: deps.fromAddress,
        to: [req.email],
        subject,
        html,
        text,
        tags: [{ name: "category", value: "portal-invite-magic-link" }],
      }),
    });
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: `Resend request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!response.ok) {
    let detail = "";
    try {
      const data = (await response.json()) as { message?: string; error?: string };
      detail = data.message ?? data.error ?? "";
    } catch {
      try {
        detail = await response.text();
      } catch {
        detail = "";
      }
    }
    console.error(
      `[portal-invite-magic-link-email] Resend ${response.status}: ${detail || "(no detail)"} from=${deps.fromAddress}`,
    );
    return {
      ok: false,
      status: response.status,
      error: detail || `Resend send failed with ${response.status}`,
    };
  }

  let body: { id?: string };
  try {
    body = (await response.json()) as { id?: string };
  } catch {
    body = {};
  }
  return { ok: true, messageId: body.id ?? "" };
}
