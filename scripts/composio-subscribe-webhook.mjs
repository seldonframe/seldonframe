#!/usr/bin/env node
// One-time platform setup: subscribe SeldonFrame's Composio webhook.
//
// Composio delivers inbound trigger events (new Gmail, new calendar event, …) to
// a single webhook URL per project. This script registers that subscription ONCE
// and prints the returned signing `secret` — copy it into Vercel (CRM project) as
// COMPOSIO_WEBHOOK_SECRET so the route can verify signatures.
//
// Usage (PowerShell):
//   $env:COMPOSIO_API_KEY = "ak_…"; node scripts/composio-subscribe-webhook.mjs
//
// Usage (bash):
//   COMPOSIO_API_KEY=ak_… node scripts/composio-subscribe-webhook.mjs
//
// Optional env:
//   COMPOSIO_WEBHOOK_URL   override the webhook URL
//                          (default https://app.seldonframe.com/api/webhooks/composio)
//   COMPOSIO_API_BASE      override the API base (default https://backend.composio.dev)
//
// It is SAFE to run more than once — Composio upserts the subscription. The
// printed secret is what the running app needs; it is NOT written anywhere by
// this script (no secrets touched on disk).

const apiKey = process.env.COMPOSIO_API_KEY;
if (!apiKey) {
  console.error(
    "ERROR: set COMPOSIO_API_KEY (the platform Composio key) before running.",
  );
  process.exit(1);
}

const webhookUrl =
  process.env.COMPOSIO_WEBHOOK_URL ??
  "https://app.seldonframe.com/api/webhooks/composio";
const apiBase = (process.env.COMPOSIO_API_BASE ?? "https://backend.composio.dev").replace(
  /\/+$/,
  "",
);

const endpoint = `${apiBase}/api/v3.1/webhook_subscriptions`;

const body = {
  webhook_url: webhookUrl,
  // The trigger-message stream — every subscribed trigger delivers here.
  enabled_events: ["composio.trigger.message"],
};

console.log(`Subscribing Composio webhook → ${webhookUrl}`);
console.log(`POST ${endpoint}`);

try {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!res.ok) {
    console.error(`\nFAILED (HTTP ${res.status}):`);
    console.error(text);
    process.exit(1);
  }

  // The signing secret is returned as `secret` (or nested under the created
  // subscription object, depending on API version) — surface whatever we find.
  const secret =
    json?.secret ??
    json?.data?.secret ??
    json?.webhook_subscription?.secret ??
    null;

  console.log("\n✓ Subscription created/updated.");
  if (secret) {
    console.log("\n=== COMPOSIO_WEBHOOK_SECRET (add this to Vercel — CRM project) ===");
    console.log(secret);
    console.log("================================================================\n");
  } else {
    console.log(
      "\nNOTE: couldn't find a `secret` field in the response — full body below.\n" +
        "Copy the signing secret from it into Vercel as COMPOSIO_WEBHOOK_SECRET:",
    );
    console.log(JSON.stringify(json ?? text, null, 2));
  }
} catch (err) {
  console.error("\nFAILED (network/error):");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
