"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Defers rendering until after hydration. Use to wrap any subtree that
 * would otherwise produce a hydration mismatch — e.g. components that
 * read browser-only state (window, navigator, localStorage), runtime
 * timezone, or auth context that diverges from server SSR.
 *
 * The cost: a single render frame where `fallback` is shown (defaults
 * to `null`). For interactive forms / modals this is invisible to the
 * operator. For above-the-fold layout chrome, prefer to fix the actual
 * source of the mismatch instead of using this wrapper.
 */
export function ClientOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return <>{mounted ? children : fallback}</>;
}
