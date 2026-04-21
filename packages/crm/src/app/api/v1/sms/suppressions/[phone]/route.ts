import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { removePhoneSuppression } from "@/lib/sms/suppression";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ phone: string }> }
) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const { phone: encoded } = await params;
  const phone = decodeURIComponent(encoded);

  const count = await removePhoneSuppression({ orgId: guard.orgId, phone });
  return NextResponse.json({ data: { removed: count } });
}
