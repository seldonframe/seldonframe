import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { createSubscriptionFromApi, listSubscriptionsForOrg } from "@/lib/payments/api";

export async function GET(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
  const rows = await listSubscriptionsForOrg(guard.orgId, limit);
  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json()) as {
    contactId?: unknown;
    priceId?: unknown;
    trialDays?: unknown;
    metadata?: unknown;
  };

  if (typeof body.contactId !== "string" || !body.contactId.trim()) {
    return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  }
  if (typeof body.priceId !== "string" || !body.priceId.trim()) {
    return NextResponse.json({ error: "priceId is required" }, { status: 400 });
  }

  try {
    const subscription = await createSubscriptionFromApi({
      orgId: guard.orgId,
      contactId: body.contactId,
      priceId: body.priceId,
      trialDays: typeof body.trialDays === "number" ? body.trialDays : undefined,
      metadata:
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? Object.fromEntries(
              Object.entries(body.metadata as Record<string, unknown>).filter(
                ([, v]) => typeof v === "string"
              )
            ) as Record<string, string>
          : undefined,
    });
    return NextResponse.json({ data: subscription }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Subscription create failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
