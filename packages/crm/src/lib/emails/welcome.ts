// Onboarding-welcome email helpers — fired by the MCP `send_welcome_email`
// tool after the user confirms an email post-`create_workspace`. Pure
// functions for validation, template rendering, and Resend dispatch so
// the route handler stays a thin orchestrator and tests don't need
// network or DB.

const DISCORD_INVITE = "https://discord.gg/sbVUu976NW";
// v1.1.4 / Issue #4 — default to the verified seldonframe.com domain
// (set up in Resend → Domains) so welcome emails actually reach the
// operator's inbox. The legacy onboarding@resend.dev sandbox was rate-
// limited to 3/day and could only send to the account owner's verified
// email — every operator-facing send silently 403'd. RESEND_FROM_ADDRESS
// can still override per-environment (e.g. for staging tests).
const DEFAULT_FROM = "SeldonFrame <welcome@seldonframe.com>";

export type WelcomeWorkspace = {
  landing_url: string;
  booking_url: string;
  intake_url: string;
  admin_url: string;
};

export type WelcomeEmailRequest = {
  email: string;
  name: string | null;
  workspace: WelcomeWorkspace;
};

export type ValidateResult =
  | { ok: true; data: WelcomeEmailRequest }
  | { ok: false; status: 400; error: string };

export type SendDeps = {
  fetcher?: typeof fetch;
  apiKey: string;
  fromAddress: string;
};

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; status: number; error: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateWelcomeRequest(body: unknown): ValidateResult {
  if (!body || typeof body !== "object") {
    return { ok: false, status: 400, error: "Request body must be an object." };
  }
  const b = body as Record<string, unknown>;

  if (!isNonEmptyString(b.email)) {
    return { ok: false, status: 400, error: "email is required (non-empty string)." };
  }

  if (!b.workspace || typeof b.workspace !== "object") {
    return {
      ok: false,
      status: 400,
      error: "workspace is required (object with landing_url, booking_url, intake_url, admin_url).",
    };
  }
  const w = b.workspace as Record<string, unknown>;
  for (const key of ["landing_url", "booking_url", "intake_url", "admin_url"] as const) {
    if (!isNonEmptyString(w[key])) {
      return { ok: false, status: 400, error: `workspace.${key} is required.` };
    }
  }

  const name = isNonEmptyString(b.name) ? b.name.trim() : null;

  return {
    ok: true,
    data: {
      email: b.email.trim(),
      name,
      workspace: {
        landing_url: (w.landing_url as string).trim(),
        booking_url: (w.booking_url as string).trim(),
        intake_url: (w.intake_url as string).trim(),
        admin_url: (w.admin_url as string).trim(),
      },
    },
  };
}

