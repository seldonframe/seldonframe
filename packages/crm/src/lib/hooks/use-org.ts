"use client";

import { useSession } from "next-auth/react";

export function useOrg() {
  const { data } = useSession();

  return {
    orgId: data?.user?.orgId ?? null,
    role: data?.user?.role ?? null,
  };
}
