// ============================================================================
// v1.20.0 — operator-portal magic-link email
// ============================================================================
//
// Sent when an agency operator (Acme AI) invites their sub-tenant
// operator (Cypress & Pine HVAC owner) to access the workspace's
// branded admin portal at /portal/<orgSlug>.
//
// Distinct from the customer-portal access-code email (v1.16.1):
//   - audience: business operator, NOT homeowner
//   - delivery: clickable magic link, NOT 6-digit code (operators
//     are technical enough for one-click; customers benefit from
//     the lower-friction "type 6 digits on the page you're already on")
//   - copy: business-grade ("you've been invited to manage Cypress &
//     Pine HVAC's CRM"), not consumer-grade ("here's your sign-in code")
//   - branding: same partner-agency overrides as portal-access-code so
//     the email goes FROM agency_domain when verified, footer says
//     "on Acme AI" instead of "on SeldonFrame"

const DEFAULT_FROM = "SeldonFrame <welcome@seldonframe.com>";
const SANDBOX_FROM_PATTERN = /@resend\.dev>?$/i;

export interface OperatorMagicLinkEmailRequest {
  email: string;
  workspaceName: string;
  /** Full clickable URL — already includes the magic-link token in
   *  the query string. Example: https://app.seldonframe.com/portal/
   *  cypress-pine-hvac/magic?token=... */
  inviteUrl: string;
  /** Minutes until the magic link expires (display only). */
  expiresInMinutes: number;
  /** v1.20 — partner-agency branding overrides. Same shape as
   *  portal-access-code email; null = SeldonFrame defaults. */
  brandName?: string | null;
  logoUrl?: string | null;
  supportUrl?: string | null;
  /** Optional — name of the person who issued the invite. Surfaced
   *  in the email as "Maxime invited you to ..." for trust + context. */
  invitedByName?: string | null;
}

export interface OperatorMagicLinkEmailDeps {
  fetcher?: typeof fetch;
  apiKey: string;
  fromAddress: string;
}

export type OperatorMagicLinkSendResult =
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

export function operatorMagicLinkEmailSubject(
  req: OperatorMagicLinkEmailRequest,
): string {
  return `Sign in to ${req.workspaceName}`;
}

export function renderOperatorMagicLinkEmailHtml(
  req: OperatorMagicLinkEmailRequest,
): string {
  const safeWorkspace = escapeHtml(req.workspaceName);
  const safeUrl = escapeHtml(req.inviteUrl);
  const invitedByLine = req.invitedByName
    ? `<p style="margin:0 0 12px;color:#444;">${escapeHtml(req.invitedByName)} invited you to manage ${safeWorkspace}.</p>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Sign in to ${safeWorkspace}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111;line-height:1.55;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f5f3;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;background:#ffffff;border:1px solid #e5e5e1;border-radius:12px;padding:32px;">
<tr><td>
<h1 style="margin:0 0 16px;font-size:22px;font-weight:600;letter-spacing:-0.01em;">Sign in to ${safeWorkspace}</h1>
${invitedByLine}
<p style="margin:0 0 24px;color:#444;">Click the button below to access your CRM dashboard. The link is single-use and expires in ${req.expiresInMinutes} minutes.</p>
<p style="margin:0 0 24px;text-align:center;">
  <a href="${safeUrl}" style="display:inline-block;background:#111;border:1px solid #111;border-radius:8px;padding:14px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.01em;">Sign in to ${safeWorkspace}</a>
</p>
<p style="margin:0 0 8px;color:#666;font-size:12px;">If the button doesn't work, copy and paste this URL into your browser:</p>
<p style="margin:0 0 16px;color:#666;font-size:12px;word-break:break-all;"><a href="${safeUrl}" style="color:#666;">${safeUrl}</a></p>
<p style="margin:0;color:#666;font-size:13px;">If you didn't request this, you can safely ignore this email — your account stays secure.</p>
</td></tr>
</table>
${renderFooter(req)}
</td></tr>
</table>
</body>
</html>`;
}

function renderFooter(req: OperatorMagicLinkEmailRequest): string {
  const safeWorkspace = escapeHtml(req.workspaceName);
  if (req.brandName) {
    const safeBrand = escapeHtml(req.brandName);
    const supportUrl = req.supportUrl
      ? escapeHtml(req.supportUrl)
      : "https://seldonframe.com";
    return `<p style="margin:16px 0 0;color:#999;font-size:12px;">${safeWorkspace} on ${safeBrand} · <a href="${supportUrl}" style="color:#666;">${escapeHtml(req.supportUrl ?? "")}</a></p>`;
  }
  return `<p style="margin:16px 0 0;color:#999;font-size:12px;">${safeWorkspace} on SeldonFrame · <a href="https://seldonframe.com" style="color:#666;">seldonframe.com</a></p>`;
}

export function renderOperatorMagicLinkEmailText(
  req: OperatorMagicLinkEmailRequest,
): string {
  const platformLine = req.brandName
    ? `— ${req.workspaceName} on ${req.brandName}`
    : `— ${req.workspaceName} on SeldonFrame`;
  const invitedByLine = req.invitedByName
    ? `${req.invitedByName} invited you to manage ${req.workspaceName}.\n\n`
    : "";
  return [
    `Sign in to ${req.workspaceName}`,
    "",
    invitedByLine + `Click the link below to access your CRM dashboard:`,
    "",
    `    ${req.inviteUrl}`,
    "",
    `The link is single-use and expires in ${req.expiresInMinutes} minutes.`,
    "",
    `If you didn't request this, you can safely ignore this email.`,
    "",
    platformLine,
  ].join("\n");
}

export async function sendOperatorMagicLinkEmail(
  req: OperatorMagicLinkEmailRequest,
  deps: OperatorMagicLinkEmailDeps,
): Promise<OperatorMagicLinkSendResult> {
  const fetcher = deps.fetcher ?? globalThis.fetch;
  const subject = operatorMagicLinkEmailSubject(req);
  const html = renderOperatorMagicLinkEmailHtml(req);
  const text = renderOperatorMagicLinkEmailText(req);

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
        tags: [{ name: "category", value: "operator-magic-link" }],
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
      `[operator-magic-link-email] Resend ${response.status}: ${detail || "(no detail)"} from=${deps.fromAddress}`,
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
