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

/**
 * Render the SeldonFrame-branded sign-in email. Inline styles because email
 * clients (Gmail, Outlook, Apple Mail) strip <style> blocks and ignore most
 * CSS classes. Width capped at 560px for desktop comfort; mobile clients
 * shrink-to-fit. Dark-mode friendly colors via a wash that reads as ink on
 * both light + dark client backgrounds.
 *
 * Wordmark URL points at the production public asset. NEXTAUTH_URL gives us
 * the right host (app.seldonframe.com in prod, localhost in dev).
 */
function renderSeldonFrameSignInEmail({
  url,
  baseUrl,
}: {
  url: string;
  baseUrl: string;
}): { subject: string; html: string; text: string } {
  const wordmark = `${baseUrl}/brand/seldonframe-wordmark.svg`;
  const primary = "#14b8a6"; // matches --primary teal in the design system
  const ink = "#0a0e1a";
  const bg = "#f6f7f9";
  const muted = "#6b7280";

  const subject = "Your SeldonFrame sign-in link";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:${bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${ink};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${bg};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;">
          <tr>
            <td style="padding:32px 32px 16px 32px;text-align:center;">
              <img src="${wordmark}" alt="SeldonFrame" width="180" height="36" style="display:inline-block;height:36px;width:auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 0 32px;text-align:center;">
              <h1 style="margin:0;font-size:24px;line-height:1.3;font-weight:600;color:${ink};letter-spacing:-0.01em;">Sign in to SeldonFrame</h1>
              <p style="margin:12px 0 0 0;font-size:15px;line-height:1.5;color:${muted};">
                Click the button below to sign in. This link is valid for 15 minutes and works once.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px 32px;text-align:center;">
              <a href="${url}" style="display:inline-block;background:${primary};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 32px;border-radius:10px;line-height:1;">
                Sign in to SeldonFrame
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 0 32px;text-align:center;">
              <p style="margin:0;font-size:13px;line-height:1.5;color:${muted};">
                Button not working? Copy and paste this link into your browser:
              </p>
              <p style="margin:8px 0 0 0;font-size:12px;line-height:1.4;color:${muted};word-break:break-all;">
                <a href="${url}" style="color:${primary};text-decoration:underline;">${url}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 32px 32px;border-top:1px solid #f1f3f5;margin-top:24px;text-align:center;">
              <p style="margin:24px 0 0 0;font-size:12px;line-height:1.5;color:${muted};">
                If you didn't request this email, you can safely ignore it.<br />
                Questions? Reply to this email or visit <a href="${baseUrl.replace("app.", "")}" style="color:${primary};text-decoration:underline;">seldonframe.com</a>.
              </p>
              <p style="margin:16px 0 0 0;font-size:11px;color:${muted};">
                The open-source Business OS your agency builds for clients in 60 seconds.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Sign in to SeldonFrame

Click this link to sign in (valid for 15 minutes, single use):

${url}

If you didn't request this email, you can safely ignore it.

— The SeldonFrame team
seldonframe.com`;

  return { subject, html, text };
}

if (resendApiKey) {
  authProviders.push(
    Resend({
      apiKey: resendApiKey,
      from: resendFrom,
      // Override the default NextAuth Resend email with a SeldonFrame-branded
      // template. The default ships a generic "Sign in" button with no brand
      // context — on a fresh signup the recipient sees a blue blob from a
      // domain they may not recognize, which trips spam filters and erodes
      // trust on the very first touchpoint.
      async sendVerificationRequest({ identifier, url, provider }) {
        const baseUrl = (
          process.env.NEXTAUTH_URL?.trim() || "https://app.seldonframe.com"
        ).replace(/\/+$/, "");
        const { subject, html, text } = renderSeldonFrameSignInEmail({ url, baseUrl });

        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: provider.from,
            to: identifier,
            subject,
            html,
            text,
          }),
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => "<no-body>");
          throw new Error(
            `Failed to send sign-in email (${response.status}): ${detail.slice(0, 200)}`,
          );
        }
      },
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
