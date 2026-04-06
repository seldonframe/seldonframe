import type { ReactNode } from "react";
import { googleFontUrl, themeToCSS } from "@/lib/theme/apply-theme";
import type { OrgTheme } from "@/lib/theme/types";

export function PublicThemeProvider({ theme, children }: { theme: OrgTheme; children: ReactNode }) {
  const cssVars = themeToCSS(theme);

  return (
    <>
      <link rel="stylesheet" href={googleFontUrl(theme.fontFamily)} />
      <div
        className="sf-public"
        style={{
          ...cssVars,
          fontFamily: `'${theme.fontFamily}', sans-serif`,
          backgroundColor: cssVars["--sf-bg"],
          color: cssVars["--sf-text"],
        }}
      >
        {children}
      </div>
    </>
  );
}
