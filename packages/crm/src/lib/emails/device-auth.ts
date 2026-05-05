// ============================================================================
// v1.7.0 — device-auth magic-link email
// ============================================================================
//
// Sent when an operator runs `connect_workspace` from a fresh IDE/device.
// Contains the approval URL (which opens the browser approval page).
// Uses the same Resend setup as the welcome email — verified
// welcome@seldonframe.com sender.

const DEFAULT_FROM = "SeldonFrame <welcome@seldonframe.com>";
const SANDBOX_FROM_PATTERN = /@resend\.dev>?$/i;

export interface DeviceAuthEmailRequest {
  email: string;
  workspaceName: string;
  workspaceSlug: string;
  deviceLabel: string;
  approvalUrl: string;
  expiresAt: string;
}

export interface DeviceAuthEmailDeps {
  fetcher?: typeof fetch;
  apiKey: string;
  fromAddress: string;
}

export type DeviceAuthSendResult =
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

export function deviceAuthEmailSubject(req: DeviceAuthEmailRequest): string {
  return `Authorize ${req.deviceLabel} for ${req.workspaceName}`;
}

export function renderDeviceAuthEmailHtml(req: DeviceAuthEmailRequest): string {
  const safeWorkspace = escapeHtml(req.workspaceName);
  const safeDevice = escapeHtml(req.deviceLabel);
  const safeUrl = escapeHtml(req.approvalUrl);
  const expiresIn = (() => {
    try {
      const ms = new Date(req.expiresAt).getTime() - Date.now();
      const min = Math.max(1, Math.round(ms / 60000));
      return `${min} minute${min === 1 ? "" : "s"}`;
    } catch {
      return "5 minutes";
    }
  })();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Authorize a new device for ${safeWorkspace}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111;line-height:1.55;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f5f3;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;background:#ffffff;border:1px solid #e5e5e1;border-radius:12px;padding:32px;">
<tr><td>
<h1 style="margin:0 0 16px;font-size:22px;font-weight:600;letter-spacing:-0.01em;">Authorize a new device for ${safeWorkspace}</h1>
<p style="margin:0 0 12px;color:#444;">A request was made to connect <strong>${safeDevice}</strong> to your <strong>${safeWorkspace}</strong> workspace on SeldonFrame.</p>
<p style="margin:0 0 24px;color:#444;">If this was you, click the button below to authorize. The link expires in ${expiresIn}.</p>
<p style="margin:0 0 24px;text-align:center;">
  <a href="${safeUrl}" style="display:inline-block;background:#0e7490;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Authorize ${safeDevice}</a>
</p>
<p style="margin:0 0 8px;color:#666;font-size:13px;">Didn't make this request? You can safely ignore this email — without your click, nothing happens.</p>
<p style="margin:24px 0 0;color:#999;font-size:12px;">If the button doesn't work, paste this URL into your browser:<br /><span style="word-break:break-all;">${safeUrl}</span></p>
</td></tr>
</table>
<p style="margin:16px 0 0;color:#999;font-size:12px;">SeldonFrame · <a href="https://seldonframe.com" style="color:#666;">seldonframe.com</a></p>
</td></tr>
</table>
</body>
</html>`;
}

export function renderDeviceAuthEmailText(req: DeviceAuthEmailRequest): string {
  return [
    `Authorize a new device for ${req.workspaceName}`,
    "",
    `A request was made to connect "${req.deviceLabel}" to your ${req.workspaceName} workspace on SeldonFrame.`,
    "",
    `If this was you, open this URL to authorize:`,
    req.approvalUrl,
    "",
    `The link expires at ${req.expiresAt}.`,
    "",
    `Didn't make this request? You can safely ignore this email — without your click, nothing happens.`,
    "",
    `— SeldonFrame · seldonframe.com`,
  ].join("\n");
}

export async function sendDeviceAuthEmail(
  req: DeviceAuthEmailRequest,
  deps: DeviceAuthEmailDeps,
): Promise<DeviceAuthSendResult> {
  const fetcher = deps.fetcher ?? globalThis.fetch;
  const subject = deviceAuthEmailSubject(req);
  const html = renderDeviceAuthEmailHtml(req);
  const text = renderDeviceAuthEmailText(req);

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
        tags: [{ name: "category", value: "device-auth" }],
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
      `[device-auth-email] Resend ${response.status}: ${detail || "(no detail)"} from=${deps.fromAddress}`,
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
