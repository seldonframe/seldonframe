import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import {
  addPhoneSuppression,
  listPhoneSuppressions,
  type SmsSuppressionReason,
} from "@/lib/sms/suppression";

const VALID_REASONS: readonly SmsSuppressionReason[] = ["manual", "stop_keyword", "carrier_block", "complaint"];

function isValidReason(value: unknown): value is SmsSuppressionReason {
  return typeof value === "string" && (VALID_REASONS as readonly string[]).includes(value);
}

export async function GET(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const rows = await listPhoneSuppressions(guard.orgId);
  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json()) as {
    phone?: unknown;
    reason?: unknown;
    source?: unknown;
  };

  if (typeof body.phone !== "string" || !body.phone.trim()) {
    return NextResponse.json({ error: "phone is required" }, { status: 400 });
  }

  const reason = isValidReason(body.reason) ? body.reason : "manual";
  const source = typeof body.source === "string" ? body.source : undefined;

  const row = await addPhoneSuppression({
    orgId: guard.orgId,
    phone: body.phone,
    reason,
    source,
  });

  return NextResponse.json({ data: row }, { status: 201 });
}
