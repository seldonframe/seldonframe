import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { cancelSubscriptionFromApi } from "@/lib/payments/api";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json().catch(() => ({}))) as { immediate?: unknown };
  const immediate = body.immediate === true;

  const { id } = await params;
  try {
    const result = await cancelSubscriptionFromApi({
      orgId: guard.orgId,
      subscriptionId: id,
      immediate,
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cancel failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
