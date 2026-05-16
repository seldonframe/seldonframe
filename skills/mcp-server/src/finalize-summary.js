// v1.55.0 — Standalone builder for the finalize_workspace operator summary.
// Extracted from tools.js so we can unit-test the string-building logic
// in isolation (no MCP server boot, no HTTP shims, no snapshot fetcher).
//
// The handler in tools.js fetches the snapshot, computes duration, and
// passes the result here. This file just builds the string.

/**
 * @param {object} args
 * @param {object} args.snapshot — workspace snapshot from
 *   /api/v1/workspace/<id>/snapshot. Must include: workspace.name,
 *   public_urls.{home,book,intake}, chatbot (or null), ops_stack,
 *   available_automations, tier.
 * @param {number} args.durationSec — total workspace creation time.
 * @param {string|null} args.aestheticArchetype — workspace's classified
 *   archetype (from snapshot.theme.aestheticArchetype). Used in the
 *   closing landing-page nudge.
 * @returns {string} the formatted operator summary
 */
export function buildFinalizeSummary({ snapshot, durationSec, aestheticArchetype }) {
  const ws = snapshot.workspace ?? {};
  const businessName = ws.name ?? "Your workspace";
  const chatbot = snapshot.chatbot ?? null;
  const opsStack = snapshot.ops_stack ?? {};
  const automations = snapshot.available_automations ?? [];
  const tier = snapshot.tier ?? {};
  const tierLabel = tier.current_tier_label ?? "Free";
  const isPaid = tier.current_tier === "growth" || tier.current_tier === "scale";

  // Extract client domain from the operator's input (the URL they scraped).
  // We store it on workspace.settings.source_url upstream; fall back to
  // the public preview URL host if unavailable.
  const clientDomain =
    (ws.settings && typeof ws.settings.source_url === "string"
      ? new URL(ws.settings.source_url).host
      : null) ?? "your client's site";

  const lines = [];

  // Header
  lines.push(`✅ Client ops stack ready for ${businessName}. (${durationSec} seconds)`);
  lines.push("");

  // Chatbot embed snippet (the magic moment — paste on client's existing site)
  if (chatbot && chatbot.embed_snippet) {
    lines.push(`📞 AI receptionist — paste before </body> on ${clientDomain} to go live:`);
    lines.push(chatbot.embed_snippet);
    lines.push("");
    lines.push(`🤖 Demo for your client: ${chatbot.preview_url ?? snapshot.public_urls?.home ?? ""}`);
    lines.push(`   (Chatbot live in TEST mode — share so your client can try it before pasting)`);
  } else {
    lines.push(`🤖 AI chatbot — scaffold pending. Retry:`);
    lines.push(`   create_agent({ archetype: "website-chatbot", channel: "web_chat" })`);
  }
  lines.push("");

  // Ops stack URLs
  lines.push(`📅 Booking: ${opsStack.booking_url ?? snapshot.public_urls?.book ?? ""}`);
  lines.push(`📝 Intake:  ${opsStack.intake_url ?? snapshot.public_urls?.intake ?? ""}`);
  lines.push(`🔧 Admin:   ${opsStack.admin_url ?? ""}`);
  lines.push("");

  // 7-automation callout
  if (automations.length > 0) {
    lines.push(`⚡ ${automations.length} more automations ready to deploy for this client:`);
    const descriptions = {
      "speed-to-lead": "text the lead within 30 sec of intake submission",
      "missed-call-text-back": "auto-SMS when their phone goes unanswered",
      "review-requester": "ask for a 5★ after every completed booking",
      "appointment-confirm-sms": "reduce no-shows automatically",
      "weather-aware-booking": "reschedule outdoor jobs when rain is forecast",
      "daily-digest": "morning summary of yesterday's activity",
      "win-back": "re-engage cancelled subscribers with a time-limited code",
    };
    for (const a of automations) {
      const desc = descriptions[a.id] ?? "";
      lines.push(`   • ${a.name}${desc ? " — " + desc : ""}`);
    }
    lines.push(`   Activate any: ${opsStack.automations_url ?? ""}`);
    lines.push(
      `   (Need API keys for SMS/email? Just ask — Claude will walk you through`,
    );
    lines.push(`    Twilio / Resend / Stripe setup when an automation needs one.)`);
    lines.push("");
  }

  // Tier + client portal
  const tierUpsell = isPaid
    ? "white-label + reseller pricing on Scale ($99/mo)"
    : "Upgrade $9/mo for unlimited workspaces";
  const clientPortalUrl = tier.client_portal_url ?? "";
  lines.push(
    `💼 Tier: ${tierLabel}  ·  ${tierUpsell}` +
      (clientPortalUrl ? `  ·  Client portal: ${clientPortalUrl}` : ""),
  );
  lines.push("");

  // v1.55.x — derive appHost for the LLM-settings + client-portal links.
  // SELDONFRAME_APP_BASE wins when set (white-label/staging); falls back
  // to https://app.seldonframe.com. Trailing slash stripped to match the
  // pattern used by v2/complete when building ops_stack.automations_url.
  const appHost = (
    process.env.SELDONFRAME_APP_BASE ?? "https://app.seldonframe.com"
  ).replace(/\/$/, "");

  // LLM key clarity — operators kept asking "which key is the chatbot
  // using?" + had no recovery path when llm_credit_exhausted fired.
  lines.push(
    `🔑 Chatbot LLM key: uses your Claude Code key by default. Change at ${appHost}/settings/integrations/llm.`,
  );
  lines.push(
    `   (If you see "llm_credit_exhausted", top up at console.anthropic.com/settings/billing.)`,
  );
  lines.push("");

  // v1.55.x — Client portal demo callout. Closes the demo loop:
  // chatbot (above) → booking → CRM → portal demo for the client.
  // Slug is required; skip gracefully if absent (shouldn't happen in
  // practice but the snapshot can theoretically lack it).
  //
  // The /demo URL is a one-click deep link: workspace creation seeds
  // a "Demo Customer" contact + sample upcoming appointment + welcome
  // message, and visiting /customer/<slug>/demo auto-establishes a
  // portal session for that contact — no email, no magic link. The
  // operator can paste this URL to a prospect and they land directly
  // in a populated portal instead of a magic-link form with empty
  // tabs. Demo data is filtered out of operator-facing CRM / pipeline
  // / analytics by tag, so it stays isolated from real customer data.
  const slug = ws.slug ?? "";
  if (slug) {
    const portalUrl = `${appHost}/customer/${slug}/demo`;
    lines.push(`🎬 Demo the client portal (one-click, no login):`);
    lines.push(`   ${portalUrl}`);
    lines.push(
      `   Share this link with the prospect — opens directly as "Demo Customer" with a`,
    );
    lines.push(
      `   sample appointment and welcome message. Demo data stays isolated from your`,
    );
    lines.push(`   real CRM and pipelines.`);
    lines.push(
      `   Free tier shows the portal with SeldonFrame branding. Growth ($29/mo) unlocks custom domain + the agency's logo.`,
    );
    lines.push("");
  }

  // Landing-page nudge (closing)
  const archetypeClause = aestheticArchetype ? ` in ${aestheticArchetype} style` : "";
  lines.push(
    `Want a landing page too? Just ask: "build a landing page for ${businessName}${archetypeClause}"`,
  );
  lines.push(
    `— Claude will use the landing-page-creation skill to generate one${aestheticArchetype ? " with the archetype voice" : ""}.`,
  );

  return lines.join("\n");
}
