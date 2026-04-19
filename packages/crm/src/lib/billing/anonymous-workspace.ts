import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { mintWorkspaceToken } from "@/lib/auth/workspace-token";
import { createDefaultLandingPage } from "@/lib/blocks/templates";
import { isReservedSlug } from "@/lib/utils/reserved-slugs";

const DEFAULT_ENABLED_BLOCKS = [
  "crm",
  "caldiy-booking",
  "formbricks-intake",
  "brain-v2",
];

export type AnonymousCreateInput = {
  name: string;
  source?: string | null;
};

export type AnonymousCreateResult = {
  orgId: string;
  slug: string;
  name: string;
  bearerToken: string;
  installedBlocks: string[];
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function resolveUniqueSlug(desired: string): Promise<string> {
  const base = desired || `workspace-${randomUUID().slice(0, 6)}`;
  let candidate = base;

  if (isReservedSlug(candidate)) {
    candidate = `${base}-${randomUUID().slice(0, 4)}`;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const [existing] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, candidate))
      .limit(1);
    if (!existing) {
      return candidate;
    }
    candidate = `${base}-${randomUUID().slice(0, 4)}`;
  }

  throw new Error("Could not allocate a unique slug after 8 attempts.");
}

export async function createAnonymousWorkspace(
  input: AnonymousCreateInput
): Promise<AnonymousCreateResult> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Workspace name is required.");
  }
  if (name.length > 64) {
    throw new Error("Workspace name must be 64 characters or fewer.");
  }

  const baseSlug = slugify(name);
  const slug = await resolveUniqueSlug(baseSlug);

  const [org] = await db
    .insert(organizations)
    .values({
      name,
      slug,
      ownerId: null,
      parentUserId: null,
      plan: "free",
      enabledBlocks: DEFAULT_ENABLED_BLOCKS,
      settings: input.source ? { source: input.source } : {},
    })
    .returning({ id: organizations.id, slug: organizations.slug, name: organizations.name });

  if (!org) {
    throw new Error("Could not create workspace.");
  }

  const minted = await mintWorkspaceToken(org.id, { name: "mcp:anonymous-create" });

  // Seed a published landing page at slug "home" so the subdomain root
  // renders something real instead of 404. Idempotent.
  await createDefaultLandingPage(org.id, {
    workspaceName: org.name,
    theme: "dark",
  }).catch((error) => {
    // Non-fatal: the workspace exists; the landing page can be created later.
    console.warn(
      `[anonymous-workspace] landing-page seed failed for ${org.id}:`,
      error instanceof Error ? error.message : String(error)
    );
  });

  return {
    orgId: org.id,
    slug: org.slug,
    name: org.name,
    bearerToken: minted.token,
    installedBlocks: DEFAULT_ENABLED_BLOCKS,
  };
}

const APP_HOST = "app.seldonframe.com";

export function buildWorkspaceUrls(
  slug: string,
  baseDomain: string,
  orgId: string
) {
  const publicOrigin = `https://${slug}.${baseDomain}`;
  const adminOrigin = `https://${APP_HOST}`;
  const sw = (next: string) =>
    `${adminOrigin}/switch-workspace?to=${encodeURIComponent(orgId)}&next=${encodeURIComponent(next)}`;
  return {
    // Public-facing — shareable, no login required.
    home: publicOrigin,
    book: `${publicOrigin}/book`,
    intake: `${publicOrigin}/intake`,
    // Admin — require a session. These route through /switch-workspace,
    // which sets the active-org cookie before the admin page loads.
    admin_dashboard: sw("/dashboard"),
    admin_contacts: sw("/contacts"),
    admin_deals: sw("/deals"),
  };
}
