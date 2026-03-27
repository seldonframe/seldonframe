import { getSoul } from "@/lib/soul/server";
import { resolveLabels } from "@/lib/soul/resolve";

export async function getLabels() {
  const soul = await getSoul();
  return resolveLabels(soul);
}
