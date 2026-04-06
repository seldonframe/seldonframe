import { DEFAULT_ORG_THEME } from "@/lib/theme/types";
import { ThemeSettingsForm } from "@/components/theme/theme-settings-form";
import { getThemeSettings, saveThemeSettingsAction } from "@/lib/theme/actions";

export default async function ThemeSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const params = await searchParams;
  const payload = await getThemeSettings();

  if (!payload) {
    return null;
  }

  const theme = payload.theme ?? DEFAULT_ORG_THEME;

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">Brand & Theme</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Set colors, font, radius, mode, and logo for all public pages.</p>
      </div>

      {params.saved === "1" ? (
        <p className="rounded-md border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">Theme settings saved</p>
      ) : null}

      <ThemeSettingsForm orgName={payload.orgName} initialTheme={theme} action={saveThemeSettingsAction} />
    </section>
  );
}
