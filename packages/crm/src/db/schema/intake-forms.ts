import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uuid, jsonb, unique } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { organizations } from "./organizations";

export type IntakeFormField = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
};

export const intakeForms = pgTable(
  "intake_forms",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    fields: jsonb("fields").$type<IntakeFormField[]>().notNull(),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("intake_forms_org_slug_unique").on(table.orgId, table.slug)]
);

export const intakeSubmissions = pgTable(
  "intake_submissions",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    formId: uuid("form_id")
      .notNull()
      .references(() => intakeForms.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("intake_submissions_org_form_idx").on(table.orgId, table.formId)]
);
