// Single JSON-line logger for first-run chain observability. Replaces the
// scattered `console.info(JSON.stringify({...}))` calls in v1 routes with a
// consistent field set so Vercel logs are easy to grep and ingest later.
//
// Log shape:
//   { event, at, request_id?, org_id?, identity_kind?, status?, duration_ms?, ...data }
//
// `request_id` is sourced from Vercel's `x-vercel-id` header when a Request is
// passed; `identity_kind` is `"workspace" | "user" | null` — the auth path the
// caller resolved to, never a token value. Safe to log.
//
// Errors and non-fatal warnings share the same shape so a future log drain can
// split on `severity` without parsing free-form text.

import type { V1Identity } from "@/lib/auth/v1-identity";

export type LogSeverity = "info" | "warn" | "error";

export type LogContext = {
  request?: Request;
  identity?: V1Identity | null;
  orgId?: string | null;
  status?: number;
  durationMs?: number;
  severity?: LogSeverity;
};

function identityKind(identity: V1Identity | null | undefined): string | null {
  if (!identity) return null;
  return identity.kind;
}

function requestId(request: Request | undefined): string | null {
  if (!request) return null;
  return request.headers.get("x-vercel-id")?.trim() || null;
}

export function logEvent(
  event: string,
  data: Record<string, unknown> = {},
  ctx: LogContext = {}
): void {
  const severity = ctx.severity ?? "info";
  const payload = {
    event,
    at: new Date().toISOString(),
    severity,
    request_id: requestId(ctx.request),
    identity_kind: identityKind(ctx.identity),
    org_id: ctx.orgId ?? null,
    status: ctx.status ?? null,
    duration_ms: ctx.durationMs ?? null,
    ...data,
  };

  const line = JSON.stringify(payload);
  if (severity === "error") {
    console.error(line);
  } else if (severity === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}
