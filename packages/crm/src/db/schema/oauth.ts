import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";
import { apiKeys } from "./api-keys";

// Public clients ONLY in v1 — no client_secret column. Every registered client
// is treated as a public OAuth client (token_endpoint_auth_method: "none"),
// per this design's DCR choice (see 2026-07-03-oauth-connector-design.md §1.1
// and §3.2). Do not add a secret column without re-reading that rationale.
export const oauthClients = pgTable(
  "oauth_clients",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    clientId: text("client_id").notNull().unique(),
    clientName: text("client_name"),
    redirectUris: jsonb("redirect_uris").notNull().$type<string[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("oauth_clients_client_id_idx").on(table.clientId)]
);

export const oauthAuthorizationCodes = pgTable(
  "oauth_authorization_codes",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    codeHash: text("code_hash").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    redirectUri: text("redirect_uri").notNull(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeChallenge: text("code_challenge").notNull(),
    resource: text("resource"),
    scope: text("scope"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("oauth_auth_codes_code_hash_idx").on(table.codeHash),
    index("oauth_auth_codes_client_id_idx").on(table.clientId),
  ]
);

export const oauthRefreshTokens = pgTable(
  "oauth_refresh_tokens",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    familyId: uuid("family_id").notNull(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id, { onDelete: "cascade" }),
    resource: text("resource"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("oauth_refresh_tokens_token_hash_idx").on(table.tokenHash),
    index("oauth_refresh_tokens_family_id_idx").on(table.familyId),
  ]
);
