// SMS block — tool schemas (Scope 3 Step 2b.2 block 3 — SMS).
//
// Zod-authored schemas for the 6 SMS-native MCP tools. Source of truth
// for the tool surface; the emit step renders JSON Schema into
// sms.block.md on next `pnpm emit:blocks`.
//
// 6 tools total (matches skills/mcp-server/src/tools.js lines 1417-1546):
//   Transactional SMS (3):  send_sms, list_sms, get_sms
//   Suppressions (3):       list_sms_suppressions, suppress_phone,
//                           unsuppress_phone
//
// Conversation Primitive convention (see email.tools.ts header +
// email.block.md):
//   `send_conversation_turn` is SHARED between Email and SMS. Its
//   Zod schema lives in email.tools.ts (Email migrated first). This
//   file does NOT re-declare it — the global ToolRegistry is keyed
//   by tool name, so a re-declaration would duplicate. SMS's BLOCK.md
//   still lists `conversation.turn.received` / `conversation.turn.sent`
//   in produces because both channels can produce conversation events
//   at runtime; only the tool DECLARATION lives on one block.
//
// Per Max's SMS-migration directive: no changes to
// `packages/crm/src/lib/agents/types.ts` (ConversationExit / Predicate
// / ExtractField). If SMS migration had required any type change, that
// would be a stop-and-flag signal. The types remained stable through
// Booking + Email migrations; they stay stable here.

import { z } from "zod";

import type { ToolDefinition } from "../lib/blocks/contract-v2";

// ---------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------

const workspaceIdArg = z
  .string()
  .uuid()
  .optional()
  .describe("Optional. Falls back to the active workspace.");

const smsStatus = z.enum([
  "queued",
  "sent",
  "delivered",
  "failed",
  "undelivered",
  "received",
]);

const smsSuppressionReason = z.enum(["manual", "stop_keyword", "carrier_block", "complaint"]);

const smsDirection = z.enum(["inbound", "outbound"]);

// Phone numbers: accept E.164 or 10-digit US format — the API
// normalizes both. Zod's regex lets either through so the synthesis
// surface doesn't reject valid calls.
const phoneString = z.string().regex(/^\+?[0-9]{10,15}$/, {
  message: "Phone must be E.164 (+15551234567) or 10-15 digits",
});

// ---------------------------------------------------------------------
// Return shapes
// ---------------------------------------------------------------------

const SmsMessageRecord = z.object({
  id: z.string().uuid(),
  contactId: z.string().uuid().nullable(),
  direction: smsDirection,
  fromPhone: z.string(),
  toPhone: z.string(),
  body: z.string(),
  status: smsStatus,
  providerMessageSid: z.string().nullable(),
  segments: z.number().int().nonnegative(),
  sentAt: z.string().datetime().nullable(),
  deliveredAt: z.string().datetime().nullable(),
  failedAt: z.string().datetime().nullable(),
  failureCode: z.string().nullable(),
  createdAt: z.string().datetime(),
});

const SmsProviderEvent = z.object({
  type: z.enum(["queued", "sent", "delivered", "failed", "undelivered", "received"]),
  at: z.string().datetime(),
  providerStatus: z.string().nullable(),
  errorCode: z.string().nullable(),
});

const SmsSuppressionRecord = z.object({
  phone: z.string(),
  reason: smsSuppressionReason,
  source: z.string().nullable(),
  createdAt: z.string().datetime(),
});

// ---------------------------------------------------------------------
// Transactional SMS (3)
// ---------------------------------------------------------------------

export const sendSms: ToolDefinition = {
  name: "send_sms",
  description:
    "Send an SMS via the workspace's Twilio integration. Checks the SMS suppression list first (STOP keyword + carrier blocks + manual opt-outs) and skips with {suppressed: true} if the recipient has opted out.",
  args: z.object({
    to: phoneString.describe("Recipient phone number. E.164 or 10-digit US will be normalized."),
    body: z.string().min(1).describe("SMS body. Twilio will segment if over 160 chars; charges per segment."),
    contact_id: z.string().uuid().optional().describe("Optional. Links the message to a CRM contact for threading."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({
    data: z
      .object({
        message: SmsMessageRecord,
        suppressed: z.boolean().optional(),
      })
      .or(z.object({ suppressed: z.literal(true), reason: smsSuppressionReason })),
  }),
  emits: ["sms.sent"],
};

export const listSms: ToolDefinition = {
  name: "list_sms",
  description: "List recent SMS messages (inbound + outbound) for the workspace, newest first.",
  args: z.object({
    limit: z.number().int().positive().max(200).optional().describe("Max rows to return (default 50, max 200)."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ data: z.array(SmsMessageRecord) }),
  emits: [],
};

export const getSms: ToolDefinition = {
  name: "get_sms",
  description: "Fetch a single SMS with its full provider-event history (queued / sent / delivered / failed / undelivered).",
  args: z.object({
    sms_id: z.string().uuid().describe("SMS ID returned from send_sms or list_sms."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({
    data: z.object({
      message: SmsMessageRecord,
      events: z.array(SmsProviderEvent),
    }),
  }),
  emits: [],
};

// ---------------------------------------------------------------------
// SMS suppressions (3)
// ---------------------------------------------------------------------

export const listSmsSuppressions: ToolDefinition = {
  name: "list_sms_suppressions",
  description:
    "List all suppressed phone numbers for the workspace — who is opted out and why (manual / stop_keyword / carrier_block / complaint).",
  args: z.object({ workspace_id: workspaceIdArg }),
  returns: z.object({ data: z.array(SmsSuppressionRecord) }),
  emits: [],
};

export const suppressPhone: ToolDefinition = {
  name: "suppress_phone",
  description:
    "Add a phone number to the SMS suppression list so future SMS sends skip it. STOP replies + carrier permanent-failure codes auto-suppress via the Twilio webhook; use this for manual opt-outs.",
  args: z.object({
    phone: phoneString.describe("Phone number to suppress. E.164 or 10-digit US will be normalized."),
    reason: smsSuppressionReason.optional().describe("Reason code. Default: 'manual'."),
    source: z.string().optional().describe("Optional free-form provenance tag."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ data: SmsSuppressionRecord }),
  emits: ["sms.suppressed"],
};

export const unsuppressPhone: ToolDefinition = {
  name: "unsuppress_phone",
  description: "Remove a phone number from the SMS suppression list so future sends go through again.",
  args: z.object({
    phone: phoneString.describe("Phone number to un-suppress."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ ok: z.literal(true), removed: z.string() }),
  emits: [],
};

// ---------------------------------------------------------------------
// Exported tuple — order matches tools.js for byte-stable emission.
// ---------------------------------------------------------------------

export const SMS_TOOLS: readonly ToolDefinition[] = [
  sendSms,
  listSms,
  getSms,
  listSmsSuppressions,
  suppressPhone,
  unsuppressPhone,
] as const;
