// Drizzle-backed WorkspaceSecretsStore implementation.
//
// SLICE 6 PR 2 C3 per audit §4.3 + G-6-5.
//
// Queries workspace_secrets by (orgId, scope="workspace", serviceName)
// + decrypts via decryptValue. Matches the same pattern used by
// Twilio/Resend secret resolution (lib/sms/providers/twilio.ts:19-43).

import { and, eq } from "drizzle-orm";

import type { DbClient } from "@/db";
import { workspaceSecrets } from "@/db/schema/workspace-secrets";
import { decryptValue } from "@/lib/encryption";
import type { WorkspaceSecretsStore } from "./secret-resolver";

export function makeDrizzleWorkspaceSecretsStore(db: DbClient): WorkspaceSecretsStore {
  return {
    async findByOrgAndService({ orgId, serviceName }) {
      const [row] = await db
        .select({ encryptedValue: workspaceSecrets.encryptedValue })
        .from(workspaceSecrets)
        .where(
          and(
            eq(workspaceSecrets.workspaceId, orgId),
            eq(workspaceSecrets.scope, "workspace"),
            eq(workspaceSecrets.serviceName, serviceName),
          ),
        )
        .limit(1);

      if (!row) return null;
      return { plaintext: decryptValue(row.encryptedValue) };
    },
  };
}
