// 2026-05-18 — Conversation step dispatcher V1.
//
// Karpathy frame: this is the THIN HARNESS. The fat skill is the
// prose in `step.initial_message` + `step.exit_when` + the extract
// schema — all defined per-archetype, editable per-workspace. The
// LLM does the qualification work; this dispatcher just routes:
//
//   First dispatch:
//     1. Send initial_message via send_sms (or send_email)
//     2. Persist transcript = [{role: "assistant", content: initial_message}]
//     3. pause_event on sms.replied matched by contactId
//     4. onResumeNext = this step's id (re-dispatch on reply)
//
//   Resume dispatch (transcript non-empty):
//     1. Look up the inbound message from the resume payload
//     2. Append {role: "user", content: <body>}
//     3. Call Claude with system prompt + exit_when + extract schema +
//        transcript
//     4. Parse Claude output:
//        - If <exit>{...}</exit> block: extract vars, advance to next
//        - If plain text: send reply, persist, pause again
//        - Hard limit at 6 turns to prevent runaway
//
// Antifragile to LLM upgrades: as Claude gets better, the exit_when
// prose and extract descriptions stay the same. The model just gets
// smarter at deciding when to exit and what to extract. No code
// change required.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { smsMessages, contacts, organizations } from "@/db/schema";
import { getAIClient } from "@/lib/ai/client";
import type { ConversationStep } from "../../agents/validator";
import type { NextAction, RuntimeContext, StoredRun } from "../types";

// 2026-05-18 — final placeholder interpolation before sending the
// initial/reply message. The synthesizer fills $placeholders at
// agent-create time, but Twig-style {{contact.firstName}} and
// {{businessName}} need run-time resolution against actual contact
// + workspace data. Without this we shipped messages like
// "Hi {{contact.firstName}}, thanks for reaching out to Bright Smile
// Dental..." (LITERAL example text in production SMS) — visible bug.
function interpolateRunTimeVars(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{([\w.]+)\}\}/g, (match, key) => {
    if (key in vars) return vars[key];
    // Unknown placeholder — strip the braces but leave the bare word
    // so we never ship "{{foo}}" to a customer. Better to show "foo"
    // (which someone might recognize as a label) than the raw token.
    return "";
  });
}

async function buildRunTimeVars(
  orgId: string,
  contactId: string,
): Promise<Record<string, string>> {
  const [[contactRow], [orgRow]] = await Promise.all([
    db
      .select({
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        phone: contacts.phone,
      })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
      .limit(1),
    db
      .select({ name: organizations.name, soul: organizations.soul })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1),
  ]);
  const soul = (orgRow?.soul ?? {}) as Record<string, unknown>;
  const businessPhone =
    (typeof soul.phone === "string" && soul.phone) ||
    (typeof (soul.business as Record<string, unknown>)?.phone === "string" &&
      ((soul.business as Record<string, unknown>).phone as string)) ||
    "";
  return {
    "contact.firstName": contactRow?.firstName ?? "",
    "contact.lastName": contactRow?.lastName ?? "",
    "contact.email": contactRow?.email ?? "",
    "contact.phone": contactRow?.phone ?? "",
    businessName: orgRow?.name ?? "",
    businessPhone,
  };
}

type TranscriptTurn = {
  role: "assistant" | "user";
  content: string;
  ts: string; // ISO
};

type ConversationState = {
  transcript: TranscriptTurn[];
  turns: number;
  startedAt: string; // ISO
};

const MAX_TURNS = 6;
const REPLY_WAIT_MINUTES = 60 * 24; // 24h for the customer to reply
const STATE_KEY_PREFIX = "__conversation_";

function getState(run: StoredRun, stepId: string): ConversationState | null {
  const raw = (run.variableScope[STATE_KEY_PREFIX + stepId] ?? null) as
    | ConversationState
    | null;
  return raw && Array.isArray(raw.transcript) ? raw : null;
}

function resolveContactInfo(
  run: StoredRun,
): { contactId: string | null; phone: string | null; email: string | null } {
  const payload = run.triggerPayload ?? {};
  const data = (payload.data && typeof payload.data === "object"
    ? (payload.data as Record<string, unknown>)
    : null) ?? null;
  const contactId =
    typeof payload.contactId === "string"
      ? payload.contactId
      : typeof data?.contactId === "string"
        ? (data.contactId as string)
        : null;
  const phone =
    typeof data?.phone === "string"
      ? (data.phone as string)
      : typeof payload.phone === "string"
        ? payload.phone
        : null;
  const email =
    typeof data?.email === "string"
      ? (data.email as string)
      : typeof payload.email === "string"
        ? payload.email
        : null;
  return { contactId, phone, email };
}

async function lookupContact(orgId: string, contactId: string) {
  const [row] = await db
    .select({
      firstName: contacts.firstName,
      email: contacts.email,
      phone: contacts.phone,
    })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
    .limit(1);
  return row ?? null;
}

