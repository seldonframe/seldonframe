import { NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { processSoulAutomations } from "@/lib/automations/soul-automations";

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

  const orgRows = await db.select({ id: organizations.id, soul: organizations.soul }).from(organizations);
  const results: Array<{ orgId: string; processedStages: number; actionsEvaluated: number; tasksCreated: number }> = [];

  for (const org of orgRows) {
    const soul = (org.soul as { journey?: { stages?: unknown[] } } | null) ?? null;

    if (!soul?.journey?.stages?.length) {
      continue;
    }

    const result = await processSoulAutomations(org.id);
    results.push(result);
  }

  return NextResponse.json({
    ok: true,
    organizationsProcessed: results.length,
    actionsEvaluated: results.reduce((sum, item) => sum + item.actionsEvaluated, 0),
    tasksCreated: results.reduce((sum, item) => sum + item.tasksCreated, 0),
  });
}
