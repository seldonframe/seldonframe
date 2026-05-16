// packages/crm/src/lib/agency-profile/run-save.ts
//
// DI-friendly orchestrator for the saveAgencyProfile server action. The
// thin server action in actions.ts wires this up against the real db +
// auth; tests inject fakes for both. Same convention as
// runListMineWorkspaces (Cut B).

import type { AgencyProfile } from "@/db/schema/agency-profile";

export type SessionUser = { id: string } | null;

export type UpdateUserAgencyProfileInput = {
  userId: string;
  profile: AgencyProfile;
};

export type RunSaveAgencyProfileDeps = {
  updateUserAgencyProfile: (input: UpdateUserAgencyProfileInput) => Promise<void>;
};

export type RunSaveAgencyProfileInput = {
  formData: FormData;
  sessionUser: SessionUser;
  deps: RunSaveAgencyProfileDeps;
};

export type RunSaveAgencyProfileResult =
  | { ok: true; profile: AgencyProfile }
  | { ok: false; error: string };

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const URL_RE = /^https?:\/\/[a-z0-9.-]+(\.[a-z]{2,})/i;

export async function runSaveAgencyProfile(
  input: RunSaveAgencyProfileInput
): Promise<RunSaveAgencyProfileResult> {
  if (!input.sessionUser?.id) {
    return { ok: false, error: "Unauthorized" };
  }

  const userId = input.sessionUser.id;
  const name = String(input.formData.get("name") ?? "").trim();
  const logoUrl = String(input.formData.get("logoUrl") ?? "").trim();
  const brandColor = String(input.formData.get("brandColor") ?? "").trim();
  const websiteUrl = String(input.formData.get("websiteUrl") ?? "").trim();

  if (!name) {
    return { ok: false, error: "Agency name is required." };
  }

  if (brandColor && !HEX_RE.test(brandColor)) {
    return { ok: false, error: "Brand color must be a hex value like #7c3aed." };
  }

  if (websiteUrl && !URL_RE.test(websiteUrl)) {
    return { ok: false, error: "Website URL must start with http:// or https://" };
  }

  const profile: AgencyProfile = {
    name,
    ...(logoUrl ? { logo_url: logoUrl } : {}),
    ...(brandColor ? { brand_color: brandColor } : {}),
    ...(websiteUrl ? { website_url: websiteUrl } : {}),
  };

  await input.deps.updateUserAgencyProfile({ userId, profile });

  return { ok: true, profile };
}
