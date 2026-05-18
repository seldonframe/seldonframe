// 2026-05-18 — Inbound SMS intent classifier (Slice 4).
//
// The plan's locked decision #2 says: auto-reply only for FAQ / pricing
// / scheduling intents; everything else lands in the operator's inbox
// unread. This file is a tiny one-shot LLM call that returns the
// intent label, with strict fallback to `null` so the webhook can fall
// back to the existing always-reply behavior on any failure.
//
// Karpathy frame: cheap router; the heavy lifting still happens in
// handleIncomingTurn for the auto-replyable intents. We don't try to
// be clever — three positive labels + an "other" bucket is enough for
// the operator-inbox cut.
//
// Reuses the operator's BYOK Anthropic via getAIClient so the LLM cost
// lives on their key (same posture as composeOutboundMessage).

import type Anthropic from "@anthropic-ai/sdk";
import { getAIClient } from "@/lib/ai/client";
import { logEvent } from "@/lib/observability/log";

export type InboundIntent = "faq" | "pricing" | "scheduling" | "other";

const ALLOWED: ReadonlySet<InboundIntent> = new Set([
  "faq",
  "pricing",
  "scheduling",
  "other",
]);

const SYSTEM_PROMPT =
  "You classify a single inbound customer SMS into one of four intent buckets for a small business. " +
  "Output EXACTLY one word — no punctuation, no explanation, no quotes. The four allowed words are: " +
  "faq, pricing, scheduling, other.\n\n" +
  "Guidance:\n" +
  "- faq = the customer is asking a general question about the business (hours, location, what we do, do we offer X).\n" +
  "- pricing = the customer is asking how much something costs, quote requests, payment questions.\n" +
  "- scheduling = the customer wants to book, reschedule, confirm, or cancel an appointment.\n" +
  "- other = complaints, compliments, ambiguous messages, opt-outs, anything else. When unsure, choose other.";

/**
 * Classify a customer's inbound SMS into one of four intent buckets.
 *
 * Returns `null` on any failure (LLM unreachable, malformed output,
 * timeout, etc.). The caller is expected to fall back to the existing
 * always-reply behavior when null is returned, so a failing classifier
 * does NOT break currently-working workspaces.
 *
 * The body is truncated to 1000 chars before calling the LLM so a
 * pasted essay doesn't run up the token bill — for SMS that's >6
 * segments and not realistic input anyway.
 */
export async function classifyInboundIntent(params: {
  orgId: string;
  body: string;
}): Promise<InboundIntent | null> {
  const trimmed = params.body.trim();
  if (!trimmed) return null;

  let client;
  try {
    const ai = await getAIClient({ orgId: params.orgId });
    client = ai.client;
  } catch (err) {
    logEvent("classify_intent_client_error", {
      org_id: params.orgId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
  if (!client) return null;

  const sample = trimmed.slice(0, 1000);

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 16,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: sample }],
    });

    const text = response.content
      .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim()
      .toLowerCase()
      // Strip trailing punctuation / quotes the model might add.
      .replace(/^["'`]+|["'`.!?]+$/g, "");

    if (ALLOWED.has(text as InboundIntent)) {
      return text as InboundIntent;
    }

    // The model returned something off-list. Try a coarse keyword
    // match before giving up so cases like "Pricing." (with a period)
    // or "FAQ:" don't degrade silently.
    for (const candidate of ALLOWED) {
      if (text.startsWith(candidate)) return candidate;
    }

    logEvent("classify_intent_unparseable", { org_id: params.orgId, raw: text.slice(0, 50) });
    return null;
  } catch (err) {
    logEvent("classify_intent_llm_error", {
      org_id: params.orgId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Whether the classifier result represents an intent the auto-reply
 * path should handle. Centralised so the webhook + future schedulers
 * stay in sync if the rules shift (e.g. add 'cancellation' later).
 */
export function shouldAutoReplyForIntent(intent: InboundIntent | null): boolean {
  if (intent === null) {
    // Failed classification → fall back to always-reply behavior so
    // we don't regress currently-working workspaces.
    return true;
  }
  return intent === "faq" || intent === "pricing" || intent === "scheduling";
}
