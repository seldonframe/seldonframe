"use client";

import { useMemo, useState } from "react";
import type { OrgTheme } from "@/lib/theme/types";

const SWATCHES = ["#14b8a6", "#3b82f6", "#8b5cf6", "#f43f5e", "#f97316", "#10b981", "#64748b", "#f59e0b"] as const;

const FONT_OPTIONS: OrgTheme["fontFamily"][] = ["Inter", "DM Sans", "Playfair Display", "Space Grotesk", "Lora", "Outfit"];

const RADIUS_OPTIONS: Array<{ value: OrgTheme["borderRadius"]; label: string; radius: string }> = [
  { value: "sharp", label: "Sharp", radius: "0px" },
  { value: "rounded", label: "Rounded", radius: "8px" },
  { value: "pill", label: "Pill", radius: "9999px" },
];

export function ThemeSettingsForm({
  orgName,
  initialTheme,
  action,
}: {
  orgName: string;
  initialTheme: OrgTheme;
  action: (formData: FormData) => void;
}) {
  const [theme, setTheme] = useState<OrgTheme>(initialTheme);

  const radius = useMemo(
    () => RADIUS_OPTIONS.find((item) => item.value === theme.borderRadius)?.radius ?? "8px",
    [theme.borderRadius]
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
      <article className="rounded-xl border bg-card p-5">
        <form action={action} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="primaryColor" className="text-label">Primary color</label>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {SWATCHES.map((color) => (
                <button
                  key={`primary-${color}`}
                  type="button"
                  onClick={() => setTheme((current) => ({ ...current, primaryColor: color }))}
                  className="rounded-md border border-border p-1"
                >
                  <span className="block h-7 w-full rounded-sm" style={{ backgroundColor: color }} />
                </button>
              ))}
            </div>
            <input
              id="primaryColor"
              name="primaryColor"
              value={theme.primaryColor}
              onChange={(event) => setTheme((current) => ({ ...current, primaryColor: event.target.value }))}
              className="crm-input h-10 w-full px-3"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="accentColor" className="text-label">Accent color</label>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {SWATCHES.map((color) => (
                <button
                  key={`accent-${color}`}
                  type="button"
                  onClick={() => setTheme((current) => ({ ...current, accentColor: color }))}
                  className="rounded-md border border-border p-1"
                >
                  <span className="block h-7 w-full rounded-sm" style={{ backgroundColor: color }} />
                </button>
              ))}
            </div>
            <input
              id="accentColor"
              name="accentColor"
              value={theme.accentColor}
              onChange={(event) => setTheme((current) => ({ ...current, accentColor: event.target.value }))}
              className="crm-input h-10 w-full px-3"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="fontFamily" className="text-label">Font family</label>
            <select
              id="fontFamily"
              name="fontFamily"
              value={theme.fontFamily}
              onChange={(event) => setTheme((current) => ({ ...current, fontFamily: event.target.value as OrgTheme["fontFamily"] }))}
              className="crm-input h-10 w-full px-3"
            >
              {FONT_OPTIONS.map((font) => (
                <option key={font} value={font}>{font}</option>
              ))}
            </select>
            <p className="text-sm text-muted-foreground" style={{ fontFamily: `'${theme.fontFamily}', sans-serif` }}>
              This is how your pages will look to clients.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-label">Mode</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="inline-flex items-center gap-2 rounded-md border border-border bg-background/40 px-3 py-2 text-sm">
                <input
                  type="radio"
                  name="mode"
                  value="light"
                  checked={theme.mode === "light"}
                  onChange={() => setTheme((current) => ({ ...current, mode: "light" }))}
                  className="accent-primary"
                />
                <span>Light</span>
              </label>
              <label className="inline-flex items-center gap-2 rounded-md border border-border bg-background/40 px-3 py-2 text-sm">
                <input
                  type="radio"
                  name="mode"
                  value="dark"
                  checked={theme.mode === "dark"}
                  onChange={() => setTheme((current) => ({ ...current, mode: "dark" }))}
                  className="accent-primary"
                />
                <span>Dark</span>
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-label">Border radius</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {RADIUS_OPTIONS.map((option) => (
                <label key={option.value} className="rounded-md border border-border bg-background/40 p-3 cursor-pointer">
                  <input
                    type="radio"
                    name="borderRadius"
                    value={option.value}
                    checked={theme.borderRadius === option.value}
                    onChange={() => setTheme((current) => ({ ...current, borderRadius: option.value }))}
                    className="sr-only"
                  />
                  <p className="text-xs text-muted-foreground">{option.label}</p>
                  <span className="mt-2 inline-flex h-8 items-center justify-center bg-primary px-3 text-xs text-primary-foreground" style={{ borderRadius: option.radius }}>
                    Button
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="logoUrl" className="text-label">Logo URL</label>
            <input
              id="logoUrl"
              name="logoUrl"
              value={theme.logoUrl ?? ""}
              onChange={(event) => setTheme((current) => ({ ...current, logoUrl: event.target.value.trim() || null }))}
              placeholder="https://example.com/logo.png"
              className="crm-input h-10 w-full px-3"
            />
            {theme.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={theme.logoUrl} alt="Logo preview" className="mt-2 h-10 w-auto rounded" />
            ) : null}
          </div>

          <button type="submit" className="crm-button-primary h-10 px-4">Save Theme</button>
        </form>
      </article>

      <aside className="rounded-xl border bg-card p-5 space-y-3">
        <p className="text-sm font-medium text-foreground">Live preview</p>
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="h-8" style={{ backgroundColor: theme.primaryColor }} />
          <div
            className="p-4 space-y-3"
            style={{
              backgroundColor: theme.mode === "dark" ? "#18181b" : "#f4f4f5",
              color: theme.mode === "dark" ? "#fafafa" : "#09090b",
              fontFamily: `'${theme.fontFamily}', sans-serif`,
            }}
          >
            <p className="text-base font-semibold">{orgName}</p>
            <p className="text-xs" style={{ color: theme.mode === "dark" ? "#a1a1aa" : "#71717a" }}>Client-facing page style preview</p>
            <button
              type="button"
              className="inline-flex h-9 items-center px-4 text-sm text-white"
              style={{ backgroundColor: theme.primaryColor, borderRadius: radius }}
            >
              Primary action
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
