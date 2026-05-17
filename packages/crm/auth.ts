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
if (process.env.NEXTAUTH_URL) process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL.trim();
if (process.env.AUTH_URL) process.env.AUTH_URL = process.env.AUTH_URL.trim();
if (process.env.GOOGLE_CLIENT_ID) process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID.trim();
if (process.env.GOOGLE_CLIENT_SECRET) process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET.trim();

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
      const [org] = await db
        .insert(organizations)
        .values({
          name: params.name,
          slug,
        })
        .returning();

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
    try {
      console.log("[auth][adapter] createUser called for:", data.email);
      const email = data.email?.trim().toLowerCase();

      if (!email) {
        throw new Error("OAuth account is missing an email address.");
      }

      const defaultName = data.name?.trim() || email.split("@")[0] || "Owner";
      console.log("[auth][adapter] creating org for:", defaultName);
      const org = await createOrganizationForUser({ name: `${defaultName}'s Workspace` });

      if (!org) {
        throw new Error("Could not create organization for new account.");
      }

      console.log("[auth][adapter] org created:", org.id, "inserting user");
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

      console.log("[auth][adapter] user created:", created.id);

      try {
        await db.update(organizations).set({ ownerId: created.id }).where(eq(organizations.id, org.id));
      } catch (error) {
        const code = (error as { code?: string } | null)?.code;

        if (code !== "42703") {
          throw error;
        }
      }

      return created;
    } catch (err) {
      console.error("[auth][adapter] createUser FAILED:", err);
      throw err;
    }
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth({
  debug: true,
  trustHost: true,
  // 2026-05-17 — explicit cookie config to fix the PKCE-cookie-missing-on-
  // callback bug we hit repeatedly on prod Google OAuth.
  //
  // Symptom: NextAuth set `__Secure-authjs.pkce.code_verifier` on the
  // /signin/google POST (log event 19: CREATE_PKCECODEVERIFIER), then
  // the cookie was NOT sent back on the /callback/google GET (event 11:
  // present:false) → "pkceCodeVerifier value could not be parsed" →
  // /api/auth/error?error=Configuration. Setting AUTH_URL didn't fix it.
  //
  // Hypothesis: the __Secure- prefix is enforced strictly by some
  // browser configurations during cross-site OAuth callbacks. Even though
  // we're on HTTPS and the Secure flag is set, the cookie gets dropped
  // somewhere in the round trip. Removing the __Secure- prefix
  // (cookie name `authjs.pkce.code_verifier`) keeps all other security
  // properties (httpOnly + sameSite=lax + secure=true) intact but
  // removes the browser-level prefix-enforcement layer that's breaking us.
  //
  // Lax SameSite is still correct for the OAuth callback (top-level
  // navigation from accounts.google.com → app.seldonframe.com). The
  // state cookie gets the same treatment for consistency.
  cookies: {
    pkceCodeVerifier: {
      name: "authjs.pkce.code_verifier",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: true,
        maxAge: 60 * 15,
      },
    },
    state: {
      name: "authjs.state",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: true,
        maxAge: 60 * 15,
      },
    },
  },
  logger: {
    error(code, ...message) {
      console.error("[auth][logger][error]", code, ...message);
    },
    warn(code, ...message) {
      console.warn("[auth][logger][warn]", code, ...message);
    },
    debug(code, ...message) {
      console.log("[auth][logger][debug]", code, ...message);
    },
  },
  adapter,
  ...authConfig,
});
