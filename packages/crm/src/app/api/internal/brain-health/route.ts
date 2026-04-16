import { NextResponse } from "next/server";
import { getBrainHealthSummary } from "@/lib/brain-health";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret) {
    return true;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${configuredSecret}`) {
    return true;
  }

  const cronHeader = request.headers.get("x-cron-secret");
  if (cronHeader === configuredSecret) {
    return true;
  }

  const adminHeader = request.headers.get("x-admin-secret");
  return adminHeader === configuredSecret;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await getBrainHealthSummary();
  return NextResponse.json(summary);
}
