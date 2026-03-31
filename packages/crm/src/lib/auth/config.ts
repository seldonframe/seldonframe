import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { z } from "zod";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const BILLING_STATUSES = ["trialing", "active", "past_due", "canceled", "unpaid"] as const;
const BILLING_PERIODS = ["monthly", "yearly"] as const;

function normalizeBillingStatus(value: string | null | undefined): (typeof BILLING_STATUSES)[number] {
  return BILLING_STATUSES.includes(value as (typeof BILLING_STATUSES)[number])
    ? (value as (typeof BILLING_STATUSES)[number])
    : "trialing";
}

function normalizeBillingPeriod(value: string | null | undefined): (typeof BILLING_PERIODS)[number] {
  return BILLING_PERIODS.includes(value as (typeof BILLING_PERIODS)[number])
    ? (value as (typeof BILLING_PERIODS)[number])
    : "monthly";
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const oauthProviders = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  oauthProviders.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  oauthProviders.push(
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    })
  );
}

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [
    ...oauthProviders,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const parsed = credentialsSchema.safeParse(credentials);

        if (!parsed.success) {
          return null;
        }

        const [user] = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            avatarUrl: users.avatarUrl,
            orgId: users.orgId,
            role: users.role,
            passwordHash: users.passwordHash,
          })
          .from(users)
          .where(eq(users.email, parsed.data.email))
          .limit(1);

        if (!user || !user.passwordHash) {
          return null;
        }

        const isValidPassword = await bcrypt.compare(parsed.data.password, user.passwordHash);

        if (!isValidPassword) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.avatarUrl,
          orgId: user.orgId,
          role: user.role,
          planId: null,
          subscriptionStatus: "trialing" as const,
          billingPeriod: "monthly" as const,
          trialEndsAt: null,
        };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.orgId = (user as { orgId?: string }).orgId;
        token.role = (user as { role?: string }).role;
      }

      if (token.sub) {
        const [dbUser] = await db
          .select({
            id: users.id,
            orgId: users.orgId,
            role: users.role,
          })
          .from(users)
          .where(eq(users.id, token.sub))
          .limit(1);

        if (dbUser) {
          token.orgId = dbUser.orgId;
          token.role = dbUser.role;
          token.planId = (token.planId as string | undefined) ?? null;
          token.subscriptionStatus = normalizeBillingStatus(token.subscriptionStatus as string | null | undefined);
          token.billingPeriod = normalizeBillingPeriod(token.billingPeriod as string | null | undefined);
          token.trialEndsAt = (token.trialEndsAt as string | undefined) ?? null;

          const [org] = await db
            .select({ id: organizations.id })
            .from(organizations)
            .where(eq(organizations.id, dbUser.orgId))
            .limit(1);
          token.soulCompleted = Boolean(org?.id);
        }
      }

      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.orgId = (token.orgId as string | undefined) ?? "";
        session.user.role = (token.role as string | undefined) ?? "member";
        session.user.soulCompleted = Boolean(token.soulCompleted);
        session.user.planId = (token.planId as string | undefined) ?? null;
        session.user.subscriptionStatus =
          (token.subscriptionStatus as "trialing" | "active" | "past_due" | "canceled" | "unpaid" | undefined) ?? "trialing";
        session.user.billingPeriod = (token.billingPeriod as "monthly" | "yearly" | undefined) ?? "monthly";
        session.user.trialEndsAt = (token.trialEndsAt as string | undefined) ?? null;
      }

      return session;
    },
  },
} satisfies NextAuthConfig;
