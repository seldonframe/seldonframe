// Email block — tool schemas (Scope 3 Step 2b.2 block 2 — Email).
//
// Zod-authored schemas for the 7 Email MCP tools. Source of truth for
// the tool surface; the emit step (PR 1 C6) calls z.toJSONSchema() on
// each and renders JSON-Schema into email.block.md on next
// `pnpm emit:blocks`.
//
// 7 tools total (matches skills/mcp-server/src/tools.js lines
// 1280-1413 + 1968-1998):
//   Transactional email (3):  send_email, list_emails, get_email
//   Suppressions (3):         list_suppressions, suppress_email,
//                             unsuppress_email
//   Conversation primitive (1): send_conversation_turn
//
// Conversation Primitive note (per Max's Email-migration directive):
// `send_conversation_turn` is shared between Email and SMS blocks —
// the underlying runtime at lib/conversation/runtime.ts is channel-
// agnostic and routes via the `channel: email|sms` arg. In the v2
// tool registry (Map<string, ToolDefinition>), tool names are globally
// unique, so the schema lives on exactly one block. Email gets it
// because Email migrates first; SMS's tools.ts will NOT re-declare
// it. Both blocks still declare conversation.turn.received/sent in
// their `produces` lists — that's correct semantics, because both
// channels can produce conversation events even though only one
// block ships the tool. If a future change requires the Conversation
// Primitive's TYPES (ConversationExit / Predicate / ExtractField in
// lib/agents/types.ts) to shift, that's a separate concern from
// where the tool lives — and Max's directive says stop + flag on
// any such type change.

import { z } from "zod";

import type { ToolDefinition } from "../lib/blocks/contract-v2";

// ---------------------------------------------------------------------
// Shared primitives — reused across the 7 tool schemas.
// ---------------------------------------------------------------------

const workspaceIdArg = z
  .string()
  .uuid()
  .optional()
  .describe("Optional. Falls back to the active workspace.");

const emailStatus = z.enum(["queued", "sent", "delivered", "opened", "clicked", "bounced", "replied", "failed"]);

const suppressionReason = z.enum(["manual", "unsubscribe", "bounce", "complaint"]);

// ---------------------------------------------------------------------
// Return shapes — narrow to fields downstream {{interpolation}} is
// most likely to reach for. Provider-side event history (opens /
// clicks / bounces timestamps) captured by EmailProviderEvent so
// reminder agents can check delivery status before following up.
// ---------------------------------------------------------------------

const EmailRecord = z.object({
  id: z.string().uuid(),
  contactId: z.string().uuid().nullable(),
  to: z.string().email(),
  subject: z.string(),
  body: z.string(),
  status: emailStatus,
  provider: z.string(),
  providerMessageId: z.string().nullable(),
  sentAt: z.string().datetime().nullable(),
  deliveredAt: z.string().datetime().nullable(),
  openedAt: z.string().datetime().nullable(),
  clickedAt: z.string().datetime().nullable(),
  bouncedAt: z.string().datetime().nullable(),
  suppressedReason: suppressionReason.nullable(),
  createdAt: z.string().datetime(),
});

