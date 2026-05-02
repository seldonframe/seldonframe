// May 2, 2026 — POST /api/v1/workspaces/create-full
//
// Atomic Workspace Creation. Thin HTTP wrapper around the
// createFullWorkspace orchestrator in lib/workspace/create-full.ts.
// One call → one deterministic response. No retries, no Claude-Code
// decision-making, no 404/500 stitching.
//
// Anonymous endpoint (no bearer required) — same threat model as
// the legacy /api/v1/workspace/create route. Rate-limited per IP.

import { NextResponse } from "next/server";
import {
  createFullWorkspace,
  type CreateFullWorkspaceInput,
} from "@/lib/workspace/create-full";
import { demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
import { logEvent } from "@/lib/observability/log";
import { checkRateLimit } from "@/lib/utils/rate-limit";

type Body = {
  business_name?: unknown;
  city?: unknown;
  state?: unknown;
  phone?: unknown;
  services?: unknown;
  business_description?: unknown;
  review_count?: unknown;
  review_rating?: unknown;
  certifications?: unknown;
  trust_signals?: unknown;
  emergency_service?: unknown;
  same_day?: unknown;
  service_area?: unknown;
  email?: unknown;
  address?: unknown;
};

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (entry && typeof entry === "object" && "name" in entry) {
        const n = (entry as { name?: unknown }).name;
        return typeof n === "string" ? n.trim() : "";
      }
      return "";
    })
    .filter((s) => s.length > 0);
}

function resolveRequestIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(request: Request) {
  if (isDemoReadonly()) return demoApiBlockedResponse();

  const startedAt = Date.now();

  // Same rate limits as the legacy /workspace/create endpoint —
  // per-IP, 3 / hour and 10 / day. Operators with
  // SELDONFRAME_API_KEY can use the v1 user-key endpoints to bypass.
  const ip = resolveRequestIp(request.headers);
  const hourOk = await checkRateLimit(`atomic-workspace-create:hour:${ip}`, 3, 60 * 60 * 1000);
  const dayOk = await checkRateLimit(`atomic-workspace-create:day:${ip}`, 10, 24 * 60 * 60 * 1000);
  if (!hourOk || !dayOk) {
    logEvent("atomic_workspace_create_rate_limited", { ip }, { request, status: 429 });
    return NextResponse.json(
      {
        status: "error",
        error: { step: "rate_limit", message: "Too many workspace creations from this IP. Try again in an hour." },
      },
      { status: 429 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Body;

  const input: CreateFullWorkspaceInput = {
    business_name: readString(body.business_name),
    city: readString(body.city),
    state: readString(body.state),
    phone: readString(body.phone),
    services: readStringArray(body.services),
    business_description: readString(body.business_description),
    review_count: readNumber(body.review_count),
    review_rating: readNumber(body.review_rating),
    certifications: Array.isArray(body.certifications) ? readStringArray(body.certifications) : null,
    trust_signals: Array.isArray(body.trust_signals) ? readStringArray(body.trust_signals) : null,
    emergency_service: readBoolean(body.emergency_service),
    same_day: readBoolean(body.same_day),
    service_area: Array.isArray(body.service_area) ? readStringArray(body.service_area) : null,
    email: readString(body.email) || null,
    address: readString(body.address) || null,
  };

  const result = await createFullWorkspace(input);

  if (result.status === "error") {
    logEvent(
      "atomic_workspace_create_failed",
      { ip, step: result.error?.step, message: result.error?.message },
      { request, status: 422, durationMs: Date.now() - startedAt, severity: "error" }
    );
    return NextResponse.json(result, { status: 422 });
  }

  logEvent(
    "atomic_workspace_create_succeeded",
    { ip, slug: result.slug, personality: result.configured?.personality, timezone: result.configured?.timezone },
    { request, orgId: result.workspace_id, status: 200, durationMs: Date.now() - startedAt }
  );

  return NextResponse.json(result, { status: 200 });
}
