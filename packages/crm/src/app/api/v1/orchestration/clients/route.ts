import { NextResponse } from "next/server";
import { resolveAuthenticatedBuilderUserId } from "@/lib/openclaw/self-service";
import { listClientsWithActivity, listRecentScopeDenials } from "@/lib/openclaw/orchestration";

export async function GET(request: Request) {
  try {
    const userId = await resolveAuthenticatedBuilderUserId(request.headers);
    const url = new URL(request.url);
    const activityDaysRaw = Number(url.searchParams.get("activityDays") ?? "30");
    const activityDays = Number.isFinite(activityDaysRaw) && activityDaysRaw > 0 ? Math.min(activityDaysRaw, 365) : 30;
    const includeDenials = url.searchParams.get("include_denials") === "true";

    const [clients, denials] = await Promise.all([
      listClientsWithActivity(userId, { activityDays }),
      includeDenials ? listRecentScopeDenials(userId) : Promise.resolve(null),
    ]);

    return NextResponse.json({
      ok: true,
      activity_days: activityDays,
      clients,
      recent_scope_denials: denials,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list managed clients.";
    const status = message.includes("Unauthorized") || message.includes("Invalid x-seldon-api-key") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
