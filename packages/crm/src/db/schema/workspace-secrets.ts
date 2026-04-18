import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export const workspaceSecrets = pgTable(
  "workspace_secrets",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    scope: text("scope").notNull().default("workspace"),
    serviceName: text("service_name").notNull(),
    encryptedValue: text("encrypted_value").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    fingerprint: text("fingerprint").notNull(),
  },
  (table) => [
    index("workspace_secrets_workspace_idx").on(table.workspaceId),
    index("workspace_secrets_service_idx").on(table.serviceName),
    uniqueIndex("workspace_secrets_workspace_scope_service_uidx").on(table.workspaceId, table.scope, table.serviceName),
  ]
);
