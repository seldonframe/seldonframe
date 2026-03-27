import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { webhookEndpoints } from "@/db/schema";

export async function dispatchWebhook({
  orgId,
  event,
  payload,
}: {
  orgId: string;
  event: string;
  payload: Record<string, unknown>;
}) {
  const endpoints = await db
    .select()
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.orgId, orgId), eq(webhookEndpoints.isActive, true)));

  await Promise.allSettled(
    endpoints
      .filter((endpoint) => endpoint.events.includes(event))
      .map(async (endpoint) => {
        await fetch(endpoint.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-webhook-event": event,
            "x-webhook-signature": endpoint.secret,
          },
          body: JSON.stringify(payload),
        });
      })
  );
}
