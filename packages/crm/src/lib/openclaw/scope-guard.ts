/**
 * OpenClaw end-client scope guard.
 *
 * End-clients in `end_client_mode` may only change things scoped to their own
 * client_id: their views, filters, personal field overrides, their own records,
 * their own notifications. They must never be able to mutate the parent
 * workspace, other clients' data, billing, integrations, workflows, or schema.
 *
 * Enforcement is defence-in-depth:
 *   1) pre-guard: reject obvious cross-scope intent in the raw description
 *   2) prompt contract: tell Seldon It the exact allow/deny rules
 *   3) (post-guard on results is a future slice)
 */

export type ScopeDenyReason = {
  category:
    | "global_deletion"
    | "other_client"
    | "workspace_schema"
    | "billing"
    | "integrations"
    | "permissions"
    | "workflows"
    | "install_block"
    | "self_service_toggle";
  message: string;
};

type DenyPattern = {
  re: RegExp;
  reason: ScopeDenyReason;
};

const DENY_PATTERNS: DenyPattern[] = [
  {
    re: /\b(delete|drop|wipe|purge|remove)\s+(all|every|the\s+entire|whole)\b/i,
    reason: {
      category: "global_deletion",
      message: "Bulk deletion across the workspace is not permitted from the client assistant.",
    },
  },
  {
    re: /\b(all|every|other)\s+(clients?|customers?|contacts?|users?|accounts?|tenants?)\b/i,
    reason: {
      category: "other_client",
      message: "You can only change things for your own account, not for other clients.",
    },
  },
  {
    re: /\b(master\s+template|parent\s+workspace|builder\s+dashboard|workspace-?wide|everyone'?s?)\b/i,
    reason: {
      category: "workspace_schema",
      message: "Workspace-wide changes are handled by the workspace owner, not the client assistant.",
    },
  },
  {
    re: /\b(stripe|billing|invoice|subscription|pricing|payout|refund)\b/i,
    reason: {
      category: "billing",
      message: "Billing and subscription changes can't be made from the client assistant.",
    },
  },
  {
    re: /\b(api\s*key|integration|webhook|smtp|oauth|connect\s+(gmail|slack|hubspot|salesforce|zapier))\b/i,
    reason: {
      category: "integrations",
      message: "Connecting or changing integrations is reserved for the workspace owner.",
    },
  },
  {
    re: /\b(permissions?|role|admin\s+access|grant\s+access|revoke\s+access)\b/i,
    reason: {
      category: "permissions",
      message: "Permission and role changes are handled by the workspace owner.",
    },
  },
  {
    re: /\b(global\s+workflow|workspace\s+workflow|automation\s+for\s+all)\b/i,
    reason: {
      category: "workflows",
      message: "Workspace-wide workflows are managed by the workspace owner.",
    },
  },
  {
    re: /\b(install|enable|disable)\s+(the\s+)?(block|marketplace)\b/i,
    reason: {
      category: "install_block",
      message: "Installing or removing blocks is reserved for the workspace owner.",
    },
  },
  {
    re: /\b(disable|turn\s+off)\s+self[-\s]?service\b/i,
    reason: {
      category: "self_service_toggle",
      message: "Self-service toggles are controlled by the workspace owner.",
    },
  },
];

export const END_CLIENT_ALLOWED_CATEGORIES = [
  "Create, rename, or filter views that belong to your account",
  "Set personal field overrides (labels, defaults, units) that only you see",
  "Create, edit, or delete records that belong to your account",
  "Customize your own notifications, reminders, or email preferences",
  "Change your own dashboard layout, saved filters, or sort order",
] as const;

export type GuardResult =
  | { allowed: true }
  | { allowed: false; reason: ScopeDenyReason; matched: string };

export function guardEndClientDescription(description: string): GuardResult {
  const text = description.trim();
  if (!text) {
    return { allowed: true };
  }

  for (const pattern of DENY_PATTERNS) {
    const match = pattern.re.exec(text);
    if (match) {
      return {
        allowed: false,
        reason: pattern.reason,
        matched: match[0],
      };
    }
  }

  return { allowed: true };
}

/**
 * Scope contract injected into the Seldon It prompt when `end_client_mode` is
 * active. Keeps the model aligned with the same rules as the pre-guard.
 */
export function buildEndClientScopeContract(clientId: string): string {
  const allowed = END_CLIENT_ALLOWED_CATEGORIES.map((line) => `  - ${line}`).join("\n");
  return [
    "[END_CLIENT_MODE]",
    `client_id: ${clientId}`,
    "scope_rules:",
    "  All changes MUST be scoped to this client_id only.",
    "  Persist every customization as a client-scoped override, never as a workspace-wide schema change.",
    "allowed:",
    allowed,
    "denied:",
    "  - Touching other clients' data, views, or records",
    "  - Workspace-wide schema, permission, billing, or integration changes",
    "  - Installing, enabling, or disabling blocks from the marketplace",
    "  - Modifying the parent workspace's master templates or global workflows",
    "If the request falls outside `allowed`, respond with a short refusal card and do not create or modify any block.",
  ].join("\n");
}
