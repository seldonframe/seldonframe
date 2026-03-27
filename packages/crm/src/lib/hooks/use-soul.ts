"use client";

import { useSoulContext } from "@/components/soul/soul-provider";
import { resolveSoul } from "@/lib/soul/resolve";

export function useSoul() {
  const { soul } = useSoulContext();
  return resolveSoul(soul);
}