export function pickFromAddress(env: NodeJS.ProcessEnv | Record<string, string | undefined>): string {
  const configured = typeof env.RESEND_FROM_ADDRESS === "string" ? env.RESEND_FROM_ADDRESS.trim() : "";
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

export function renderWelcomeEmailHtml(req: WelcomeEmailRequest): string {
  const greeting = req.name ? `Hi ${escapeHtml(req.name)},` : "Welcome aboard,";
  const w = req.workspace;
  const safeLanding = escapeHtml(w.landing_url);
  const safeBooking = escapeHtml(w.booking_url);
  const safeIntake = escapeHtml(w.intake_url);
  const safeAdmin = escapeHtml(w.admin_url);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Your SeldonFrame workspace is live</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">

        <tr><td style="background:#0b0b10;padding:32px 32px 28px 32px;color:#ffffff;">
          <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#9aa0a6;margin-bottom:8px;">SeldonFrame</div>
          <div style="font-size:24px;font-weight:600;line-height:1.25;">Your workspace is live.</div>
          <div style="font-size:14px;color:#c8ccd1;margin-top:8px;">Every URL below works right now — no signup, no setup.</div>
        </td></tr>

        <tr><td style="padding:28px 32px 8px 32px;font-size:15px;line-height:1.55;color:#1a1a1f;">
          <p style="margin:0 0 16px 0;">${greeting}</p>
          <p style="margin:0 0 16px 0;">
            Thanks for spinning up a workspace on SeldonFrame. Bookmark these four URLs — they're your business OS in production.
          </p>
        </td></tr>

        <tr><td style="padding:8px 32px 0 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;">
            <tr><td style="padding:14px 18px;border-bottom:1px solid #f0f1f3;">
              <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Landing page</div>
              <a href="${safeLanding}" style="color:#1a73e8;text-decoration:none;font-size:15px;word-break:break-all;">${safeLanding}</a>
            </td></tr>
            <tr><td style="padding:14px 18px;border-bottom:1px solid #f0f1f3;">
              <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Booking</div>
              <a href="${safeBooking}" style="color:#1a73e8;text-decoration:none;font-size:15px;word-break:break-all;">${safeBooking}</a>
            </td></tr>
            <tr><td style="padding:14px 18px;border-bottom:1px solid #f0f1f3;">
              <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Intake form</div>
              <a href="${safeIntake}" style="color:#1a73e8;text-decoration:none;font-size:15px;word-break:break-all;">${safeIntake}</a>
            </td></tr>
            <tr><td style="padding:14px 18px;">
              <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Admin dashboard</div>
              <a href="${safeAdmin}" style="color:#1a73e8;text-decoration:none;font-size:15px;word-break:break-all;">${safeAdmin}</a>
              <div style="font-size:12px;color:#9aa0a6;margin-top:6px;">Token expires in 7 days. Re-mint via <code>list_workspaces({})</code> when it does.</div>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:24px 32px 8px 32px;font-size:15px;line-height:1.55;color:#1a1a1f;">
          <div style="font-weight:600;margin-bottom:8px;">Next steps</div>
          <ol style="padding-left:20px;margin:0 0 16px 0;">
            <li style="margin-bottom:6px;">Open the admin dashboard to see the CRM, deals pipeline, and automations already running.</li>
            <li style="margin-bottom:6px;">Customize your landing, booking page, and intake form by talking to Claude — every change is one MCP call away.</li>
            <li style="margin-bottom:6px;">Connect a custom domain when you're ready to ship publicly.</li>
          </ol>
        </td></tr>

        <tr><td style="padding:8px 32px 24px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#5865f2;border-radius:10px;">
            <tr><td align="center" style="padding:18px 24px;">
              <div style="font-size:13px;color:#dbe1ff;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:6px;">Need help?</div>
              <div style="font-size:18px;font-weight:600;color:#ffffff;margin-bottom:14px;">Join the SeldonFrame builder community</div>
              <a href="${DISCORD_INVITE}" style="display:inline-block;background:#ffffff;color:#5865f2;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:8px;">Join Discord →</a>
              <div style="font-size:12px;color:#dbe1ff;margin-top:10px;">Live builder Q&amp;A · share what you&apos;re shipping · we read every message</div>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:0 32px 24px 32px;border-top:1px solid #eef0f3;font-size:12px;color:#9aa0a6;line-height:1.5;text-align:center;padding-top:16px;">
          Sent by SeldonFrame · <a href="${DISCORD_INVITE}" style="color:#9aa0a6;text-decoration:underline;">Discord</a>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function renderWelcomeEmailText(req: WelcomeEmailRequest): string {
  const greeting = req.name ? `Hi ${req.name},` : "Welcome aboard,";
  const w = req.workspace;
  return `${greeting}

Your SeldonFrame workspace is live. Bookmark these four URLs:

  Landing:  ${w.landing_url}
  Booking:  ${w.booking_url}
  Intake:   ${w.intake_url}
  Admin:    ${w.admin_url}

Next steps:
  1. Open the admin dashboard to see the CRM, deals pipeline, and automations already running.
  2. Customize your landing, booking page, and intake form by talking to Claude — every change is one MCP call away.
  3. Connect a custom domain when you're ready to ship publicly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Join the SeldonFrame builder community on Discord:

  ${DISCORD_INVITE}

Live builder Q&A. Share what you're shipping. We read every message.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

export function welcomeEmailSubject(req: WelcomeEmailRequest): string {
  void req;
  return "Your SeldonFrame workspace is live";
}

export async function sendWelcomeEmail(
  req: WelcomeEmailRequest,
  deps: SendDeps,
): Promise<SendResult> {
  const fetcher = deps.fetcher ?? globalThis.fetch;
  const subject = welcomeEmailSubject(req);
  const html = renderWelcomeEmailHtml(req);
  const text = renderWelcomeEmailText(req);

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
        tags: [{ name: "category", value: "welcome" }],
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
    return {
      ok: false,
      status: response.status,
      error: detail || `Resend send failed with ${response.status}`,
    };
  }

  let payload: { id?: string };
  try {
    payload = (await response.json()) as { id?: string };
  } catch {
    return { ok: false, status: 502, error: "Resend returned non-JSON response." };
  }
  if (!payload.id || typeof payload.id !== "string") {
    return { ok: false, status: 502, error: "Resend returned no message id." };
  }

  return { ok: true, messageId: payload.id };
}
