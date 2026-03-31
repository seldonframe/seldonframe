"use client";

import { useSoulContext } from "@/components/soul/soul-provider";
import { resolveSoul } from "@/lib/soul/resolve";

export function useSoul() {
  const { soul } = useSoulContext();
  return resolveSoul(soul);
}

export function useSoulJourney() {
  const soul = useSoul();
  return soul?.journey ?? null;
}

export function useSoulGoals() {
  const soul = useSoul();
  return soul?.goals ?? null;
}

export function useSoulIntelligence() {
  const soul = useSoul();
  return soul?.clientIntelligence ?? null;
}

export function useSoulServices() {
  const soul = useSoul();
  return soul?.services ?? null;
}

export function useSoulEcosystem() {
  const soul = useSoul();
  return soul?.ecosystem ?? null;
}
