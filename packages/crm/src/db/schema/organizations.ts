import { sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uuid, jsonb, integer } from "drizzle-orm/pg-core";
import type { SoulLearning } from "@seldonframe/core/soul";
import type { OrgSoul } from "@/lib/soul/types";
import { DEFAULT_ORG_THEME, type OrgTheme } from "@/lib/theme/types";
import type { TwilioTestConfig, ResendTestConfig } from "@/lib/test-mode/schema";

export type OrganizationIntegrations = {
  twilio?: {
    accountSid: string;
    authToken: string;
    fromNumber: string;
    connected: boolean;
    /** SLICE 8 G-8-3: per-provider test credentials for sandbox routing. */
    test?: TwilioTestConfig;
    /** Operator Portal PWA v2: A2P campaign approved; outbound SMS enabled. */
    outboundSmsEnabled?: boolean;
    /** Elastic SIP Trunk SID (TK…) for voice-number provisioning (Phase 0).
     *  Set via the Telephony settings UI (later phase). */
    voiceTrunkSid?: string;
  };
  resend?: {
    apiKey: string;
    fromEmail: string;
    fromName: string;
    connected: boolean;
    /** SLICE 8 G-8-3: per-provider test credentials for sandbox routing. */
    test?: ResendTestConfig;
  };
  kit?: {
    apiKey: string;
    connected: boolean;
  };
  newsletter?: {
    provider: "kit" | "mailchimp" | "beehiiv";
    apiKey: string;
    connected: boolean;
    subscriberCount?: number;
    listId?: string;
    publicationId?: string;
  };
  google?: {
    calendarConnected: boolean;
    connected?: boolean;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    scope?: string;
  };
};

export type OrganizationSubscription = {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  tier?: string;
  maxWorkspaces?: number;
  selfServiceEnabled?: boolean;
  openClawEnabled?: boolean;
  layer2Enabled?: boolean;
  selfServiceActivatedAt?: string | null;
  status?: "active" | "trialing" | "past_due" | "canceled" | "unpaid";
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  stripeProcessedEventIds?: string[];
  /** Agency only — the Stripe subscription-item id for the $10
   *  quantity-licensed "extra client workspace" overage line. Tracked
   *  so Phase 4 can update its quantity = max(0, activeWorkspaces −
   *  includedWorkspaces) without re-scanning the subscription. */
  stripeWorkspaceItemId?: string | null;
  /** Agency only — the quantity last pushed to the overage
   *  subscription-item (Phase 4). Lets syncAgencyWorkspaceQuantity skip
   *  the Stripe round-trip when the active-workspace count hasn't moved,
   *  so the nightly reconcile is a no-op in steady state. */
  stripeWorkspaceItemQuantity?: number | null;
  /** Agency only — number of client workspaces included in the base
   *  price before the overage item is billed. Defaults to 10. */
  includedWorkspaces?: number;
};

export const organizations = pgTable("organizations", {
  id: uuid("id")
    .default(sql`gen_random_uuid()`)
    .primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerId: uuid("owner_id"),
  parentUserId: uuid("parent_user_id"),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  soul: jsonb("soul").$type<OrgSoul | null>().default(null),
  soulId: text("soul_id"),
  soulContentGenerated: integer("soul_content_generated").notNull().default(0),
  soulLearning: jsonb("soul_learning").$type<SoulLearning>().notNull().default(sql`'{}'::jsonb`),
  theme: jsonb("theme").$type<OrgTheme>().notNull().default(DEFAULT_ORG_THEME),
  soulCompletedAt: timestamp("soul_completed_at", { withTimezone: true }),
  enabledBlocks: text("enabled_blocks").array().notNull().default(sql`'{}'::text[]`),
  integrations: jsonb("integrations").$type<OrganizationIntegrations>().notNull().default(sql`'{}'::jsonb`),
  subscription: jsonb("subscription").$type<OrganizationSubscription>().notNull().default(sql`'{}'::jsonb`),
  plan: text("plan").notNull().default("free"),
  emailSendsThisMonth: integer("email_sends_this_month").notNull().default(0),
  aiCallsToday: integer("ai_calls_today").notNull().default(0),
  usageResetAt: timestamp("usage_reset_at", { withTimezone: true }),
  // SLICE 5 PR 1 C3 — workspace IANA timezone. Drives scheduled-trigger
  // next-fire computation when the trigger itself doesn't specify a
  // timezone (per G-5-1: workspace default + per-trigger override).
  // Default "UTC" so all existing workspaces have valid state; operators
  // edit in a later admin-UI slice.
  timezone: text("timezone").notNull().default("UTC"),
  // SLICE 8 G-8-1 — workspace test mode flag. When true, dispatchers
  // (sendSmsFromApi, sendEmailFromApi) consult per-provider
  // integrations.{provider}.test sub-objects and route external API
  // calls to provider sandbox endpoints. Mirrors the column-not-JSONB
  // convention of `plan`, `timezone`, `soulCompletedAt`. Default false
  // so existing workspaces never accidentally route to sandbox.
  testMode: boolean("test_mode").notNull().default(false),
  // 2026-05-19 — Proposal Builder. When true, this workspace was
  // provisioned as part of a proposal pitch and is gated from billing
  // + agent runs until the prospect accepts and the checkout webhook
  // flips this back to false. Default false so all existing workspaces
  // are unaffected. Set/unset via lib/proposals/activate-workspace.ts.
  previewMode: boolean("preview_mode").notNull().default(false),
  // v1.17.0 — white-label hierarchy. When set, the workspace inherits
  // its chrome (logo, colors, sender, support links) from the parent
  // agency. NULL = default SeldonFrame branding (existing behavior).
  // Foreign key to partner_agencies(id) added via the 0040 migration;
  // not declared here to avoid a circular import (partner_agencies
  // references users, organizations references partner_agencies via
  // FK constraint at the SQL layer only).
  parentAgencyId: uuid("parent_agency_id"),
  // 2026-06-21 — Deployment front-office bridge. When set, this workspace was
  // an agency-managed CLIENT workspace whose owning deployment was canceled;
  // it is ARCHIVED (data retained, never deleted) and excluded from active
  // workspace lists + the billing workspace-count (so an archived client org
  // never counts against the builder's limit / triggers a charge). NULL =
  // active (existing behavior). Set via cancelDeploymentAction.
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
