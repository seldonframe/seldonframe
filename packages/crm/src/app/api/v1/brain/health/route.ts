import { NextResponse } from "next/server";
import { resolveV1Identity } from "@/lib/auth/v1-identity";
import { getBrainHealthSummary } from "@/lib/brain-health";

export async function GET(request: Request) {
  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;

  const summary = await getBrainHealthSummary();
  return NextResponse.json(summary);
}
