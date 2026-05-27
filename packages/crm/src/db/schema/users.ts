import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import type { AgencyProfile } from "./agency-profile";

export const users = pgTable(
  "users",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    role: text("role").notNull().default("member"),
    avatarUrl: text("avatar_url"),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    passwordHash: text("password_hash"),
    planId: text("plan_id"),
    stripeCustomerId: text("stripe_customer_id"),
    // 2026-05-22 — Default payment method saved at signup via SetupIntent.
    // Captured in /signup/billing (step 2 of the two-step signup); reused
    // by future subscription kickoff at first-workspace-create or explicit
    // tier upgrade. No charge happens at signup — this is card-on-file only.
    stripePaymentMethodId: text("stripe_payment_method_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    billingPeriod: text("billing_period").notNull().default("monthly"),
    subscriptionStatus: text("subscription_status").notNull().default("trialing"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    // 2026-05-27 — Unified onboarding shell (migration 0055). NULL means
    // the user is mid-onboarding and the <OnboardingShell> renders the
    // step header strip on /signup/connect-ai, /clients/new, and the
    // workspace Ready page. Non-NULL stops the shell from ever rendering
    // again for that user. Set by markOnboardingComplete() when the
    // operator either connects a custom domain OR clicks "Maybe later"
    // on the Ready page's step-3 surface. Backfilled in the migration
    // for any user who already has a saved card or a workspace so
    // existing operators don't get re-onboarded.
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    agencyProfile: jsonb("agency_profile")
      .$type<AgencyProfile>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("users_org_id_idx").on(table.orgId)]
);
