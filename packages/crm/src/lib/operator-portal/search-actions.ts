"use server";

import { requireOperatorSessionForOrg } from "./auth";
import { universalSearch, type UniversalSearchResult } from "./search";

export async function operatorSearchAction(params: {
  orgSlug: string;
  query: string;
}): Promise<UniversalSearchResult[]> {
  const session = await requireOperatorSessionForOrg(params.orgSlug);
  return universalSearch({ orgId: session.orgId, query: params.query, orgSlug: params.orgSlug });
}
