"use client";

import { useSoul } from "@/lib/hooks/use-soul";
import { resolveLabels } from "@/lib/soul/resolve";

export function useLabels() {
  const soul = useSoul();
  return resolveLabels(soul);
}
