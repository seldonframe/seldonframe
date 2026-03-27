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
