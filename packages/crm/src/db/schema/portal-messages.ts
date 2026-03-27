import { sql } from "drizzle-orm";
import { desc } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { organizations } from "./organizations";

export const portalMessages = pgTable(
  "portal_messages",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    senderType: text("sender_type").notNull().default("client"),
    senderName: text("sender_name"),
    subject: text("subject"),
    body: text("body").notNull(),
    attachmentUrl: text("attachment_url"),
    attachmentName: text("attachment_name"),
    isPinned: text("is_pinned").notNull().default("false"),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    index("portal_messages_org_contact_created_idx").on(table.orgId, table.contactId, desc(table.createdAt)),
    index("portal_messages_org_contact_read_idx").on(table.orgId, table.contactId, table.readAt),
  ]
);
