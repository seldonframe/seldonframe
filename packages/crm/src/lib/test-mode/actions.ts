"use server";

// Server actions for workspace test-mode admin UI.
// SLICE 8 C5 per audit §5.1 + gates G-8-1 + G-8-3.
//
// Mirrors the updateIntegrationAction pattern from
// lib/integrations/actions.ts: assertWritable + getOrgId + DB update
// + revalidatePath.

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";

import { DrizzleWorkspaceTestModeStore } from "./store-drizzle";

export async function setWorkspaceTestModeAction(formData: FormData): Promise<void> {
  await assertWritable();
  const orgId = await getOrgId();
  if (!orgId) throw new Error("Unauthorized");

  // FormData submits boolean as the literal string "on" when checked,
  // or the field is absent when unchecked. We accept either explicit
  // "true"/"false" string OR the checkbox convention.
  const raw = formData.get("testMode");
  const enabled = raw === "true" || raw === "on";

  const store = new DrizzleWorkspaceTestModeStore(db);
  await store.setWorkspaceTestMode(orgId, enabled);

  // Revalidate dashboard layout (banner) + settings page (toggle state).
  revalidatePath("/", "layout");
  revalidatePath("/settings/test-mode");
}
