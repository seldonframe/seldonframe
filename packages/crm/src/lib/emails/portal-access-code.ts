// ============================================================================
// v1.16.1 — portal access-code email
// ============================================================================
//
// Sent when a customer hits /portal/<orgSlug>/login and enters their
// email. The action requestPortalAccessCodeAction generates a 6-digit
// code, hashes + persists it, and (post-v1.16.1) calls this sender.
//
// Pre-v1.16.1 the code sat in the DB unread — no email infrastructure
// was wired up to deliver it. Customers got "no email arrived" with
// no error.
//
// Mirrors the device-auth email pattern (Resend HTTPS POST with
// verified welcome@seldonframe.com sender). Same DEFAULT_FROM,
// same fallback handling for sandbox addresses.

const DEFAULT_FROM = "SeldonFrame <welcome@seldonframe.com>";
const SANDBOX_FROM_PATTERN = /@resend\.dev>?$/i;

export interface PortalAccessCodeEmailRequest {
  email: string;
  workspaceName: string;
  /** The 6-digit plaintext code. The DB only stores its hash. */
  code: string;
  /** Minutes until the code expires (display only). */
  expiresInMinutes: number;
  /** v1.18 — partner-agency branding overrides. NULL = SeldonFrame
   *  defaults (existing behavior). When set, the agency's brand
   *  replaces SF in subject + footer. */
  brandName?: string | null;
  logoUrl?: string | null;
  supportUrl?: string | null;
}

export interface PortalAccessCodeEmailDeps {
  fetcher?: typeof fetch;
  apiKey: string;
  fromAddress: string;
}

export type PortalAccessCodeSendResult =
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

export function portalAccessCodeEmailSubject(req: PortalAccessCodeEmailRequest): string {
  // v1.18 — when an agency brand is provided, address the customer
  // with the agency's name + the workspace name. Otherwise plain
  // workspace-name subject (existing behavior).
  if (req.brandName) {
    return `Your ${req.workspaceName} sign-in code: ${req.code}`;
  }
  return `Your ${req.workspaceName} sign-in code: ${req.code}`;
}

export function renderPortalAccessCodeEmailHtml(
  req: PortalAccessCodeEmailRequest,
): string {
  const safeWorkspace = escapeHtml(req.workspaceName);
  const safeCode = escapeHtml(req.code);
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
<p style="margin:0 0 16px;color:#444;">Enter this 6-digit code on the sign-in page to access your account:</p>
<p style="margin:0 0 24px;text-align:center;">
  <span style="display:inline-block;background:#f5f5f3;border:1px solid #e5e5e1;border-radius:8px;padding:16px 32px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:28px;font-weight:600;letter-spacing:6px;color:#111;">${safeCode}</span>
</p>
<p style="margin:0 0 8px;color:#666;font-size:13px;">This code expires in ${req.expiresInMinutes} minutes. If you didn't request it, you can safely ignore this email.</p>
</td></tr>
</table>
${renderFooter(req)}
</td></tr>
</table>
</body>
</html>`;
}

function renderFooter(req: PortalAccessCodeEmailRequest): string {
  const safeWorkspace = escapeHtml(req.workspaceName);
  // v1.18 — if branded by a partner agency, replace "SeldonFrame"
  // with the agency name + link. Falls back to SF defaults.
  if (req.brandName) {
    const safeBrand = escapeHtml(req.brandName);
    const supportUrl = req.supportUrl
      ? escapeHtml(req.supportUrl)
      : "https://seldonframe.com";
    return `<p style="margin:16px 0 0;color:#999;font-size:12px;">${safeWorkspace} on ${safeBrand} · <a href="${supportUrl}" style="color:#666;">${escapeHtml(req.supportUrl ?? "")}</a></p>`;
  }
  return `<p style="margin:16px 0 0;color:#999;font-size:12px;">${safeWorkspace} on SeldonFrame · <a href="https://seldonframe.com" style="color:#666;">seldonframe.com</a></p>`;
}

export function renderPortalAccessCodeEmailText(
  req: PortalAccessCodeEmailRequest,
): string {
  const platformLine = req.brandName
    ? `— ${req.workspaceName} on ${req.brandName}`
    : `— ${req.workspaceName} on SeldonFrame`;
  return [
    `Sign in to ${req.workspaceName}`,
    "",
    `Enter this 6-digit code on the sign-in page:`,
    "",
    `    ${req.code}`,
    "",
    `This code expires in ${req.expiresInMinutes} minutes.`,
    "",
    `If you didn't request it, you can safely ignore this email.`,
    "",
    platformLine,
  ].join("\n");
}

export async function sendPortalAccessCodeEmail(
  req: PortalAccessCodeEmailRequest,
  deps: PortalAccessCodeEmailDeps,
): Promise<PortalAccessCodeSendResult> {
  const fetcher = deps.fetcher ?? globalThis.fetch;
  const subject = portalAccessCodeEmailSubject(req);
  const html = renderPortalAccessCodeEmailHtml(req);
  const text = renderPortalAccessCodeEmailText(req);

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
        tags: [{ name: "category", value: "portal-access-code" }],
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
      `[portal-access-code-email] Resend ${response.status}: ${detail || "(no detail)"} from=${deps.fromAddress}`,
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
