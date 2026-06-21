import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { agentTemplates } from "./agent-templates";

// ─── deployments ──────────────────────────────────────────────────────────

export type DeploymentStatus = "draft" | "active" | "paused" | "canceled";
export type DeploymentSurface = "phone" | "embed" | "link";

export type DeploymentClientContact = {
  phone?: string;
  email?: string;
  address?: string;
};

export type DeploymentCalendarRef = {
  provider?: string;
  accountId?: string;
  calendarId?: string;
};

export const deployments = pgTable(
  "deployments",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    builderOrgId: uuid("builder_org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    agentTemplateId: uuid("agent_template_id")
      .notNull()
      .references(() => agentTemplates.id, { onDelete: "restrict" }),
    clientName: text("client_name").notNull(),
    clientContact: jsonb("client_contact").$type<DeploymentClientContact>(),
    /** 'phone' | 'embed' | 'link' */
    surface: text("surface").notNull().default("phone"),
    /** E.164 phone number (nullable). */
    phoneNumber: text("phone_number"),
    /** Twilio PN… SID for the provisioned number. Required to attach the
     *  number to an Elastic SIP Trunk and to release it on cancellation. */
    phoneNumberSid: text("phone_number_sid"),
    /** How the phone number was acquired: 'provisioned' = SeldonFrame bought
     *  it in the builder's Twilio account (release on cancel); 'byo' = the
     *  builder brought their own number (never release). */
    numberOrigin: text("number_origin"),
    calendarRef: jsonb("calendar_ref").$type<DeploymentCalendarRef>(),
    /** Monthly amount the SMB client pays the builder (in cents). */
    priceCents: integer("price_cents").notNull().default(0),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripeCustomerId: text("stripe_customer_id"),
    /** 'draft' | 'active' | 'paused' | 'canceled' */
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("deployments_builder_status_idx").on(table.builderOrgId, table.status),
    uniqueIndex("deployments_phone_number_uniq")
      .on(table.phoneNumber)
      .where(sql`${table.phoneNumber} IS NOT NULL`),
  ],
);

export type Deployment = typeof deployments.$inferSelect;
export type NewDeployment = typeof deployments.$inferInsert;
