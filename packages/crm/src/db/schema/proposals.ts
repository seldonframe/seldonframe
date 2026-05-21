// packages/crm/src/db/schema/proposals.ts
// 2026-05-19 — Proposal Builder. Drizzle schema mirroring migration 0049.
// Spec: 2026-05-19-proposal-builder-design.md.

import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export type ProposalStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "accepted"
  | "declined"
  | "expired";

export type ProposalPricingTier = "starter" | "growth" | "pro" | "custom";

export type ProposalScopeItem = {
  label: string;
  description?: string;
};

export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    agencyOrgId: uuid("agency_org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    prospectUrl: text("prospect_url").notNull(),
    prospectName: text("prospect_name").notNull(),
    prospectEmail: text("prospect_email").notNull(),
    prospectFirstName: text("prospect_first_name"),
    prospectPhone: text("prospect_phone"),
    previewWorkspaceId: uuid("preview_workspace_id").references(
      () => organizations.id,
      { onDelete: "set null" }
    ),
    pricingTier: text("pricing_tier").$type<ProposalPricingTier>().notNull(),
    monthlyPriceCents: integer("monthly_price_cents").notNull(),
    setupFeeCents: integer("setup_fee_cents").notNull().default(0),
    generatedHtml: text("generated_html").notNull(),
    scopeItems: jsonb("scope_items")
      .$type<ProposalScopeItem[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: text("status").$type<ProposalStatus>().notNull().default("draft"),
    signedToken: text("signed_token").notNull().unique(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    declinedReason: text("declined_reason"),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW() + INTERVAL '30 days'`),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripeCustomerId: text("stripe_customer_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("proposals_agency_status_idx").on(
      table.agencyOrgId,
      table.status,
      table.createdAt,
    ),
    index("proposals_signed_token_idx").on(table.signedToken),
    index("proposals_checkout_session_idx")
      .on(table.stripeCheckoutSessionId)
      .where(sql`${table.stripeCheckoutSessionId} IS NOT NULL`),
  ],
);

export type Proposal = typeof proposals.$inferSelect;
export type ProposalInsert = typeof proposals.$inferInsert;
