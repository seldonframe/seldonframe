/**
 * P0-3: cross-surface re-render for a single org.
 *
 * When a workspace's plan changes (Stripe webhook, manual upgrade, or
 * the claim-and-checkout flow), we need to re-render every blueprint-
 * rendered surface so flags like `removePoweredBy` flip in the served
 * HTML. Without this, paying customers' /, /book, and /intake pages
 * keep showing "Powered by SeldonFrame" baked into the static HTML
 * stored at workspace creation time.
 *
 * Three surfaces walk:
 *   - landing_pages (template-source rows)
 *   - bookings (status=template rows)
 *   - intake_forms (all rows for the org)
 *
 * For each, we load the persisted Blueprint (or fall back to the
 * industry template), re-render with the new flag, and persist back to
 * the row's content_html / content_css columns.
 *
 * Idempotent. Safe to call from a webhook handler (no side effects
 * beyond the row writes; failures log and continue so a single broken
 * row can't block the rest of the org).
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, intakeForms, landingPages, organizations } from "@/db/schema";
import { renderGeneralServiceV1 } from "./renderers/general-service-v1";
import { renderCalcomMonthV1 } from "./renderers/calcom-month-v1";
import { renderFormbricksStackV1 } from "./renderers/formbricks-stack-v1";
import { loadBlueprintOrFallback } from "./persist";
import { canRemoveBranding, resolvePlanFromPlanId } from "@/lib/billing/entitlements";
import { getPlan } from "@/lib/billing/plans";

/**
 * Compute whether a workspace's rendered surfaces should hide the
 * "Powered by SeldonFrame" badge. Single source of truth — reach for
 * this anywhere a renderer or seed flow needs the flag.
 *
 * Reads the org's current plan from `organizations.plan` (kept in sync
 * with `organizations.subscription.tier` by the Stripe webhook). Free +
 * Starter tiers always show the badge; Cloud Pro / Cloud Agency hide
 * it. The `canRemoveBranding` entitlement helper is the canonical
 * gate.
 */
export async function shouldRemovePoweredByForOrg(orgId: string): Promise<boolean> {
  const [org] = await db
    .select({ plan: organizations.plan })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return false;
  const plan = resolvePlanFromPlanId(org.plan ?? null);
  return canRemoveBranding(plan);
}

/**
 * P0 — auto-flip `organizations.settings.branding.removePoweredBy` to
 * match the new tier's entitlement. Called from the Stripe webhook
 * after `updateOrgSubscription` writes the new tier, and BEFORE
 * `reRenderAllSurfacesForOrg` re-renders the baked HTML.
 *
 * Why this is needed even though the renderer already gates on plan:
 * the page-level virality wrapper (`shouldShowPoweredByBadgeForOrg`
 * in `lib/billing/public.ts`) reads `org.settings.branding.removePoweredBy`
 * as an explicit opt-in. Without this auto-flip, a paying Cloud Pro
 * customer keeps seeing "Powered by SeldonFrame" on every public page
 * until they manually toggle `/settings/branding` — defeating the
 * point of paying for the tier.
 *
 * Tier downgrades (e.g. Cloud Pro → free on `customer.subscription.deleted`)
 * flip the flag back to `false` so the badge returns automatically.
 *
 * Idempotent. Operators who manually set the flag get overwritten on
 * the next subscription event — that's intentional. The plan tier is
 * the source of truth for white-label entitlement; per-org overrides
 * exist only because there was no automation before this fix.
 */
