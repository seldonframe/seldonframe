import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      orgId: string;
      role: string;
      soulCompleted?: boolean;
      welcomeShown?: boolean;
      planId?: string | null;
      subscriptionStatus?: "trialing" | "active" | "past_due" | "canceled" | "unpaid";
      billingPeriod?: "monthly" | "yearly";
      trialEndsAt?: string | null;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    orgId?: string;
    role?: string;
    soulCompleted?: boolean;
    welcomeShown?: boolean;
    planId?: string | null;
    subscriptionStatus?: "trialing" | "active" | "past_due" | "canceled" | "unpaid";
    billingPeriod?: "monthly" | "yearly";
    trialEndsAt?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    orgId?: string;
    role?: string;
    soulCompleted?: boolean;
    welcomeShown?: boolean;
    planId?: string | null;
    subscriptionStatus?: "trialing" | "active" | "past_due" | "canceled" | "unpaid";
    billingPeriod?: "monthly" | "yearly";
    trialEndsAt?: string | null;
  }
}
