import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import {
  addSuppression,
  listSuppressions,
  type SuppressionReason,
} from "@/lib/emails/suppression";

const VALID_REASONS: readonly SuppressionReason[] = ["manual", "unsubscribe", "bounce", "complaint"];

function isValidReason(value: unknown): value is SuppressionReason {
  return typeof value === "string" && (VALID_REASONS as readonly string[]).includes(value);
}

export async function GET(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const rows = await listSuppressions(guard.orgId);
  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json()) as {
    email?: unknown;
    reason?: unknown;
    source?: unknown;
  };

  if (typeof body.email !== "string" || !body.email.trim()) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const reason = isValidReason(body.reason) ? body.reason : "manual";
  const source = typeof body.source === "string" ? body.source : undefined;

  const row = await addSuppression({
    orgId: guard.orgId,
    email: body.email,
    reason,
    source,
  });

  return NextResponse.json({ data: row }, { status: 201 });
}
