import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { authConfig } from "@/lib/auth/config";

// Sanitize env vars — Vercel stored them with trailing CR+LF bytes
if (process.env.AUTH_SECRET) process.env.AUTH_SECRET = process.env.AUTH_SECRET.trim();
if (process.env.NEXTAUTH_SECRET) process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET.trim();
if (process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.DATABASE_URL.trim();

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 48);
}

async function createOrganizationForUser(params: { name: string }) {
  const baseSlug = slugify(params.name) || "workspace";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0");
    const slug = `${baseSlug}-${suffix}`;

    try {
      let org: (typeof organizations.$inferSelect) | undefined;

      try {
        [org] = await db
          .insert(organizations)
          .values({
            name: params.name,
            slug,
            ownerId: "",
          })
          .returning();
      } catch (error) {
        const code = (error as { code?: string } | null)?.code;

        if (code !== "42703") {
          throw error;
        }

        [org] = await db
          .insert(organizations)
          .values({
            name: params.name,
            slug,
          })
          .returning();
      }

      if (org) {
        return org;
      }
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;

      if (code === "23505") {
        continue;
      }

      throw error;
    }
  }

  return null;
}

const authUsersTable = pgTable("users", {
  id: uuid("id").primaryKey(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("avatar_url"),
  orgId: uuid("org_id").notNull(),
  role: text("role").notNull().default("member"),
});

const authAccountsTable = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsersTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [primaryKey({ columns: [table.provider, table.providerAccountId] })]
);

const authSessionsTable = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsersTable.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

const authVerificationTokensTable = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })]
);

const baseAdapter = DrizzleAdapter(db, {
  usersTable: authUsersTable,
  accountsTable: authAccountsTable,
  sessionsTable: authSessionsTable,
  verificationTokensTable: authVerificationTokensTable,
});

const adapter = {
  ...baseAdapter,
  async createUser(data: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    emailVerified?: Date | null;
  }) {
    const email = data.email?.trim().toLowerCase();

    if (!email) {
      throw new Error("OAuth account is missing an email address.");
    }

    const defaultName = data.name?.trim() || email.split("@")[0] || "Owner";
    const org = await createOrganizationForUser({ name: `${defaultName}'s Workspace` });

    if (!org) {
      throw new Error("Could not create organization for new account.");
    }

    const [created] = await db
      .insert(users)
      .values({
        orgId: org.id,
        role: "owner",
        name: defaultName,
        email,
        avatarUrl: data.image ?? null,
        emailVerified: data.emailVerified ?? null,
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        emailVerified: users.emailVerified,
        image: users.avatarUrl,
      });

    if (!created) {
      throw new Error("Could not create user for new account.");
    }

    try {
      await db.update(organizations).set({ ownerId: created.id }).where(eq(organizations.id, org.id));
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;

      if (code !== "42703") {
        throw error;
      }
    }

    return created;
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth({
  debug: true,
  trustHost: true,
  adapter,
  ...authConfig,
});
