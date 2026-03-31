import { NextResponse } from "next/server";

type BillingStatus = "trialing" | "active" | "past_due" | "canceled" | "unpaid";

type BillingUser = {
  planId?: string | null;
  subscriptionStatus?: BillingStatus;
  trialEndsAt?: string | null;
};

type PlanGateInput = {
  request: Request;
  pathname: string;
  user: BillingUser;
  isAuthenticated: boolean;
};

type PlanGateResult = {
  response: NextResponse | null;
  readOnly: boolean;
  billingStatus: BillingStatus;
};

function isSelfHostedMode() {
  return !process.env.STRIPE_SECRET_KEY;
}

function isBillingExemptPath(pathname: string) {
  return (
    pathname === "/pricing" ||
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/api/webhooks/stripe-billing" ||
    pathname.startsWith("/api/auth")
  );
}

function isWriteMethod(method: string) {
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}

function hasTrialExpired(trialEndsAt: string | null | undefined) {
  if (!trialEndsAt) {
    return false;
  }

  const trialEndMs = Date.parse(trialEndsAt);

  if (!Number.isFinite(trialEndMs)) {
    return false;
  }

  return Date.now() > trialEndMs;
}

export function enforcePlanGate(input: PlanGateInput): PlanGateResult {
  const { request, pathname, user, isAuthenticated } = input;

  if (!isAuthenticated || isSelfHostedMode() || isBillingExemptPath(pathname)) {
    return { response: null, readOnly: false, billingStatus: "active" };
  }

  const billingStatus = user.subscriptionStatus ?? "trialing";
  const writeMethod = isWriteMethod(request.method);

  if (!user.planId) {
    return {
      response: NextResponse.redirect(new URL("/pricing", request.url)),
      readOnly: false,
      billingStatus,
    };
  }

  if (billingStatus === "trialing" && hasTrialExpired(user.trialEndsAt)) {
    return {
      response: NextResponse.redirect(new URL("/pricing?trialExpired=1", request.url)),
      readOnly: false,
      billingStatus,
    };
  }

  if (billingStatus === "canceled") {
    if (writeMethod) {
      if (pathname.startsWith("/api/")) {
        return {
          response: NextResponse.json({ error: "Subscription canceled. CRM is in read-only mode." }, { status: 402 }),
          readOnly: true,
          billingStatus,
        };
      }

      return {
        response: NextResponse.redirect(new URL("/settings/billing?readonly=1", request.url)),
        readOnly: true,
        billingStatus,
      };
    }

    return { response: null, readOnly: true, billingStatus };
  }

  return { response: null, readOnly: false, billingStatus };
}
