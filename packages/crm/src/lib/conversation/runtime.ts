import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  contacts,
  conversationTurns,
  conversations,
  organizations,
} from "@/db/schema";
import { getAIClient } from "@/lib/ai/client";
import { emitSeldonEvent } from "@/lib/events/bus";
import type { OrgSoul } from "@/lib/soul/types";

// The Conversation Primitive runtime is channel-agnostic: email in Phase 3,
// SMS in Phase 4 (and chat widget later) all route through this module.
// Only the transport adapter changes; the reasoning layer, persistence
// model, and event vocabulary are shared.

export type ConversationChannel = "email" | "sms";

export type ConversationTurnRow = {
  id: string;
  direction: "inbound" | "outbound";
  channel: ConversationChannel;
  content: string;
  createdAt: Date;
};

export type RuntimeInput = {
  orgId: string;
  contactId: string;
  channel: ConversationChannel;
  incomingMessage: string;
  conversationId?: string | null;
  subject?: string | null;
  emailId?: string | null;
  smsMessageId?: string | null;
  metadata?: Record<string, unknown>;
};

export type RuntimeResult = {
  conversationId: string;
  inboundTurnId: string;
  outboundTurnId: string | null;
  responseText: string | null;
  skipped?: {
    reason: "no_ai_client" | "claude_error";
    detail?: string;
  };
};

const MAX_HISTORY_TURNS = 20;
const RESPONSE_MAX_TOKENS = 1024;

async function loadSoul(orgId: string): Promise<OrgSoul | null> {
  const [row] = await db
    .select({ soul: organizations.soul })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return (row?.soul as OrgSoul | null) ?? null;
}

async function loadContact(orgId: string, contactId: string) {
  const [row] = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      status: contacts.status,
    })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
    .limit(1);
  return row ?? null;
}

async function loadOrCreateConversation(params: {
  orgId: string;
  contactId: string;
  channel: ConversationChannel;
  conversationId: string | null;
  subject: string | null;
}) {
  if (params.conversationId) {
    const [row] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.orgId, params.orgId), eq(conversations.id, params.conversationId)))
      .limit(1);
    if (row) return row;
  }

  // Reuse the most recent active conversation for (contact, channel) when
  // no explicit id is supplied — prevents thread fragmentation on email
  // replies where we don't have a header to correlate.
  const [active] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.orgId, params.orgId),
        eq(conversations.contactId, params.contactId),
        eq(conversations.channel, params.channel),
        eq(conversations.status, "active")
      )
    )
    .orderBy(desc(conversations.lastTurnAt))
    .limit(1);
  if (active) return active;

  const [created] = await db
    .insert(conversations)
    .values({
      orgId: params.orgId,
      contactId: params.contactId,
      channel: params.channel,
      status: "active",
      subject: params.subject ?? null,
    })
    .returning();

  if (!created) {
    throw new Error("Could not create conversation row");
  }
  return created;
}

async function loadRecentTurns(orgId: string, conversationId: string): Promise<ConversationTurnRow[]> {
  const rows = await db
    .select({
      id: conversationTurns.id,
      direction: conversationTurns.direction,
      channel: conversationTurns.channel,
      content: conversationTurns.content,
      createdAt: conversationTurns.createdAt,
    })
    .from(conversationTurns)
    .where(and(eq(conversationTurns.orgId, orgId), eq(conversationTurns.conversationId, conversationId)))
    .orderBy(asc(conversationTurns.createdAt))
    .limit(MAX_HISTORY_TURNS);

  return rows.map((row) => ({
    id: row.id,
    direction: row.direction as "inbound" | "outbound",
    channel: row.channel as ConversationChannel,
    content: row.content,
    createdAt: row.createdAt,
  }));
}

