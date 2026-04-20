"use server";

import { revalidatePath } from "next/cache";
import { getCurrentWorkspaceRole, getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { createCustomObjectRecord, moveCustomObjectRecordLane, revalidateCustomObjectPaths, updateCustomObjectRecordField } from "@/lib/crm/custom-objects";
import { mapWorkspaceRoleToCustomObjectRole } from "@/lib/crm/custom-object-permissions";

function readClientId(formData: FormData) {
  const value = String(formData.get("clientId") ?? "").trim();
  return value || null;
}

export async function createCustomObjectRecordAction(formData: FormData) {
  assertWritable();

  const [orgId, workspaceRole] = await Promise.all([getOrgId(), getCurrentWorkspaceRole()]);
  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const objectSlug = String(formData.get("objectSlug") ?? "").trim();
  if (!objectSlug) {
    throw new Error("Missing custom object slug");
  }

  await createCustomObjectRecord({
    orgId,
    objectSlug,
    clientId: readClientId(formData),
    runtimeRole: mapWorkspaceRoleToCustomObjectRole(workspaceRole),
    values: Object.fromEntries(formData.entries()),
  });

  for (const path of revalidateCustomObjectPaths(objectSlug)) {
    revalidatePath(path);
  }
}

export async function updateCustomObjectFieldAction(input: {
  objectSlug: string;
  recordId: string;
  field: string;
  value: unknown;
  clientId?: string | null;
}) {
  assertWritable();

  const [orgId, workspaceRole] = await Promise.all([getOrgId(), getCurrentWorkspaceRole()]);
  if (!orgId) {
    throw new Error("Unauthorized");
  }

  await updateCustomObjectRecordField({
    orgId,
    objectSlug: input.objectSlug,
    recordId: input.recordId,
    field: input.field,
    value: input.value,
    clientId: input.clientId,
    runtimeRole: mapWorkspaceRoleToCustomObjectRole(workspaceRole),
  });

  for (const path of revalidateCustomObjectPaths(input.objectSlug)) {
    revalidatePath(path);
  }
}

export async function moveCustomObjectLaneAction(input: {
  objectSlug: string;
  recordId: string;
  laneField: string;
  toLane: string;
  clientId?: string | null;
}) {
  assertWritable();

  const [orgId, workspaceRole] = await Promise.all([getOrgId(), getCurrentWorkspaceRole()]);
  if (!orgId) {
    throw new Error("Unauthorized");
  }

  await moveCustomObjectRecordLane({
    orgId,
    objectSlug: input.objectSlug,
    recordId: input.recordId,
    laneField: input.laneField,
    toLane: input.toLane,
    clientId: input.clientId,
    runtimeRole: mapWorkspaceRoleToCustomObjectRole(workspaceRole),
  });

  for (const path of revalidateCustomObjectPaths(input.objectSlug)) {
    revalidatePath(path);
  }
}
