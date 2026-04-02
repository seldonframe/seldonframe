import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { eq } from "drizzle-orm";

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

const authProviders = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  authProviders.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

const resendApiKey = process.env.AUTH_RESEND_KEY ?? process.env.RESEND_API_KEY;

if (resendApiKey) {
  authProviders.push(
    Resend({
      apiKey: resendApiKey,
      from: process.env.AUTH_RESEND_FROM ?? process.env.DEFAULT_FROM_EMAIL ?? "hello@seldonframe.local",
    })
  );
}

export const authConfig = {
  pages: {
    signIn: "/signup",
    verifyRequest: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: authProviders,
  callbacks: {
    jwt: async ({ token, user }) => {
      try {
        if (user) {
          console.log("[auth][jwt] user present in token, sub:", token.sub);
          token.orgId = (user as { orgId?: string }).orgId;
          token.role = (user as { role?: string }).role;
        }

        if (token.sub) {
          const [dbUser] = await db
            .select({
              id: users.id,
              orgId: users.orgId,
              role: users.role,
              planId: users.planId,
              subscriptionStatus: users.subscriptionStatus,
              billingPeriod: users.billingPeriod,
              trialEndsAt: users.trialEndsAt,
            })
            .from(users)
            .where(eq(users.id, token.sub))
            .limit(1);

          if (dbUser) {
            token.orgId = dbUser.orgId;
            token.role = dbUser.role;
            token.planId = dbUser.planId ?? null;
            token.subscriptionStatus = normalizeBillingStatus(dbUser.subscriptionStatus);
            token.billingPeriod = normalizeBillingPeriod(dbUser.billingPeriod);
            token.trialEndsAt = dbUser.trialEndsAt ? dbUser.trialEndsAt.toISOString() : null;

            const [org] = await db
              .select({ id: organizations.id, soulCompletedAt: organizations.soulCompletedAt })
              .from(organizations)
              .where(eq(organizations.id, dbUser.orgId))
              .limit(1);
            token.soulCompleted = Boolean(org?.soulCompletedAt);
          }
        }

        return token;
      } catch (err) {
        console.error("[auth][jwt] callback FAILED:", err);
        throw err;
      }
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
