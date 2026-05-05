// v1.7.0 — POST /api/v1/auth/initiate
//
// Anonymous endpoint — the operator's IDE has no bearer yet (that's the
// whole point of this flow). Per-IP rate-limited to prevent enumeration
// of workspace slugs.
//
// Body:
//   {
//     workspace_slug: "iron-oak-barbershop",
//     email: "marc@ironoak.ca",
//     device_label: "Claude Code on MacBook Pro (xyz)"
//   }
//
// Response:
//   { atok, approval_url, expires_at, workspace: { id, slug, name } }
//
// The MCP server stores the atok and polls /api/v1/auth/check until the
// operator clicks the email link + clicks Approve on the browser page.

import { NextResponse } from "next/server";
import { initiateDeviceAuth } from "@/lib/auth/device-auth";
import {
  pickFromAddress,
  sendDeviceAuthEmail,
} from "@/lib/emails/device-auth";
import { logEvent } from "@/lib/observability/log";
import { checkRateLimit } from "@/lib/utils/rate-limit";

function resolveIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

type Body = {
  workspace_slug?: unknown;
  email?: unknown;
  device_label?: unknown;
};

export async function POST(request: Request) {
  // v1.7.2 — wrap to guarantee JSON shape even on crashes (matches the
  // pattern applied to /approve, /reject, /check). The MCP polling
  // loop chokes on non-JSON; the browser approval page does too.
  try {
    return await handlePost(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[auth/initiate] unexpected error: ${message}`);
    return NextResponse.json(
      { ok: false, error: "internal_error", message },
      { status: 500 },
    );
  }
}

async function handlePost(request: Request) {
  const ip = resolveIp(request.headers);
  // 10 attempts per hour per IP — generous enough for legit retries
  // (operator's email goes to spam, they re-initiate) but tight enough
  // that a brute-forcer can't probe more than ~10 workspace slugs/hour.
  const ok = await checkRateLimit(`device-auth-initiate:${ip}`, 10, 60 * 60 * 1000);
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const workspaceSlug =
    typeof body.workspace_slug === "string" ? body.workspace_slug.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const deviceLabel =
    typeof body.device_label === "string"
      ? body.device_label.trim()
      : "Unknown device";

  const result = await initiateDeviceAuth({
    workspaceSlug,
    email,
    deviceLabel,
    ip,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  if (!result.ok) {
    logEvent(
      "device_auth_initiate_rejected",
      { error: result.error, slug: workspaceSlug, email_domain: email.split("@")[1] },
      { request, status: 400 },
    );
    // Return 400 for invalid input but DON'T leak whether the workspace
    // exists — return the same shape for workspace_not_found so a
    // caller can't enumerate slugs by status code.
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 400 },
    );
  }

  // Send the magic-link email. We do this after the row is committed so
  // a polling MCP can hit /auth/check immediately even if email
  // delivery is delayed by Resend.
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  if (!apiKey) {
    console.error(
      "[auth/initiate] RESEND_API_KEY not set — magic-link email NOT sent",
    );
  } else {
    void sendDeviceAuthEmail(
      {
        email: email,
        workspaceName: result.workspace.name,
        workspaceSlug: result.workspace.slug,
        deviceLabel: deviceLabel,
        approvalUrl: result.approval_url,
        expiresAt: result.expires_at,
      },
      {
        apiKey,
        fromAddress: pickFromAddress(process.env),
      },
    ).then((r) => {
      if (!r.ok) {
        console.error(
          `[auth/initiate] device-auth email failed: ${r.error}`,
        );
      }
    });
  }

  logEvent(
    "device_auth_initiated",
    {
      workspace_id: result.workspace.id,
      slug: result.workspace.slug,
      device_label: deviceLabel,
      email_domain: email.split("@")[1] ?? null,
    },
    { request, orgId: result.workspace.id, status: 200 },
  );

  // Return atok so the MCP can poll. Approval URL also returned for
  // the rare case the MCP wants to display it as a fallback (e.g. if
  // the email is delayed).
  return NextResponse.json({
    ok: true,
    atok: result.atok,
    approval_url: result.approval_url,
    expires_at: result.expires_at,
    workspace: {
      id: result.workspace.id,
      slug: result.workspace.slug,
      name: result.workspace.name,
    },
  });
}
