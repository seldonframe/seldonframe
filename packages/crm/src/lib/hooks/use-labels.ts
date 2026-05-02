"use client";

import { useSoulContext } from "@/components/soul/soul-provider";
import { resolveLabels } from "@/lib/soul/resolve";

export function useLabels() {
  const { soul, personality } = useSoulContext();
  return resolveLabels(soul, personality);
}
