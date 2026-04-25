// makeWorkspaceSecretResolver — production SecretResolver factory
// bound to a workspace (orgId) + storage abstraction.
//
// SLICE 6 PR 2 C3 per audit §4.3 + G-6-5.
//
// Returned closure queries workspace_secrets by (orgId, serviceName)
// + decrypts the encrypted value. Throws on miss or cross-org attempt
// — dispatchBranch classifies this as matched=false + error (no silent
// success).
//
// Storage is abstracted via WorkspaceSecretsStore — tests pass an
// in-memory fake; production binds to a Drizzle-backed adapter that
// queries the workspace_secrets table + calls decryptValue().

import type { SecretResolver } from "./external-state-evaluator";

export type WorkspaceSecretsStore = {
  findByOrgAndService(input: {
    orgId: string;
    serviceName: string;
  }): Promise<{ plaintext: string } | null>;
};

export function makeWorkspaceSecretResolver(args: {
  orgId: string;
  store: WorkspaceSecretsStore;
}): SecretResolver {
  return async (secretName: string): Promise<string> => {
    const row = await args.store.findByOrgAndService({
      orgId: args.orgId,
      serviceName: secretName,
    });
    if (!row) {
      throw new Error(
        `workspace secret "${secretName}" not found for org ${args.orgId}`,
      );
    }
    return row.plaintext;
  };
}
