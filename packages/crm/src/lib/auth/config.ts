import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { db } from "@/db";
import { accounts, organizations, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const BILLING_STATUSES = ["trialing", "active", "past_due", "canceled", "unpaid"] as const;
const BILLING_PERIODS = ["monthly", "yearly"] as const;
const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const resendApiKey = (process.env.AUTH_RESEND_KEY ?? process.env.RESEND_API_KEY)?.trim();
const resendFrom = (process.env.AUTH_RESEND_FROM ?? process.env.DEFAULT_FROM_EMAIL ?? "hello@seldonframe.local").trim();

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

const authProviders: NextAuthConfig["providers"] = [];

if (googleClientId && googleClientSecret) {
  authProviders.push(
    Google({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    })
  );
}

if (resendApiKey) {
  authProviders.push(
    Resend({
      apiKey: resendApiKey,
      from: resendFrom,
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
    jwt: async ({ token, user, account }) => {
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
              .select({ id: organizations.id, soulCompletedAt: organizations.soulCompletedAt, integrations: organizations.integrations, settings: organizations.settings })
              .from(organizations)
              .where(eq(organizations.id, dbUser.orgId))
              .limit(1);
            token.soulCompleted = Boolean(org?.soulCompletedAt);
            token.welcomeShown = Boolean((org?.settings as Record<string, unknown> | undefined)?.welcomeShown);

            if (account?.provider === "google" && org) {
              const [googleAccount] = await db
                .select({
                  accessToken: accounts.accessToken,
                  refreshToken: accounts.refreshToken,
                  expiresAt: accounts.expiresAt,
                  scope: accounts.scope,
                })
                .from(accounts)
                .where(and(eq(accounts.userId, dbUser.id), eq(accounts.provider, "google")))
                .limit(1);

              if (googleAccount) {
                const existingIntegrations = (org.integrations ?? {}) as Record<string, unknown>;
                const existingGoogle = (existingIntegrations.google ?? {}) as Record<string, unknown>;
                const hasCalendarScope = Boolean(googleAccount.scope?.includes("https://www.googleapis.com/auth/calendar"));

                const nextGoogle = {
                  ...existingGoogle,
                  calendarConnected: hasCalendarScope || Boolean(existingGoogle.calendarConnected),
                  connected: hasCalendarScope || Boolean(existingGoogle.connected),
                  accessToken: googleAccount.accessToken ?? String(existingGoogle.accessToken ?? ""),
                  refreshToken: googleAccount.refreshToken ?? String(existingGoogle.refreshToken ?? ""),
                  expiresAt: googleAccount.expiresAt ?? Number(existingGoogle.expiresAt ?? 0),
                  scope: googleAccount.scope ?? String(existingGoogle.scope ?? ""),
                };

                await db
                  .update(organizations)
                  .set({
                    integrations: {
                      ...existingIntegrations,
                      google: nextGoogle,
                    },
                    updatedAt: new Date(),
                  })
                  .where(eq(organizations.id, org.id));
              }
            }
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
        session.user.welcomeShown = Boolean(token.welcomeShown);
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
