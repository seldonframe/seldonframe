import { getSoul } from "@/lib/soul/server";
import { resolveLabels } from "@/lib/soul/resolve";
import { getPersonality } from "@/lib/crm/personality-server";

export async function getLabels(orgIdOverride?: string) {
  // v1.24.0 — accept orgId override for operator-portal mirror (which
  // doesn't go through NextAuth getOrgId resolution).
  const [soul, personality] = await Promise.all([
    getSoul(orgIdOverride),
    getPersonality(orgIdOverride),
  ]);
  return resolveLabels(soul, personality);
}
