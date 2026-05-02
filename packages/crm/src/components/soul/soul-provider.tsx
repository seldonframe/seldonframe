"use client";

import { createContext, useContext } from "react";
import type { OrgSoul } from "@/lib/soul/types";
import type { CRMPersonality } from "@/lib/crm/personality";

type SoulContextValue = {
  soul: OrgSoul | null;
  personality: CRMPersonality | null;
};

const SoulContext = createContext<SoulContextValue>({
  soul: null,
  personality: null,
});

export function SoulProvider({
  soul,
  personality = null,
  children,
}: {
  soul: OrgSoul | null;
  personality?: CRMPersonality | null;
  children: React.ReactNode;
}) {
  return (
    <SoulContext.Provider value={{ soul, personality }}>
      {children}
    </SoulContext.Provider>
  );
}

export function useSoulContext() {
  return useContext(SoulContext);
}