const EmailProviderEvent = z.object({
  type: z.enum(["sent", "delivered", "opened", "clicked", "bounced", "complained"]),
  at: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const SuppressionRecord = z.object({
  email: z.string().email(),
  reason: suppressionReason,
  source: z.string().nullable(),
  createdAt: z.string().datetime(),
});

const ConversationTurnRecord = z.object({
  turnId: z.string().uuid(),
  conversationId: z.string().uuid(),
  direction: z.enum(["inbound", "outbound"]),
  channel: z.enum(["email", "sms"]),
  content: z.string(),
  createdAt: z.string().datetime(),
});

// ---------------------------------------------------------------------
// Transactional email (3)
// ---------------------------------------------------------------------

export const sendEmail: ToolDefinition = {
  name: "send_email",
  description:
    "Send a one-off email through the workspace's configured provider (Resend by default). Checks the suppression list before sending and skips with {suppressed: true} if the recipient has opted out.",
  args: z.object({
    to: z.string().email().describe("Recipient email address."),
    subject: z.string().min(1).describe("Email subject line."),
    body: z.string().min(1).describe("Plain-text body — rendered into the default HTML shell."),
    contact_id: z.string().uuid().optional().describe("Optional. Links the email to a CRM contact for threading."),
    provider: z.string().optional().describe("Optional. Force a specific provider (default: resend)."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({
    data: z
      .object({
        email: EmailRecord,
        suppressed: z.boolean().optional(),
      })
      .or(z.object({ suppressed: z.literal(true), reason: suppressionReason })),
  }),
  emits: ["email.sent"],
};

export const listEmails: ToolDefinition = {
  name: "list_emails",
  description: "List recent emails sent from the workspace, newest first. Useful for checking delivery status before following up.",
  args: z.object({
    limit: z.number().int().positive().max(200).optional().describe("Max rows to return (default 50, max 200)."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ data: z.array(EmailRecord) }),
  emits: [],
};

export const getEmail: ToolDefinition = {
  name: "get_email",
  description: "Fetch a single email with its full provider-event history (sent / delivered / opened / clicked / bounced).",
  args: z.object({
    email_id: z.string().uuid().describe("Email ID returned from send_email or list_emails."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({
    data: z.object({
      email: EmailRecord,
      events: z.array(EmailProviderEvent),
    }),
  }),
  emits: [],
};

// ---------------------------------------------------------------------
// Suppressions (3)
// ---------------------------------------------------------------------

export const listSuppressions: ToolDefinition = {
  name: "list_suppressions",
  description:
    "List all suppressed email addresses for the workspace — who is opted out and why (manual / unsubscribe / bounce / complaint).",
  args: z.object({ workspace_id: workspaceIdArg }),
  returns: z.object({ data: z.array(SuppressionRecord) }),
  emits: [],
};

export const suppressEmail: ToolDefinition = {
  name: "suppress_email",
  description: "Add an email address to the workspace suppression list so future sends skip it. Use for manual unsubscribes or policy blocks.",
  args: z.object({
    email: z.string().email().describe("Email address to suppress."),
    reason: suppressionReason.optional().describe("Reason code. Default: 'manual'."),
    source: z.string().optional().describe("Optional free-form provenance tag."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ data: SuppressionRecord }),
  emits: ["email.suppressed"],
};

export const unsuppressEmail: ToolDefinition = {
  name: "unsuppress_email",
  description: "Remove an email address from the workspace suppression list so future sends go through again.",
  args: z.object({
    email: z.string().email().describe("Email address to un-suppress."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ ok: z.literal(true), removed: z.string().email() }),
  emits: [],
};

// ---------------------------------------------------------------------
// Conversation Primitive (1) — shared with SMS via the `channel` arg.
// The underlying runtime lives at lib/conversation/runtime.ts and is
// channel-agnostic. Declared here because Email migrates first;
// SMS's tools.ts will reference this declaration, not re-declare.
// ---------------------------------------------------------------------

export const sendConversationTurn: ToolDefinition = {
  name: "send_conversation_turn",
  description:
    "Route an incoming message through the Conversation Primitive runtime. Loads prior turns for (contact, channel), generates a Soul-aware reply with Claude, writes both inbound + outbound turns, and emits conversation.turn.received / sent events. Use when building an always-on conversational agent (speed-to-lead, qualification chatbot).",
  args: z.object({
    contact_id: z.string().uuid().describe("CRM contact to converse with."),
    channel: z.enum(["email", "sms"]).describe("Transport channel."),
    message: z.string().min(1).describe("Incoming message content to reason about."),
    conversation_id: z
      .string()
      .uuid()
      .optional()
      .describe("Optional existing conversation id. Omit to let the runtime reuse the most recent active thread or open a new one."),
    subject: z.string().optional().describe("Optional subject for email threads."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({
    data: z.object({
      conversationId: z.string().uuid(),
      inboundTurn: ConversationTurnRecord,
      outboundTurn: ConversationTurnRecord,
    }),
  }),
  emits: ["conversation.turn.received", "conversation.turn.sent"],
};

// ---------------------------------------------------------------------
// Exported tuple — order matches tools.js for byte-stable emission.
// ---------------------------------------------------------------------

export const EMAIL_TOOLS: readonly ToolDefinition[] = [
  sendEmail,
  listEmails,
  getEmail,
  listSuppressions,
  suppressEmail,
  unsuppressEmail,
  sendConversationTurn,
] as const;