export async function applyBrandingForTier(
  orgId: string,
  tier: string | null | undefined
): Promise<{ removePoweredBy: boolean }> {
  const plan = tier ? getPlan(tier) ?? null : null;
  const removePoweredBy = canRemoveBranding(plan);

  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const currentSettings =
    (org?.settings as Record<string, unknown> | null) ?? {};
  const currentBranding =
    currentSettings.branding && typeof currentSettings.branding === "object"
      ? (currentSettings.branding as Record<string, unknown>)
      : {};

  await db
    .update(organizations)
    .set({
      settings: {
        ...currentSettings,
        branding: {
          ...currentBranding,
          removePoweredBy,
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  return { removePoweredBy };
}

export interface ReRenderResult {
  landingsTouched: number;
  bookingsTouched: number;
  intakeFormsTouched: number;
}

/**
 * Re-render every blueprint-rendered surface for an org, applying the
 * current plan's white-label flag. Called from:
 *   - Stripe webhook on subscription.updated / created / deleted
 *   - claim-and-checkout's success_url callback (defensive — webhook
 *     already covers this but the re-render is cheap and idempotent)
 *
 * Falls back to the industry template's blueprint when a row's
 * `blueprint_json` is NULL (legacy rows that predate C3.3). The
 * fallback path also persists the recovered Blueprint, so the next
 * re-render is a clean round-trip.
 */
export async function reRenderAllSurfacesForOrg(orgId: string): Promise<ReRenderResult> {
  const removePoweredBy = await shouldRemovePoweredByForOrg(orgId);
  const result: ReRenderResult = {
    landingsTouched: 0,
    bookingsTouched: 0,
    intakeFormsTouched: 0,
  };

  // ─── Landing pages ───────────────────────────────────────────────
  try {
    const rows = await db
      .select({
        id: landingPages.id,
        title: landingPages.title,
        settings: landingPages.settings,
        blueprintJson: landingPages.blueprintJson,
      })
      .from(landingPages)
      .where(and(eq(landingPages.orgId, orgId), eq(landingPages.source, "template")));

    for (const row of rows) {
      try {
        const settings = (row.settings ?? {}) as Record<string, unknown>;
        const industry = typeof settings.industry === "string" ? (settings.industry as string) : null;
        const bp = loadBlueprintOrFallback(
          { blueprintJson: row.blueprintJson },
          row.title,
          industry
        );
        const { html, css } = renderGeneralServiceV1(bp, { removePoweredBy });
        await db
          .update(landingPages)
          .set({
            contentHtml: html,
            contentCss: css,
            blueprintJson: bp as unknown as Record<string, unknown>,
            updatedAt: new Date(),
          })
          .where(eq(landingPages.id, row.id));
        result.landingsTouched += 1;
      } catch (err) {
        console.warn(`[rerender-org] landing ${row.id} failed:`, err);
      }
    }
  } catch (err) {
    console.warn(`[rerender-org] landing-pages query failed for org ${orgId}:`, err);
  }

  // ─── Bookings (template rows) ────────────────────────────────────
  try {
    const rows = await db
      .select({
        id: bookings.id,
        title: bookings.title,
      })
      .from(bookings)
      .where(and(eq(bookings.orgId, orgId), eq(bookings.status, "template")));

    if (rows.length > 0) {
      // Booking renderer needs a full Blueprint with workspace + booking
      // sections. Cheapest source: the org's landing_pages.blueprint_json
      // (created by the seed flow with the same Blueprint that produced
      // the booking content_html). Fall back to industry template.
      const [landing] = await db
        .select({
          blueprintJson: landingPages.blueprintJson,
          title: landingPages.title,
          settings: landingPages.settings,
        })
        .from(landingPages)
        .where(and(eq(landingPages.orgId, orgId), eq(landingPages.slug, "home")))
        .limit(1);

      const settings = (landing?.settings ?? {}) as Record<string, unknown>;
      const industry = typeof settings.industry === "string" ? (settings.industry as string) : null;

      for (const row of rows) {
        try {
          const bp = loadBlueprintOrFallback(
            { blueprintJson: landing?.blueprintJson ?? null },
            landing?.title ?? row.title,
            industry
          );
          const { html, css } = renderCalcomMonthV1(bp, { removePoweredBy });
          await db
            .update(bookings)
            .set({ contentHtml: html, contentCss: css, updatedAt: new Date() })
            .where(eq(bookings.id, row.id));
          result.bookingsTouched += 1;
        } catch (err) {
          console.warn(`[rerender-org] booking ${row.id} failed:`, err);
        }
      }
    }
  } catch (err) {
    console.warn(`[rerender-org] bookings query failed for org ${orgId}:`, err);
  }

  // ─── Intake forms ────────────────────────────────────────────────
  try {
    const rows = await db
      .select({ id: intakeForms.id, name: intakeForms.name })
      .from(intakeForms)
      .where(eq(intakeForms.orgId, orgId));

    if (rows.length > 0) {
      const [landing] = await db
        .select({
          blueprintJson: landingPages.blueprintJson,
          title: landingPages.title,
          settings: landingPages.settings,
        })
        .from(landingPages)
        .where(and(eq(landingPages.orgId, orgId), eq(landingPages.slug, "home")))
        .limit(1);

      const settings = (landing?.settings ?? {}) as Record<string, unknown>;
      const industry = typeof settings.industry === "string" ? (settings.industry as string) : null;

      for (const row of rows) {
        try {
          const bp = loadBlueprintOrFallback(
            { blueprintJson: landing?.blueprintJson ?? null },
            landing?.title ?? row.name,
            industry
          );
          const { html, css } = renderFormbricksStackV1(bp, { removePoweredBy });
          await db
            .update(intakeForms)
            .set({ contentHtml: html, contentCss: css, updatedAt: new Date() })
            .where(eq(intakeForms.id, row.id));
          result.intakeFormsTouched += 1;
        } catch (err) {
          console.warn(`[rerender-org] intake ${row.id} failed:`, err);
        }
      }
    }
  } catch (err) {
    console.warn(`[rerender-org] intake-forms query failed for org ${orgId}:`, err);
  }

  return result;
}
