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
    authorized: (params) => {
      if (!params || !params.request) {
        return true;
      }

      return true;
    },
    jwt: async ({ token, user, account }) => {
      try {
        if (user) {
          console.log("[auth][jwt] user present in token, sub:", token.sub);
          token.orgId = (user as { orgId?: string }).orgId;
          token.role = (user as { role?: string }).role;
        }

        if (token.sub) {
          let [dbUser] = await db
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

          // v1.19 — self-healing JWT recovery. Why this exists:
          //
          //   The session strategy is JWT, so token.sub is what the page
          //   queries with. But token.sub can drift away from the real
          //   users.id row in three ways:
          //     1. createUser failed mid-flow (org created, users INSERT
          //        threw — user has a JWT but no users row)
          //     2. JWT was minted from a user that was later deleted +
          //        recreated with a new uuid (re-claim flows, manual
          //        ops cleanup)
          //     3. Cross-deployment JWT carry-over (rare in practice)
          //
          //   Without recovery: every page hits the v1.7.3 synthesized-
          //   empty-record path, dashboard renders an empty shell with
          //   no workspace, no plan, no surface for the user to take
          //   any meaningful action. They look "signed in" but every
          //   write 403s.
          //
          //   v1.19 fix: when token.sub doesn't resolve, fall back to
          //   email. If a users row with this email exists, re-anchor
          //   token.sub to that row's id silently. Log it so we can
          //   detect and root-cause the original drift in production.
          if (!dbUser && typeof token.email === "string" && token.email.length > 0) {
            const normalizedEmail = token.email.trim().toLowerCase();
            const [recovered] = await db
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
              .where(eq(users.email, normalizedEmail))
              .limit(1);
            if (recovered) {
              console.warn(
                `[auth][jwt] self_healed_token_sub: token.sub=${token.sub} did not resolve, recovered via email=${normalizedEmail.split("@")[1] ?? "(?)"} user_id=${recovered.id}`,
              );
              token.sub = recovered.id;
              dbUser = recovered;
            } else {
              console.warn(
                `[auth][jwt] orphan_token_no_email_match: token.sub=${token.sub} email_domain=${normalizedEmail.split("@")[1] ?? "(?)"} — user has a JWT but no users row by id OR email`,
              );
            }
          }

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