async function lookupInboundMessage(orgId: string, smsMessageId: string) {
  const [row] = await db
    .select({ body: smsMessages.body, contactId: smsMessages.contactId })
    .from(smsMessages)
    .where(and(eq(smsMessages.orgId, orgId), eq(smsMessages.id, smsMessageId)))
    .limit(1);
  return row ?? null;
}

function parseExitBlock(output: string): {
  exiting: boolean;
  extracted: Record<string, unknown>;
  replyText: string;
} {
  const exitMatch = output.match(/<exit>([\s\S]*?)<\/exit>/i);
  if (!exitMatch) {
    return { exiting: false, extracted: {}, replyText: output.trim() };
  }
  let extracted: Record<string, unknown> = {};
  try {
    extracted = JSON.parse(exitMatch[1].trim());
  } catch {
    // Malformed JSON in exit block — treat as plain text reply
    return { exiting: false, extracted: {}, replyText: output.trim() };
  }
  // Anything outside the <exit> tag is a final assistant message
  // (we don't send it — the booking confirmation is the next step).
  return { exiting: true, extracted, replyText: "" };
}

async function buildSystemPrompt(step: ConversationStep): Promise<string> {
  const extractFields = Object.entries(step.on_exit.extract)
    .map(([key, desc]) => `  - "${key}": ${desc}`)
    .join("\n");
  return `You are qualifying a customer lead over ${step.channel.toUpperCase()}. Your goal:

${step.exit_when}

When the qualification criteria are met, emit your final response as:
<exit>{ ${Object.keys(step.on_exit.extract)
    .map((k) => `"${k}": <value>`)
    .join(", ")} }</exit>

Required extracted fields (each MUST be in the <exit> JSON):
${extractFields}

Until the criteria are met, respond CONVERSATIONALLY (one short ${step.channel.toUpperCase()}-friendly message, under 320 characters). Ask one specific follow-up question at a time. Do not emit the <exit> block until you have ALL required fields and the criteria are clearly met.

Critical:
- Never mention "Seldon" or "SeldonFrame".
- Sound like a real person from the business — friendly, concise, no corporate-speak.
- If the customer goes off-topic, gently steer back.
- Hard limit: 6 turns total. On turn 6, emit the <exit> block with whatever you have (use "unknown" or "not_asked" for missing values).`;
}

async function callLLM(
  orgId: string,
  systemPrompt: string,
  transcript: TranscriptTurn[],
): Promise<string | null> {
  const ai = await getAIClient({ orgId });
  if (!ai.client) return null;
  try {
    const response = await ai.client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 800,
      system: systemPrompt,
      messages: transcript.map((t) => ({
        role: t.role,
        content: t.content,
      })),
    });
    return response.content
      .filter((block) => block.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n")
      .trim();
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "conversation.llm_call_failed",
        orgId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}

async function sendSmsReply(
  orgId: string,
  contactId: string | null,
  toNumber: string,
  body: string,
): Promise<void> {
  const { sendSmsFromApi } = await import("@/lib/sms/api");
  await sendSmsFromApi({
    orgId,
    userId: null,
    contactId,
    toNumber,
    body,
  });
}

