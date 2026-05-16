"use client";

import { useState, useTransition } from "react";
import type { AgencyProfile } from "@/db/schema/agency-profile";
import { saveAgencyProfile } from "@/lib/agency-profile/actions";
import { AGENCY_PROFILE_COPY as C } from "./copy";

// Cut B (2026-05-16) — design:design-system verdict: the native
// `<input type="color">` + paired hex `<input type="text">` pair is
// sufficient for screen-reader accessibility. No custom picker needed.

type Props = {
  initial: AgencyProfile;
};

export function AgencyProfileForm({ initial }: Props) {
  const [logoUrl, setLogoUrl] = useState(initial.logo_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  async function handleLogoSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/v1/web/uploads/user-image", { method: "POST", body: formData });
      const body = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!response.ok || !body?.url) {
        throw new Error(body?.error ?? "Upload failed.");
      }
      setLogoUrl(body.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function handleSubmit(formData: FormData) {
    formData.set("logoUrl", logoUrl);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveAgencyProfile(formData);
      if (result.ok) {
        setSaved(true);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <div className="space-y-1">
        <label htmlFor="name" className="text-label">
          {C.fields.name.label}
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={initial.name ?? ""}
          placeholder={C.fields.name.placeholder}
          className="crm-input h-10 w-full px-3"
        />
        <p className="text-xs text-muted-foreground">{C.fields.name.help}</p>
      </div>

      <div className="space-y-1">
        <span id="logoLabel" className="text-label">
          {C.fields.logo.label}
        </span>
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Agency logo preview"
              className="size-12 rounded-lg border border-border bg-card object-contain"
            />
          ) : (
            <div className="size-12 rounded-lg border border-dashed border-border" aria-hidden="true" />
          )}
          {/* Styled file input — native chrome would clash with the rest
              of the form. The visible <label> acts as the click target;
              the actual <input type="file"> is sr-only `peer` so screen
              readers announce it (via aria-label) and sighted keyboard
              users see the focus ring on the label (via peer-focus). */}
          <input
            id="logo"
            type="file"
            accept="image/png,image/svg+xml,image/jpeg"
            onChange={handleLogoSelect}
            disabled={uploading}
            aria-label={logoUrl ? "Replace agency logo" : "Upload agency logo"}
            className="peer sr-only"
          />
          <label
            htmlFor="logo"
            className="inline-flex h-9 cursor-pointer items-center rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-muted peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-card"
          >
            {uploading ? "Uploading..." : logoUrl ? "Replace image" : "Choose image"}
          </label>
        </div>
        <p className="text-xs text-muted-foreground">{C.fields.logo.help}</p>
      </div>

      <div className="space-y-1">
        <label htmlFor="brandColor" className="text-label">
          {C.fields.brandColor.label}
        </label>
        {/* Compound input — picker swatch + hex live inside one bordered
            container so they read as a single field, not two adjacent
            widgets. Vertical padding sized so the overall row clears
            44px (WCAG 2.5.5 target size). */}
        <div className="inline-flex items-center gap-2 rounded-md border border-border bg-background py-1.5 pl-1.5 pr-2 focus-within:ring-2 focus-within:ring-ring">
          <input
            id="brandColor"
            name="brandColor"
            type="color"
            defaultValue={initial.brand_color ?? "#7c3aed"}
            className="size-9 cursor-pointer rounded border-0 bg-transparent p-0"
            aria-describedby="brandColorHex"
          />
          <input
            id="brandColorHex"
            type="text"
            defaultValue={initial.brand_color ?? "#7c3aed"}
            onInput={(event) => {
              const colorInput = document.getElementById("brandColor") as HTMLInputElement | null;
              const value = event.currentTarget.value;
              if (colorInput && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) {
                colorInput.value = value;
              }
            }}
            placeholder="#7c3aed"
            className="h-9 w-24 border-0 bg-transparent font-mono text-sm focus:outline-none"
            aria-label="Brand color hex value"
          />
        </div>
        <p className="text-xs text-muted-foreground">{C.fields.brandColor.help}</p>
      </div>

      <div className="space-y-1">
        <label htmlFor="websiteUrl" className="text-label">
          {C.fields.websiteUrl.label}
        </label>
        <input
          id="websiteUrl"
          name="websiteUrl"
          type="url"
          defaultValue={initial.website_url ?? ""}
          placeholder={C.fields.websiteUrl.placeholder}
          className="crm-input h-10 w-full px-3"
        />
        <p className="text-xs text-muted-foreground">{C.fields.websiteUrl.help}</p>
      </div>

      {error ? (
        <p role="alert" className="rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="rounded-md border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">
          {C.savedToast}
        </p>
      ) : null}

      <div className="border-t border-border pt-5">
        <button type="submit" disabled={pending || uploading} className="crm-button-primary h-10 px-4 text-sm">
          {pending ? "Saving..." : C.saveButton}
        </button>
      </div>
    </form>
  );
}
