import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { mintWorkspaceToken } from "@/lib/auth/workspace-token";
import { buildBlueprintForWorkspace } from "@/lib/blueprint/persist";
import {
  createDefaultBookingTemplate,
  createDefaultIntakeForm,
  createDefaultLandingPage,
} from "@/lib/blocks/templates";
import { ensureDefaultPipelineForOrg } from "@/lib/deals/pipeline-defaults";
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
  /**
   * Optional industry slug used to pick a starter blueprint
   * (skills/templates/<industry>.json). Falls back to "general" when
   * absent or unmatched. Phase 3 C3 — drives the blueprint renderer
   * for the workspace's landing page.
   */
  industry?: string | null;
};

export type AnonymousCreateResult = {
  orgId: string;
  slug: string;
  name: string;
  bearerToken: string;
  /**
   * C6: when present, the bearer token expires at this instant. The
   * route handler echoes this into `bearer_token_expires_at` so MCP
   * clients can warn the operator before the admin URL stops working.
   * Null for tokens minted without an expiry (legacy paths).
   */
  bearerTokenExpiresAt: Date | null;
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

  // C6: 7-day expiry on the bearer minted at workspace creation. The token
  // doubles as the admin-URL credential (see /admin/[workspaceId]/route.ts);
  // capping its lifetime is a small but real harm-reduction step in case a
  // URL leaks via screenshot / clipboard / browser history.
  const minted = await mintWorkspaceToken(org.id, {
    name: "mcp:anonymous-create",
    expiresInDays: 7,
  });

  // Wiring task: build the Blueprint ONCE up front and thread it into
  // all three seed helpers so booking + intake render their respective
  // sections from the same source of truth that produces the landing.
  // All three landing surfaces end up with pre-rendered contentHtml/Css,
  // and the public routes serve them directly — operator clients see one
  // unified product across /, /book, and /intake.
  const seedBlueprint = buildBlueprintForWorkspace(
    org.name,
    input.industry ?? null
  );

  // Seed default templates for every block we mark as enabled. Without these
  // rows the public subdomain routes (/, /book, /intake) point at the right
  // pages but those pages 404 because the underlying record doesn't exist.
  // All three helpers are idempotent — re-running on an existing workspace is
  // a no-op. Failures are logged but non-fatal: the workspace itself succeeded
  // and the typed customizers (landing/update, configure_booking,
  // customize_intake_form) can still create or repair these rows on demand.
  //
  // The pipeline seed is added alongside the public-surface seeds so the
  // CRM (/contacts, /deals) is usable from the first dashboard load.
  // Pre-2026-04-29 workspaces don't have this row — `createDealAction`
  // self-heals via ensureDefaultPipelineForOrg as a backup.
  await Promise.all([
    ensureDefaultPipelineForOrg(org.id, org.name).catch((error) => {
      console.warn(
        `[anonymous-workspace] pipeline seed failed for ${org.id}:`,
        error instanceof Error ? error.message : String(error)
      );
    }),
    createDefaultLandingPage(org.id, {
      workspaceName: org.name,
      theme: "dark",
      industry: input.industry ?? null,
    }).catch((error) => {
      console.warn(
        `[anonymous-workspace] landing-page seed failed for ${org.id}:`,
        error instanceof Error ? error.message : String(error)
      );
    }),
    createDefaultBookingTemplate(org.id, {
      theme: "dark",
      blueprint: seedBlueprint,
    }).catch((error) => {
      console.warn(
        `[anonymous-workspace] booking-template seed failed for ${org.id}:`,
        error instanceof Error ? error.message : String(error)
      );
    }),
    createDefaultIntakeForm(org.id, {
      theme: "dark",
      blueprint: seedBlueprint,
    }).catch((error) => {
      console.warn(
        `[anonymous-workspace] intake-form seed failed for ${org.id}:`,
        error instanceof Error ? error.message : String(error)
      );
    }),
  ]);

  return {
    orgId: org.id,
    slug: org.slug,
    name: org.name,
    bearerToken: minted.token,
    bearerTokenExpiresAt: minted.expiresAt,
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
    // ───── Flat shape (kept for backward compat with MCP v1.0.1 clients). ─────
    home: publicOrigin,
    book: `${publicOrigin}/book`,
    intake: `${publicOrigin}/intake`,
    admin_dashboard: sw("/dashboard"),
    admin_contacts: sw("/contacts"),
    admin_deals: sw("/deals"),
  };
}

/**
 * Structured public/admin split — used in the create_workspace API response
 * alongside the flat `urls` object. The split makes it easier for Claude Code
 * to present the result clearly.
 *
 * C6: when a fresh bearer token is provided, we also build an `admin_url`
 * that lets the operator click directly into the admin dashboard with
 * zero signup. The token rides as a query-string param; the route at
 * /admin/[workspaceId] validates it, sets the admin-token cookie, and
 * redirects to /dashboard. Token expires after 7 days (matched on both
 * the api_keys row and the cookie).
 */
export function buildStructuredWorkspaceUrls(
  slug: string,
  baseDomain: string,
  orgId: string,
  opts?: { bearerToken?: string }
) {
  const publicOrigin = `https://${slug}.${baseDomain}`;
  const adminOrigin = `https://${APP_HOST}`;
  const sw = (next: string) =>
    `${adminOrigin}/switch-workspace?to=${encodeURIComponent(orgId)}&next=${encodeURIComponent(next)}`;

  // C6 — single-click admin URL. Only present when a bearer token is
  // available (e.g. immediately after create_workspace). Pre-existing
  // workspaces returned via list_workspaces don't get this URL because
  // we don't re-mint tokens on read paths.
  const adminUrl = opts?.bearerToken
    ? `${adminOrigin}/admin/${encodeURIComponent(orgId)}?token=${encodeURIComponent(opts.bearerToken)}`
    : null;

  return {
    public_urls: {
      home: publicOrigin,
      book: `${publicOrigin}/book`,
      intake: `${publicOrigin}/intake`,
    },
    admin_url: adminUrl,
    admin_urls: {
      dashboard: sw("/dashboard"),
      contacts: sw("/contacts"),
      deals: sw("/deals"),
      agents: sw("/agents"),
      settings: sw("/settings"),
    },
    admin_setup_note: adminUrl
      ? "The `admin_url` above is the fastest way in: paste it into your browser to land directly on the dashboard (token-scoped, no signup, expires in 7 days). The `admin_urls` map is the legacy login-required path — use it only after you've signed up at app.seldonframe.com and run link_workspace_owner({})."
      : "Admin URLs require login at app.seldonframe.com AND for the workspace to be linked to your user account. To enable browser admin access: " +
        "(1) Sign up at https://app.seldonframe.com/signup. " +
        "(2) In Settings → API, generate a SELDONFRAME_API_KEY. " +
        "(3) `export SELDONFRAME_API_KEY=sk-…` in your shell and restart Claude Code. " +
        "(4) Run `link_workspace_owner({})` to attach this workspace to your account. " +
        "After that, clicking an admin URL routes through /switch-workspace, sets the active-org cookie, and lands you on the requested page.",
  };
}
