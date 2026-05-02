import { getSoul } from "@/lib/soul/server";
import { resolveLabels } from "@/lib/soul/resolve";
import { getPersonality } from "@/lib/crm/personality-server";

export async function getLabels() {
  const [soul, personality] = await Promise.all([getSoul(), getPersonality()]);
  return resolveLabels(soul, personality);
}
