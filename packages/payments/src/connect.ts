import { stripeConnectTokenResponseSchema } from "./types";

const STRIPE_CONNECT_AUTHORIZE_URL = "https://connect.stripe.com/oauth/authorize";

export function buildStripeConnectUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
  if (!clientId) {
    throw new Error("Stripe Connect is not configured.");
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: "read_write",
    state,
    redirect_uri: redirectUri,
  });

  return `${STRIPE_CONNECT_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeStripeConnectCode(params: { code: string; secretKey: string }) {
  const response = await fetch("https://connect.stripe.com/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
    }),
  });

  if (!response.ok) {
    throw new Error("Stripe Connect token exchange failed");
  }

  const payload = await response.json();
  return stripeConnectTokenResponseSchema.parse(payload);
}
