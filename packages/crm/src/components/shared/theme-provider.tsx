"use client";

import type { ReactNode } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// `next-themes` resolves its peer `@types/react` to the v18 typings while the
// rest of the workspace is on v19. Both are structurally compatible at
// runtime; TypeScript treats the two `ReactNode` types as nominally
// distinct, surfacing a spurious "ReactPortal missing children" error on the
// inner component. The `as never` cast is the minimal workaround until
// next-themes ships a v19-compatible peer or apps/web upgrades from React 18.
// Surfaced by the Phase 3 C1 strict typecheck gate.
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      {children as never}
    </NextThemesProvider>
  );
}
