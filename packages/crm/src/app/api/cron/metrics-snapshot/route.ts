import { NextResponse } from "next/server";
import { captureDailyMetricsSnapshots } from "@/lib/metrics/snapshots";

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
  return cronHeader === configuredSecret;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dateParam = new URL(request.url).searchParams.get("date");
  const snapshotDate = dateParam ? new Date(`${dateParam}T00:00:00.000Z`) : undefined;

  if (snapshotDate && Number.isNaN(snapshotDate.getTime())) {
    return NextResponse.json({ error: "Invalid date. Use YYYY-MM-DD" }, { status: 400 });
  }

  const result = await captureDailyMetricsSnapshots(snapshotDate);
  return NextResponse.json({ ok: true, ...result });
}
