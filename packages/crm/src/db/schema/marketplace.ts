import { sql } from "drizzle-orm";
import { index, integer, jsonb, numeric, pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export const marketplaceBlocks = pgTable(
  "marketplace_blocks",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    blockId: text("block_id").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    longDescription: text("long_description"),
    icon: text("icon").notNull(),
    category: text("category").notNull(),
    previewImages: jsonb("preview_images").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    sellerId: uuid("seller_id").references(() => users.id, { onDelete: "set null" }),
    sellerName: text("seller_name").notNull(),
    sellerStripeAccountId: text("seller_stripe_account_id"),
    price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("usd"),
    blockMd: text("block_md").notNull(),
    generationStatus: text("generation_status").notNull().default("pending"),
    installCount: integer("install_count").notNull().default(0),
    ratingAverage: numeric("rating_average", { precision: 2, scale: 1 }),
    ratingCount: integer("rating_count").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("marketplace_blocks_status_idx").on(table.generationStatus),
    index("marketplace_blocks_category_idx").on(table.category),
    index("marketplace_blocks_seller_idx").on(table.sellerId),
  ]
);

export const generatedBlocks = pgTable(
  "generated_blocks",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    blockId: text("block_id").notNull().references(() => marketplaceBlocks.blockId, { onDelete: "cascade" }),
    sellerOrgId: uuid("seller_org_id").references(() => organizations.id, { onDelete: "cascade" }),
    files: jsonb("files")
      .$type<Array<{ path: string; content: string }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: text("status").notNull().default("generated"),
    reviewNotes: text("review_notes"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    mergedAt: timestamp("merged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("generated_blocks_block_uidx").on(table.blockId),
    index("generated_blocks_status_idx").on(table.status),
  ]
);

export const blockPurchases = pgTable(
  "block_purchases",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    blockId: text("block_id").notNull().references(() => marketplaceBlocks.blockId, { onDelete: "cascade" }),
    stripePaymentId: text("stripe_payment_id"),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("block_purchases_org_block_payment_uidx").on(table.orgId, table.blockId, table.stripePaymentId),
    index("block_purchases_org_idx").on(table.orgId),
  ]
);

export const blockRatings = pgTable(
  "block_ratings",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    blockId: text("block_id").notNull().references(() => marketplaceBlocks.blockId, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    review: text("review"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("block_ratings_block_user_uidx").on(table.blockId, table.userId),
    index("block_ratings_block_idx").on(table.blockId),
  ]
);
