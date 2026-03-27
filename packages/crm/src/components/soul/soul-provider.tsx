"use client";

import { createContext, useContext } from "react";
import type { OrgSoul } from "@/lib/soul/types";

type SoulContextValue = {
  soul: OrgSoul | null;
};

const SoulContext = createContext<SoulContextValue>({ soul: null });

export function SoulProvider({
  soul,
  children,
}: {
  soul: OrgSoul | null;
  children: React.ReactNode;
}) {
  return <SoulContext.Provider value={{ soul }}>{children}</SoulContext.Provider>;
}

export function useSoulContext() {
  return useContext(SoulContext);
}
