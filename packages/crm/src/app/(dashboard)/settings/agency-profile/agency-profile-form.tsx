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
        <label htmlFor="logo" className="text-label">
          {C.fields.logo.label}
        </label>
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
          <input
            id="logo"
            type="file"
            accept="image/png,image/svg+xml,image/jpeg"
            onChange={handleLogoSelect}
            disabled={uploading}
            className="text-sm"
          />
        </div>
        <p className="text-xs text-muted-foreground">{C.fields.logo.help}</p>
        {uploading ? <p className="text-xs text-muted-foreground">Uploading...</p> : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="brandColor" className="text-label">
          {C.fields.brandColor.label}
        </label>
        <div className="flex items-center gap-3">
          <input
            id="brandColor"
            name="brandColor"
            type="color"
            defaultValue={initial.brand_color ?? "#7c3aed"}
            className="size-10 cursor-pointer rounded-md border border-border"
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
            className="crm-input h-10 w-32 px-3 font-mono text-sm"
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

      <button type="submit" disabled={pending || uploading} className="crm-button-primary h-10 px-5 text-sm">
        {pending ? "Saving..." : C.saveButton}
      </button>
    </form>
  );
}
