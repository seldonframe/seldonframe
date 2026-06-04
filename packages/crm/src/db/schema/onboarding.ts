// packages/crm/src/db/schema/onboarding.ts
// 2026-06-04 — Client-onboarding intake. Two tables:
//   onboarding_links — tokenized intake links sent to clients post-payment.
//   change_plans     — wiring-agent output: a validated diff to apply to
//                      the workspace (services, hours, branding, etc.).
// Spec: docs/superpowers/specs/2026-06-04-client-onboarding-intake-design.md

import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";

// Status flow: pending → submitted → applied
export type OnboardingLinkStatus = "pending" | "submitted" | "applied";

// Status flow: pending_review → applied | discarded
export type ChangePlanStatus = "pending_review" | "applied" | "discarded";

export const onboardingLinks = pgTable(
  "onboarding_links",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    status: text("status")
      .$type<OnboardingLinkStatus>()
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
  },
  (t) => [index("onboarding_links_token_idx").on(t.token)],
);

export const changePlans = pgTable(
  "change_plans",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    submissionId: uuid("submission_id"),
    plan: jsonb("plan").notNull(),
    status: text("status")
      .$type<ChangePlanStatus>()
      .notNull()
      .default("pending_review"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (t) => [index("change_plans_org_idx").on(t.orgId)],
);

export type OnboardingLink = typeof onboardingLinks.$inferSelect;
export type OnboardingLinkInsert = typeof onboardingLinks.$inferInsert;
export type ChangePlan = typeof changePlans.$inferSelect;
export type ChangePlanInsert = typeof changePlans.$inferInsert;
