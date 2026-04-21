import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { getEmailWithEvents } from "@/lib/emails/api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const record = await getEmailWithEvents(guard.orgId, id);
  if (!record) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ data: record });
}
