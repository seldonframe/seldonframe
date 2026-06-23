// AP2 discovery document — advertises that this server speaks Google's Agent
// Payments Protocol and which settlement rails it supports.
//
//   GET /api/ap2/.well-known
//
// A buyer's agent reads this to learn the checkout endpoint, the supported
// mandate types, and the settlement method (x402). Static + public — no auth,
// no DB, no money. Mirrors the spirit of an MCP server's discovery surface.

import { NextResponse } from "next/server";

export const runtime = "nodejs";

function appBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://app.seldonframe.com").replace(/\/$/, "");
}

export async function GET() {
  return NextResponse.json({
    protocol: "ap2",
    version: "0.1",
    description:
      "SeldonFrame agent marketplace — AP2 (Agent Payments Protocol) checkout. " +
      "Verifies Intent/Cart/Payment mandates and settles via the x402 rail.",
    checkout_endpoint: `${appBase()}/api/ap2/checkout`,
    mandates: ["intent", "cart", "payment"],
    settlement: {
      // x402 is the wired settlement rail; card is a documented future method.
      methods: ["x402"],
      x402: {
        version: 1,
        // The actual on-chain settlement is gated exactly like the x402 rail —
        // inert until the facilitator is configured. Advertising support does
        // not imply live settlement.
        network: "base",
        asset: "USDC",
      },
    },
  });
}