function buildSystemPrompt(params: {
  soul: OrgSoul | null;
  channel: ConversationChannel;
  contact: { firstName: string | null; lastName: string | null; email: string | null; status: string | null };
}) {
  const soul = params.soul ?? {};
  const businessType = (soul as Record<string, unknown>).businessType ?? (soul as Record<string, unknown>).business_type ?? "a small business";
  const tone = (soul as Record<string, unknown>).tone ?? "helpful and concise";
  const mission = (soul as Record<string, unknown>).mission ?? "";
  const offer = (soul as Record<string, unknown>).offer ?? "";
  const name = [params.contact.firstName, params.contact.lastName].filter(Boolean).join(" ") || "the contact";

  const channelGuidance =
    params.channel === "sms"
      ? "Keep replies under 320 characters. No subject line. Plain text. Use the person's first name only if it reads naturally."
      : "Keep replies under 150 words. Plain text — the transport will style it. One clear ask per reply.";

  return [
    `You are an assistant working on behalf of ${businessType}.`,
    mission ? `Mission: ${mission}` : "",
    offer ? `Offer: ${offer}` : "",
    `Tone: ${tone}`,
    `You are conversing with ${name} via ${params.channel}.`,
    `Contact status: ${params.contact.status ?? "lead"}.`,
    channelGuidance,
    "Never invent appointment times, prices, or guarantees not provided in the conversation. If you don't know, say you'll check and get back to them.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function toAnthropicMessages(turns: ConversationTurnRow[], incoming: string) {
  const history = turns.map((turn) => ({
    role: (turn.direction === "inbound" ? "user" : "assistant") as "user" | "assistant",
    content: turn.content,
  }));
  // Guarantee the final message is the new incoming turn even if the
  // same turn was already persisted by the caller — we de-dupe by
  // collapsing adjacent user messages.
  const last = history.at(-1);
  if (last?.role === "user" && last.content === incoming) {
    return history;
  }
  return [...history, { role: "user" as const, content: incoming }];
}

async function generateResponse(params: {
  orgId: string;
  systemPrompt: string;
  turns: ConversationTurnRow[];
  incoming: string;
}): Promise<{ text: string | null; skipped?: RuntimeResult["skipped"]; usage?: { inputTokens: number; outputTokens: number; model: string; mode: string } }> {
  const resolution = await getAIClient({ orgId: params.orgId });
  if (!resolution.client) {
    return { text: null, skipped: { reason: "no_ai_client" } };
  }

  try {
    const response = await resolution.client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: RESPONSE_MAX_TOKENS,
      system: params.systemPrompt,
      messages: toAnthropicMessages(params.turns, params.incoming),
    });

    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();

    return {
      text: text || null,
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        model: response.model,
        mode: resolution.mode,
      },
    };
  } catch (error) {
    return {
      text: null,
      skipped: {
        reason: "claude_error",
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function handleIncomingTurn(input: RuntimeInput): Promise<RuntimeResult> {
  const contact = await loadContact(input.orgId, input.contactId);
  if (!contact) {
    throw new Error("Contact not found");
  }

  const conversation = await loadOrCreateConversation({
    orgId: input.orgId,
    contactId: input.contactId,
    channel: input.channel,
    conversationId: input.conversationId ?? null,
    subject: input.subject ?? null,
  });

  const now = new Date();

  const [inboundTurn] = await db
    .insert(conversationTurns)
    .values({
      orgId: input.orgId,
      conversationId: conversation.id,
      direction: "inbound",
      channel: input.channel,
      content: input.incomingMessage,
      emailId: input.emailId ?? null,
      smsMessageId: input.smsMessageId ?? null,
      metadata: input.metadata ?? {},
    })
    .returning({ id: conversationTurns.id });

  if (!inboundTurn) {
    throw new Error("Could not persist inbound turn");
  }

  await db
    .update(conversations)
    .set({ lastTurnAt: now, updatedAt: now })
    .where(eq(conversations.id, conversation.id));

  await emitSeldonEvent("conversation.turn.received", {
    conversationId: conversation.id,
    turnId: inboundTurn.id,
    contactId: input.contactId,
    channel: input.channel,
  });

  const priorTurns = await loadRecentTurns(input.orgId, conversation.id);
  const soul = await loadSoul(input.orgId);
  const systemPrompt = buildSystemPrompt({ soul, channel: input.channel, contact });

  const generation = await generateResponse({
    orgId: input.orgId,
    systemPrompt,
    turns: priorTurns,
    incoming: input.incomingMessage,
  });

  if (!generation.text) {
    return {
      conversationId: conversation.id,
      inboundTurnId: inboundTurn.id,
      outboundTurnId: null,
      responseText: null,
      skipped: generation.skipped,
    };
  }

  const outboundNow = new Date();
  const [outboundTurn] = await db
    .insert(conversationTurns)
    .values({
      orgId: input.orgId,
      conversationId: conversation.id,
      direction: "outbound",
      channel: input.channel,
      content: generation.text,
      metadata: {
        generator: "conversation.runtime",
        model: generation.usage?.model ?? null,
      },
    })
    .returning({ id: conversationTurns.id });

  if (!outboundTurn) {
    throw new Error("Could not persist outbound turn");
  }

  await db
    .update(conversations)
    .set({ lastTurnAt: outboundNow, updatedAt: outboundNow })
    .where(eq(conversations.id, conversation.id));

  await emitSeldonEvent("conversation.turn.sent", {
    conversationId: conversation.id,
    turnId: outboundTurn.id,
    contactId: input.contactId,
    channel: input.channel,
  });

  // Usage tracking for runtime-triggered turns is skipped — seldon_usage
  // requires a user_id FK and runtime-triggered conversations have no
  // interactive user. Revisit when a service-user pattern is available.

  return {
    conversationId: conversation.id,
    inboundTurnId: inboundTurn.id,
    outboundTurnId: outboundTurn.id,
    responseText: generation.text,
  };
}

export async function listConversationTurns(orgId: string, conversationId: string) {
  return loadRecentTurns(orgId, conversationId);
}

export async function listConversationsForContact(orgId: string, contactId: string) {
  return db
    .select()
    .from(conversations)
    .where(and(eq(conversations.orgId, orgId), eq(conversations.contactId, contactId)))
    .orderBy(desc(conversations.lastTurnAt));
}
