"use server";

import { redirect } from "next/navigation";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { addSuppression, removeSuppression, type SuppressionReason } from "./suppression";

const VALID_REASONS: readonly SuppressionReason[] = ["manual", "unsubscribe", "bounce", "complaint"];

function toReason(value: FormDataEntryValue | null): SuppressionReason {
  if (typeof value === "string" && (VALID_REASONS as readonly string[]).includes(value)) {
    return value as SuppressionReason;
  }
  return "manual";
}

export async function addSuppressionAction(formData: FormData) {
  assertWritable();
  const orgId = await getOrgId();
  if (!orgId) throw new Error("Unauthorized");

  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    redirect("/settings/suppression?error=" + encodeURIComponent("Email is required"));
  }

  await addSuppression({
    orgId,
    email,
    reason: toReason(formData.get("reason")),
    source: "dashboard:manual",
  });

  redirect("/settings/suppression?added=1");
}

export async function removeSuppressionAction(formData: FormData) {
  assertWritable();
  const orgId = await getOrgId();
  if (!orgId) throw new Error("Unauthorized");

  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    redirect("/settings/suppression?error=" + encodeURIComponent("Email is required"));
  }

  await removeSuppression({ orgId, email });
  redirect("/settings/suppression?removed=1");
}
