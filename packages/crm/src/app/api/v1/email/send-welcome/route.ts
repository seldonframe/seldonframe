import { NextResponse } from "next/server";
import { resolveV1Identity } from "@/lib/auth/v1-identity";
import { demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
import { logEvent } from "@/lib/observability/log";
import {
  pickFromAddress,
  sendWelcomeEmail,
  validateWelcomeRequest,
} from "@/lib/emails/welcome";

export async function POST(request: Request) {
  if (isDemoReadonly()) return demoApiBlockedResponse();

  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;
  const { identity } = auth;

  const raw = await request.json().catch(() => ({}));
  const validated = validateWelcomeRequest(raw);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: validated.status });
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    logEvent(
      "welcome_email_misconfigured",
      { reason: "RESEND_API_KEY missing" },
      { request, identity, status: 500, severity: "error" },
    );
    return NextResponse.json(
      { error: "Email sending is not configured (RESEND_API_KEY missing)." },
      { status: 500 },
    );
  }

  const fromAddress = pickFromAddress(process.env);
  const result = await sendWelcomeEmail(validated.data, { apiKey, fromAddress });

  if (!result.ok) {
    logEvent(
      "welcome_email_failed",
      { resend_status: result.status, resend_error: result.error },
      { request, identity, status: 502, severity: "error" },
    );
    return NextResponse.json(
      { error: `Failed to send welcome email: ${result.error}` },
      { status: 502 },
    );
  }

  logEvent(
    "welcome_email_sent",
    { message_id: result.messageId, to: validated.data.email },
    { request, identity, status: 200 },
  );

  return NextResponse.json({ ok: true, message_id: result.messageId });
}
