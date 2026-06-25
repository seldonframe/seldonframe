// TEMPORARY diagnostic endpoint — REMOVE after the calendar-booking root cause is
// found. Token-gated, read-only (find-free-slots + list-connections; no booking).
// Mirrors the runtime's per-deployment-entity Composio wiring so we can see, in one
// curl, exactly what the agent's look_up_availability sees:
//
//   GET /api/debug/calendar?deployment=<id>&key=<token>&date=YYYY-MM-DD
//     → { binding, calendarRef, connections, sessionOk, tools, findFreeSlotsRaw|Error }

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEBUG_TOKEN = "sf-cal-debug-9f3a2c";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== DEBUG_TOKEN) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const deploymentId = url.searchParams.get("deployment") ?? "";
  const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const out: Record<string, unknown> = { deploymentId, date };

  try {
    const { getDeployment } = await import("@/lib/deployments/store");
    const dep = await getDeployment(deploymentId);
    if (!dep) return Response.json({ ...out, error: "deployment_not_found" }, { status: 404 });
    out.bookingMode = dep.bookingMode;
    out.calendarRef = dep.calendarRef;
    out.builderOrgId = dep.builderOrgId;

    const { deploymentToBinding } = await import("@/lib/deployments/booking-binding");
    out.binding = deploymentToBinding(dep);

    const { ensureSession, listConnections } = await import(
      "@/lib/integrations/composio/client"
    );
    const ref = (dep.calendarRef ?? {}) as { provider?: string };
    const provider = ref.provider === "outlook" ? "outlook" : "googlecalendar";
    const entityUserId = dep.id;

    try {
      out.connections = await listConnections(dep.builderOrgId, { entityUserId });
    } catch (e) {
      out.connectionsError = e instanceof Error ? e.message : String(e);
    }

    const session = await ensureSession(dep.builderOrgId, [provider], { entityUserId });
    out.sessionOk = Boolean(session);
    if (session) {
      const { createMcpClient } = await import("@/lib/agents/mcp/client");
      const client = createMcpClient({
        endpoint: session.mcpUrl,
        headers: session.mcpHeaders,
        bearer: "",
      });
      try {
        const c = client as unknown as { listTools?: () => Promise<unknown> };
        if (typeof c.listTools === "function") out.tools = await c.listTools();
      } catch (e) {
        out.toolsError = e instanceof Error ? e.message : String(e);
      }
      try {
        out.findFreeSlotsRaw = await client.callTool("GOOGLECALENDAR_FIND_FREE_SLOTS", {
          calendar_id: "primary",
          time_min: `${date}T00:00:00`,
          time_max: `${date}T23:59:59`,
          timezone: "America/Chicago",
        });
      } catch (e) {
        out.findFreeSlotsError = e instanceof Error ? e.message : String(e);
      }
    }

    // === SDK DIRECT EXECUTION test (the likely fix — bypasses the MCP router) ===
    try {
      const { Composio } = await import("@composio/core");
      const { resolveComposioKey } = await import("@/lib/integrations/composio/keys");
      const keyRes = await resolveComposioKey(dep.builderOrgId);
      out.keySource = keyRes.source;
      if (keyRes.apiKey) {
        const composio = new Composio({ apiKey: keyRes.apiKey });
        const toolsApi = (composio as unknown as { tools?: Record<string, unknown> }).tools;
        out.toolsApiKeys = toolsApi
          ? Object.getOwnPropertyNames(Object.getPrototypeOf(toolsApi)).filter((k) => k !== "constructor")
          : null;
        const accountId = (dep.calendarRef as { accountId?: string } | null)?.accountId;
        try {
          out.sdkFindFreeSlots = await (composio as unknown as {
            tools: { execute: (slug: string, body: unknown) => Promise<unknown> };
          }).tools.execute("GOOGLECALENDAR_FIND_FREE_SLOTS", {
            userId: entityUserId,
            connectedAccountId: accountId,
            arguments: {
              time_min: `${date}T00:00:00Z`,
              time_max: `${date}T23:59:59Z`,
              timezone: "America/Chicago",
            },
          });
        } catch (e) {
          out.sdkFindFreeSlotsError = e instanceof Error ? e.message : String(e);
        }
      }
    } catch (e) {
      out.sdkError = e instanceof Error ? e.message : String(e);
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }

  return Response.json(out, { headers: { "cache-control": "no-store" } });
}