export async function dispatchConversation(
  run: StoredRun,
  step: ConversationStep,
  _context: RuntimeContext,
): Promise<NextAction> {
  // Resolve contact info from the trigger payload + contact row.
  const triggerInfo = resolveContactInfo(run);
  if (!triggerInfo.contactId) {
    return {
      kind: "fail",
      reason: "conversation: trigger payload has no contactId — can't route SMS",
    };
  }
  const contact = await lookupContact(run.orgId, triggerInfo.contactId);
  if (!contact) {
    return {
      kind: "fail",
      reason: `conversation: contact ${triggerInfo.contactId} not found`,
    };
  }
  const phoneNumber =
    triggerInfo.phone || contact.phone || null;
  if (!phoneNumber) {
    return {
      kind: "fail",
      reason: "conversation: no phone number on trigger payload or contact — can't send SMS",
    };
  }

  const state = getState(run, step.id);
  const stateKey = STATE_KEY_PREFIX + step.id;

  // Build run-time variables for {{contact.firstName}} / {{businessName}}
  // / etc. interpolation. Happens for BOTH the initial message and any
  // subsequent LLM-generated replies (LLM might emit {{...}} if the
  // system prompt didn't fully scrub them).
  const runtimeVars = await buildRunTimeVars(run.orgId, triggerInfo.contactId);

  // ─── First dispatch: send initial message + pause ─────────────────
  if (!state || state.transcript.length === 0) {
    const resolvedInitial = interpolateRunTimeVars(step.initial_message, runtimeVars);
    try {
      await sendSmsReply(run.orgId, triggerInfo.contactId, phoneNumber, resolvedInitial);
    } catch (err) {
      return {
        kind: "fail",
        reason: `conversation: failed to send initial SMS: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    const newState: ConversationState = {
      transcript: [
        {
          role: "assistant",
          content: resolvedInitial,
          ts: new Date().toISOString(),
        },
      ],
      turns: 1,
      startedAt: new Date().toISOString(),
    };
    await _context.storage.updateRun(run.id, {
      variableScope: { ...run.variableScope, [stateKey]: newState },
    });
    return {
      kind: "pause_event",
      eventType: "sms.replied",
      matchPredicate: { contactId: triggerInfo.contactId },
      timeoutAt: new Date(Date.now() + REPLY_WAIT_MINUTES * 60 * 1000),
      onResumeNext: step.id, // re-dispatch THIS step on reply
      onResumeCapture: "__lastInboundSmsId",
      onTimeoutNext: step.on_exit.next, // give up after 24h with empty extract
    };
  }

  // ─── Resume dispatch: append user message, call LLM, decide ────────
  // The resume capture leaves __lastInboundSmsId in captureScope.
  const lastSmsId =
    typeof run.captureScope.__lastInboundSmsId === "string"
      ? (run.captureScope.__lastInboundSmsId as string)
      : null;
  // Resume payload from sms.replied event has shape { smsMessageId, contactId, conversationId }.
  // The dispatcher receives the captured smsMessageId via captureScope.
  let inboundBody: string | null = null;
  if (lastSmsId) {
    const inbound = await lookupInboundMessage(run.orgId, lastSmsId);
    inboundBody = inbound?.body ?? null;
  }
  if (!inboundBody) {
    // No inbound message body to act on — happens when the resume fires
    // with a malformed event or we lost the message id. Bail to next
    // step with no extracted vars rather than spinning.
    return { kind: "advance", next: step.on_exit.next };
  }

  const updatedTranscript: TranscriptTurn[] = [
    ...state.transcript,
    {
      role: "user",
      content: inboundBody,
      ts: new Date().toISOString(),
    },
  ];

  const systemPrompt = await buildSystemPrompt(step);
  const llmOutput = await callLLM(run.orgId, systemPrompt, updatedTranscript);

  // If LLM failed entirely, advance to next step with empty extract —
  // the create_booking fallback handles missing preferred_start by
  // booking next-available-slot, so the pipeline still completes.
  if (!llmOutput) {
    await _context.storage.updateRun(run.id, {
      variableScope: {
        ...run.variableScope,
        [stateKey]: { ...state, transcript: updatedTranscript, turns: state.turns + 1 },
      },
    });
    return { kind: "advance", next: step.on_exit.next };
  }

  const parsed = parseExitBlock(llmOutput);

  // Hard turn limit — force exit at turn 6 even if LLM is still chatty.
  const turnCount = state.turns + 1;
  const forceExit = turnCount >= MAX_TURNS;

  if (parsed.exiting || forceExit) {
    // Persist final transcript + extracted vars
    await _context.storage.updateRun(run.id, {
      variableScope: {
        ...run.variableScope,
        [stateKey]: {
          ...state,
          transcript: [
            ...updatedTranscript,
            {
              role: "assistant",
              content: parsed.exiting ? "<exit>" : "<force-exit-turn-limit>",
              ts: new Date().toISOString(),
            },
          ],
          turns: turnCount,
        },
        // Surface extracted vars at the top of variableScope so
        // {{preferred_start}}, {{insurance_status}} interpolate
        // correctly in downstream mcp_tool_call args.
        ...parsed.extracted,
      },
    });
    return { kind: "advance", next: step.on_exit.next };
  }

  // Continue conversation: send reply, append, pause again. Resolve
  // any stray placeholders the LLM may have echoed back (safety net —
  // the system prompt instructs against this but models occasionally
  // mirror placeholders from the transcript).
  const resolvedReply = interpolateRunTimeVars(parsed.replyText, runtimeVars);
  try {
    await sendSmsReply(run.orgId, triggerInfo.contactId, phoneNumber, resolvedReply);
  } catch (err) {
    return {
      kind: "fail",
      reason: `conversation: failed to send reply SMS: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  await _context.storage.updateRun(run.id, {
    variableScope: {
      ...run.variableScope,
      [stateKey]: {
        ...state,
        transcript: [
          ...updatedTranscript,
          {
            role: "assistant",
            content: resolvedReply,
            ts: new Date().toISOString(),
          },
        ],
        turns: turnCount,
      },
    },
  });

  return {
    kind: "pause_event",
    eventType: "sms.replied",
    matchPredicate: { contactId: triggerInfo.contactId },
    timeoutAt: new Date(Date.now() + REPLY_WAIT_MINUTES * 60 * 1000),
    onResumeNext: step.id,
    onResumeCapture: "__lastInboundSmsId",
    onTimeoutNext: step.on_exit.next,
  };
}
