import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { removeSuppression } from "@/lib/emails/suppression";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ email: string }> }
) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const { email: encoded } = await params;
  const email = decodeURIComponent(encoded);

  const count = await removeSuppression({ orgId: guard.orgId, email });
  return NextResponse.json({ data: { removed: count } });
}
