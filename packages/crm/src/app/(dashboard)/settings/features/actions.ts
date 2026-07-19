"use server";

// Server action for the /settings/features toggle UI.
// Mirrors the setWorkspaceTestModeAction pattern from
// lib/test-mode/actions.ts: assertWritable + getOrgId + write + revalidatePath.
// Money-safe: no Stripe call sites here; this only flips a settings.surface
// jsonb flag. org is resolved from the session (getOrgId), never from
// form input — the form only ever supplies moduleId/enabled.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { redirect } from "next/navigation";

import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { MODULE_IDS, type ModuleId } from "@/lib/workspace/modules";
import { setModuleEnabled } from "@/lib/workspace/surface";

const moduleIdSchema = z.enum(MODULE_IDS as [ModuleId, ...ModuleId[]]);

export async function toggleModuleAction(formData: FormData): Promise<void> {
  await assertWritable();

  const orgId = await getOrgId();
  // Missing org = expired/absent session — the v1.7.3 bug class if thrown
  // (cascades to "This page couldn't load"). Redirect like every dashboard page.
  if (!orgId) redirect("/login");

  const parsedModuleId = moduleIdSchema.safeParse(formData.get("moduleId"));
  if (!parsedModuleId.success) {
    // contract:throw-ok: tamper guard — the rendered form only ever submits
    // ids from MODULE_IDS via a hidden input; this branch is unreachable
    // without hand-crafting the POST, and a forged request deserves a loud
    // failure, not a silent pass.
    throw new Error("Invalid module id");
  }
  const moduleId = parsedModuleId.data;

  // FormData submits the literal string we set on the hidden input —
  // no checkbox convention involved here (each row is its own form).
  const enabled = formData.get("enabled") === "true";

  const result = await setModuleEnabled(orgId, moduleId, enabled);

  // Revalidate the dashboard layout (nav filter reads settings.surface)
  // + the features page itself (toggle state).
  revalidatePath("/", "layout");
  revalidatePath("/settings/features");

  if (!result.ok) {
    redirect(`/settings/features?blocked=${result.reason}`);
  }
}
