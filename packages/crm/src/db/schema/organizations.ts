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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
