import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { organizations } from "./organizations";
import { users } from "./users";

export const portalDocuments = pgTable(
  "portal_documents",
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
    fileName: text("file_name").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    mimeType: text("mime_type").notNull(),
    blobUrl: text("blob_url").notNull(),
    blobPath: text("blob_path").notNull(),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    downloadCount: integer("download_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("portal_documents_org_contact_idx").on(table.orgId, table.contactId),
    index("portal_documents_uploader_idx").on(table.uploadedByUserId),
  ]
);
