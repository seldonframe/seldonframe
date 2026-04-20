import type { CrmScopedOverride } from "@/components/crm/types";
import { parseBlockMd, replaceBlockMdSection } from "@/lib/blocks/block-md";

export type CustomObjectRuntimeRole = "builder" | "operator" | "end_client";
export type CustomObjectAccessLevel = "none" | "view" | "view-own" | "edit" | "edit-own" | "manage";

export type CustomObjectPermissionPolicy = {
  builder: CustomObjectAccessLevel;
  operator: CustomObjectAccessLevel;
  endClient: CustomObjectAccessLevel;
  operatorEditableFields: string[];
  endClientEditableFields: string[];
};

export type CustomObjectResolvedAccess = {
  role: CustomObjectRuntimeRole;
  policy: CustomObjectPermissionPolicy;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canManage: boolean;
  ownOnly: boolean;
  editableFields: string[];
  label: string;
};

const defaultPermissionPolicy: CustomObjectPermissionPolicy = {
  builder: "manage",
  operator: "edit",
  endClient: "none",
  operatorEditableFields: [],
  endClientEditableFields: [],
};

function splitCommaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeAccessLevel(value: string | undefined, fallback: CustomObjectAccessLevel) {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "none" ||
    normalized === "view" ||
    normalized === "view-own" ||
    normalized === "edit" ||
    normalized === "edit-own" ||
    normalized === "manage"
  ) {
    return normalized;
  }

  return fallback;
}

export function mapWorkspaceRoleToCustomObjectRole(role?: string | null): CustomObjectRuntimeRole {
  return /owner|admin/i.test(role ?? "") ? "builder" : "operator";
}

export function parseCustomObjectPermissionPolicy(blockMd: string) {
  const parsed = parseBlockMd(blockMd);
  const section = parsed.sections.permissions ?? "";
  const policy: CustomObjectPermissionPolicy = {
    ...defaultPermissionPolicy,
    operatorEditableFields: [],
    endClientEditableFields: [],
  };

  for (const rawLine of section.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("- ")) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(2, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (key === "builder") {
      policy.builder = normalizeAccessLevel(value, policy.builder);
      continue;
    }

    if (key === "operator") {
      policy.operator = normalizeAccessLevel(value, policy.operator);
      continue;
    }

    if (key === "end_client" || key === "endclient") {
      policy.endClient = normalizeAccessLevel(value, policy.endClient);
      continue;
    }

    if (key === "operatoreditablefields") {
      policy.operatorEditableFields = splitCommaList(value);
      continue;
    }

    if (key === "endclienteditablefields" || key === "end_clienteditablefields") {
      policy.endClientEditableFields = splitCommaList(value);
    }
  }

  return policy;
}

export function serializeCustomObjectPermissionPolicy(policy: CustomObjectPermissionPolicy) {
  return [
    `- builder: ${policy.builder}`,
    `- operator: ${policy.operator}`,
    `- end_client: ${policy.endClient}`,
    `- operatorEditableFields: ${policy.operatorEditableFields.join(", ")}`,
    `- endClientEditableFields: ${policy.endClientEditableFields.join(", ")}`,
  ].join("\n");
}

export function buildDefaultCustomObjectPermissionsSection() {
  return `## Permissions\n\n${serializeCustomObjectPermissionPolicy(defaultPermissionPolicy)}`;
}

export function upsertCustomObjectPermissionPolicy(blockMd: string, policy: CustomObjectPermissionPolicy) {
  return replaceBlockMdSection(blockMd, "Permissions", serializeCustomObjectPermissionPolicy(policy));
}

export function resolveCustomObjectAccess(params: {
  blockMd: string;
  role: CustomObjectRuntimeRole;
  editableFields: string[];
}) {
  const policy = parseCustomObjectPermissionPolicy(params.blockMd);
  const level = params.role === "builder"
    ? policy.builder
    : params.role === "operator"
      ? policy.operator
      : policy.endClient;
  const ownOnly = level.endsWith("-own");
  const canView = level !== "none";
  const canManage = level === "manage";
  const canEdit = level === "manage" || level === "edit" || level === "edit-own";
  const canCreate = canEdit;
  const editableFields = !canEdit
    ? []
    : params.role === "builder"
      ? params.editableFields
      : params.role === "operator"
        ? policy.operatorEditableFields.length > 0 ? params.editableFields.filter((field) => policy.operatorEditableFields.includes(field)) : params.editableFields
        : policy.endClientEditableFields.length > 0 ? params.editableFields.filter((field) => policy.endClientEditableFields.includes(field)) : params.editableFields;

  return {
    role: params.role,
    policy,
    canView,
    canCreate,
    canEdit,
    canManage,
    ownOnly,
    editableFields,
    label: params.role === "builder" ? "Builder access" : params.role === "operator" ? "Operator access" : ownOnly ? "End-client own-record access" : "End-client access",
  } satisfies CustomObjectResolvedAccess;
}

export function mergeScopedOverrideWithAccess(scopedOverride: CrmScopedOverride | undefined, access: CustomObjectResolvedAccess) {
  const existingEditableFields = scopedOverride?.editableFields ?? [];
  const editableFields = !access.canEdit
    ? []
    : existingEditableFields.length > 0
      ? existingEditableFields.filter((field) => access.editableFields.includes(field))
      : access.editableFields;

  return {
    ...scopedOverride,
    readOnly: Boolean(scopedOverride?.readOnly) || !access.canEdit,
    editableFields,
  } satisfies CrmScopedOverride;
}
