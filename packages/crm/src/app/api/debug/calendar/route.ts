// TEMPORARY diagnostic — REMOVE after the create-event failure is root-caused.
// Token-gated. Reproduces the EXACT GOOGLECALENDAR_CREATE_EVENT call the booking
// adapter makes (per-deployment entity + the new summary/description shape) and
// returns the raw Composio response so we can see WHY it returns successful:false.
//
//   GET /api/debug/calendar?deployment=<id>&key=<token>&start=2026-06-26T13:00:00.000Z

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEBUG_TOKEN = "sf-cal-debug-9f3a2c";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== DEBUG_TOKEN) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const deploymentId = url.searchParams.get("deployment") ?? "";
  const startIso = url.searchParams.get("start") ?? "2026-06-26T13:00:00.000Z";
  const out: Record<string, unknown> = { deploymentId, startIso };

  try {
    const { getDeployment } = await import("@/lib/deployments/store");
    const dep = await getDeployment(deploymentId);
    if (!dep) return Response.json({ ...out, error: "deployment_not_found" }, { status: 404 });
    const ref = (dep.calendarRef ?? {}) as { accountId?: string; calendarId?: string };
    out.accountId = ref.accountId;

    const { Composio } = await import("@composio/core");
    const { resolveComposioKey } = await import("@/lib/integrations/composio/keys");
    const { apiKey } = await resolveComposioKey(dep.builderOrgId);
    if (!apiKey) return Response.json({ ...out, error: "no_composio_key" });
    const composio = new Composio({ apiKey });

    const args = {
      calendar_id: ref.calendarId ?? "primary",
      start_datetime: startIso,
      event_duration_minutes: 60,
      summary: "SF debug — please delete",
      attendees: [] as string[],
      description: "Debug create test\nLine 2\nBooked by the AI receptionist via SeldonFrame.",
    };
    out.argsSent = args;
    try {
      out.createRaw = await (composio as unknown as {
        tools: { execute: (slug: string, body: unknown) => Promise<unknown> };
      }).tools.execute("GOOGLECALENDAR_CREATE_EVENT", {
        userId: dep.id,
        connectedAccountId: ref.accountId,
        dangerouslySkipVersionCheck: true,
        arguments: args,
      });
    } catch (e) {
      out.createError = e instanceof Error ? e.message : String(e);
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }

  return Response.json(out, { headers: { "cache-control": "no-store" } });
}
