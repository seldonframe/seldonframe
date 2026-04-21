import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { createInvoiceFromApi, listInvoicesForOrg } from "@/lib/payments/api";
import type { InvoiceLineItem } from "@/lib/payments/providers";

export async function GET(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
  const rows = await listInvoicesForOrg(guard.orgId, limit);
  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json()) as {
    contactId?: unknown;
    items?: unknown;
    currency?: unknown;
    dueAt?: unknown;
    metadata?: unknown;
  };

  if (typeof body.contactId !== "string" || !body.contactId.trim()) {
    return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "items must be a non-empty array" }, { status: 400 });
  }

  const items: InvoiceLineItem[] = [];
  for (const raw of body.items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const description = typeof item.description === "string" ? item.description : "";
    const quantity = typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 1;
    const unitAmount = typeof item.unitAmount === "number" ? item.unitAmount : 0;
    if (!description || unitAmount <= 0) continue;
    const lineItem: InvoiceLineItem = { description, quantity, unitAmount };
    if (typeof item.currency === "string") lineItem.currency = item.currency;
    items.push(lineItem);
  }

  if (items.length === 0) {
    return NextResponse.json({ error: "No valid items provided" }, { status: 400 });
  }

  try {
    const invoice = await createInvoiceFromApi({
      orgId: guard.orgId,
      contactId: body.contactId,
      items,
      currency: typeof body.currency === "string" ? body.currency : undefined,
      dueAt: typeof body.dueAt === "string" ? new Date(body.dueAt) : null,
      metadata:
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? Object.fromEntries(
              Object.entries(body.metadata as Record<string, unknown>).filter(
                ([, v]) => typeof v === "string"
              )
            ) as Record<string, string>
          : undefined,
    });
    return NextResponse.json({ data: invoice }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invoice create failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
