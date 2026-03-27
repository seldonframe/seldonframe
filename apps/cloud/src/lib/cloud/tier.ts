import { redirect } from "next/navigation";
import type { CloudTier } from "./types";

const tierScore: Record<CloudTier, number> = {
  free: 0,
  pro: 1,
  enterprise: 2,
};

export function hasTier(current: CloudTier, minimum: CloudTier) {
  return tierScore[current] >= tierScore[minimum];
}

export function requireTier(current: CloudTier, minimum: CloudTier) {
  if (!hasTier(current, minimum)) {
    redirect("/billing?upgrade=1");
  }
}
