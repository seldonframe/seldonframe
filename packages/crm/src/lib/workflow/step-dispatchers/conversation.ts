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

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { smsMessages, contacts, organizations, workflowRuns } from "@/db/schema";
import { getAIClient } from "@/lib/ai/client";
import type { ConversationStep } from "../../agents/validator";
import type { NextAction, RuntimeContext, StoredRun } from "../types";
// 2026-05-18 — V1.1 tool-use: LLM can call check_availability +
// create_booking inside the conversation so it can propose real
// open slots instead of just asking "what time works?" The handler
// table is shared with mcp_tool_call steps; same orgId-bound invoker.
import { makeAgentToolInvoker } from "@/lib/agents/tool-invoker";

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
  triggerPayload: Record<string, unknown> | null,
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
      .select({
        name: organizations.name,
        soul: organizations.soul,
        timezone: organizations.timezone,
      })
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

  // 2026-05-18 (later) — prefer the trigger payload's name over the
  // contact-row name. Customer just submitted the form as "leonie"
  // but the contact upserter matched by phone and kept the previously-
  // stored firstName "maxime" → the SMS opener said "Hi maxime".
  // Fixed by reading the form payload's fullName/firstName/name field
  // first, falling back to the contact row only when absent.
  const data = (triggerPayload?.data && typeof triggerPayload.data === "object"
    ? (triggerPayload.data as Record<string, unknown>)
    : (triggerPayload ?? {})) as Record<string, unknown>;
  const payloadFullName =
    (typeof data.fullName === "string" && data.fullName.trim()) ||
    (typeof data.name === "string" && data.name.trim()) ||
    "";
  const payloadFirstName =
    (typeof data.firstName === "string" && data.firstName.trim()) ||
    (payloadFullName ? payloadFullName.split(/\s+/)[0] : "");

  return {
    "contact.firstName": payloadFirstName || contactRow?.firstName || "",
    "contact.lastName": contactRow?.lastName ?? "",
    "contact.email":
      (typeof data.email === "string" && data.email) || contactRow?.email || "",
    "contact.phone":
      (typeof data.phone === "string" && data.phone) || contactRow?.phone || "",
    businessName: orgRow?.name ?? "",
    businessPhone,
    timezone: orgRow?.timezone ?? "UTC",
  };
}

type TranscriptTurn = {
  role: "assistant" | "user";
  content: string;
  ts: string; // ISO
};

type ConversationPhase = "active" | "nudged" | "closed";

type ConversationState = {
  transcript: TranscriptTurn[];
  turns: number;
  startedAt: string; // ISO
  /** 2026-05-18 — silence-handling phase. "active" = waiting for first
   *  reply with the regular 6h timeout. "nudged" = we already sent the
   *  6h reminder; another 24h with no reply triggers the close-out
   *  message and exits the step. "closed" = we sent the goodbye; no
   *  further sends from this step. */
  phase?: ConversationPhase;
};

const MAX_TURNS = 6;
const STATE_KEY_PREFIX = "__conversation_";

// 2026-05-18 — silence-handling tier durations.
// First timeout: 6h after the LAST assistant message → send gentle
// nudge ("still interested?"). Second timeout: another 24h → send
// close-out goodbye and exit.
const ACTIVE_TIMEOUT_MINUTES = 60 * 6; // 6h
const NUDGED_TIMEOUT_MINUTES = 60 * 24; // 24h after the nudge

function nudgeMessage(firstName: string, businessName: string): string {
  const name = firstName ? `, ${firstName}` : "";
  return `Hi${name} — just checking in! Still happy to help when you're ready. Anything I can answer?\n\n— ${businessName || "Team"}`;
}

function closeOutMessage(firstName: string, businessName: string): string {
  const name = firstName ? `, ${firstName}` : "";
  return `No worries${name} — we'll close this out for now. Text us anytime you'd like to pick this back up.\n\n— ${businessName || "Team"}`;
}

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

async function buildSystemPrompt(
  step: ConversationStep,
  runtimeVars: Record<string, string>,
  appointmentTypeId: string | null,
): Promise<string> {
  const extractFields = Object.entries(step.on_exit.extract)
    .map(([key, desc]) => `  - "${key}": ${desc}`)
    .join("\n");
  const toolsHint = appointmentTypeId
    ? `\nYou have a tool available: check_availability(appointment_type_id="${appointmentTypeId}", from_date?, max_results?). Call it BEFORE proposing a specific time so you only suggest slots that are actually open. The returned slots are UTC ISO timestamps — convert to the customer's local time (workspace TZ is ${runtimeVars.timezone || "UTC"}) when discussing with them.\n`
    : "";
  return `You are qualifying a customer lead over ${step.channel.toUpperCase()} for ${runtimeVars.businessName || "the business"}. Your goal:

${step.exit_when}

When the qualification criteria are met, emit your final response as:
<exit>{ ${Object.keys(step.on_exit.extract)
    .map((k) => `"${k}": <value>`)
    .join(", ")} }</exit>

Required extracted fields (each MUST be in the <exit> JSON):
${extractFields}

Until the criteria are met, respond CONVERSATIONALLY (one short ${step.channel.toUpperCase()}-friendly message, under 320 characters). Ask one specific follow-up question at a time. Do not emit the <exit> block until you have ALL required fields and the criteria are clearly met.
${toolsHint}
Critical:
- Never mention "Seldon" or "SeldonFrame".
- Sound like a real person from the business — friendly, concise, no corporate-speak.
- Use the customer's first name (${runtimeVars["contact.firstName"] || "the contact"}) when you know it. Refer to the business as "${runtimeVars.businessName || "us"}".
- Never emit literal {{placeholder}} tokens in your reply — always say the actual name / business / phone.
- If the customer goes off-topic, gently steer back.
- Hard limit: 6 turns total. On turn 6, emit the <exit> block with whatever you have (use "unknown" or "not_asked" for missing values).`;
}

// 2026-05-18 — V1.1 tool-use enabled LLM call. The LLM can request
// check_availability (read real open slots) or create_booking (book
// the slot directly) inside the conversation. The agentic inner loop
// (call → tool → result → call again) runs synchronously within one
// inbound-SMS → reply cycle. Capped at MAX_TOOL_ITERS to prevent
// runaway. When the LLM returns a text response (or <exit> block),
// the loop exits.
const MAX_TOOL_ITERS = 3;
const AGENT_TOOLS: Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> = [
  {
    name: "check_availability",
    description:
      "List the next open booking slots for the appointment type. Use this BEFORE proposing a time so you only suggest slots that are actually open. Returns up to max_results slots grouped by day.",
    input_schema: {
      type: "object",
      properties: {
        appointment_type_id: {
          type: "string",
          description: "The appointment type id (use the value from $appointmentTypeId in the agent config).",
        },
        from_date: {
          type: "string",
          description: "ISO date (YYYY-MM-DD) to start looking from. Default: today.",
        },
        max_results: {
          type: "number",
          description: "Maximum number of slots to return. Default 10, max 20.",
        },
      },
      required: ["appointment_type_id"],
    },
  },
];

async function callLLM(
  orgId: string,
  systemPrompt: string,
  transcript: TranscriptTurn[],
): Promise<string | null> {
  const ai = await getAIClient({ orgId });
  if (!ai.client) return null;
  const toolInvoker = makeAgentToolInvoker(orgId);
  type AnthropicMessage = { role: "user" | "assistant"; content: unknown };
  const messages: AnthropicMessage[] = transcript.map((t) => ({
    role: t.role,
    content: t.content,
  }));

  try {
    for (let iter = 0; iter < MAX_TOOL_ITERS; iter += 1) {
      const response = await ai.client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 800,
        system: systemPrompt,
        tools: AGENT_TOOLS as never,
        messages: messages as never,
      });

      const blocks = response.content as Array<{
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: Record<string, unknown>;
      }>;
      const toolUses = blocks.filter((b) => b.type === "tool_use");

      if (toolUses.length === 0) {
        // No tool calls — gather text and return.
        return blocks
          .filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join("\n")
          .trim();
      }

      // Tool calls present — execute each, append to messages, loop.
      // Append the assistant's tool-use turn first (Anthropic
      // requires the prior assistant content in order).
      messages.push({ role: "assistant", content: blocks });

      const toolResults: Array<{
        type: "tool_result";
        tool_use_id: string;
        content: string;
        is_error?: boolean;
      }> = [];
      for (const use of toolUses) {
        try {
          const result = await toolInvoker(
            use.name ?? "",
            (use.input ?? {}) as Record<string, unknown>,
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id ?? "",
            content: JSON.stringify(result),
          });
        } catch (err) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id ?? "",
            content:
              err instanceof Error ? err.message : String(err),
            is_error: true,
          });
        }
      }
      messages.push({ role: "user", content: toolResults });
      // Loop continues — LLM gets tool results and decides what's next.
    }
    // Hit MAX_TOOL_ITERS without a text response. Return null so the
    // dispatcher falls through to advancing without a reply (rare).
    console.warn(
      JSON.stringify({
        event: "conversation.tool_iter_cap_hit",
        orgId,
        max: MAX_TOOL_ITERS,
      }),
    );
    return null;
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
  const runtimeVars = await buildRunTimeVars(
    run.orgId,
    triggerInfo.contactId,
    (run.triggerPayload ?? null) as Record<string, unknown> | null,
  );

  // ─── Timeout dispatch (silence handling) ──────────────────────────
  // resumeWait sets __conversationTimeout=true in captureScope when
  // a pause_event timed out (customer didn't reply). Handle the
  // 6h-nudge → 24h-close-out → exit ladder here.
  const timeoutHit = run.captureScope.__conversationTimeout === true;
  if (timeoutHit && state && state.transcript.length > 0) {
    const phase: ConversationPhase = state.phase ?? "active";
    if (phase === "active") {
      // First timeout: send the gentle nudge, re-pause with the
      // longer 24h timeout, flip phase to "nudged".
      const nudge = nudgeMessage(
        runtimeVars["contact.firstName"] ?? "",
        runtimeVars.businessName ?? "",
      );
      try {
        await sendSmsReply(run.orgId, triggerInfo.contactId, phoneNumber, nudge);
      } catch (err) {
        // Send failed — don't keep retrying, advance to exit.
        console.warn(
          JSON.stringify({
            event: "conversation.nudge_send_failed",
            runId: run.id,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
        return { kind: "advance", next: step.on_exit.next };
      }
      await _context.storage.updateRun(run.id, {
        variableScope: {
          ...run.variableScope,
          [stateKey]: {
            ...state,
            phase: "nudged" as ConversationPhase,
            transcript: [
              ...state.transcript,
              { role: "assistant", content: nudge, ts: new Date().toISOString() },
            ],
          },
        },
        // Clear timeout marker so the next resume distinguishes
        // event_match (customer replied) from timeout (silence again).
        captureScope: { ...run.captureScope, __conversationTimeout: null },
      });
      return {
        kind: "pause_event",
        eventType: "sms.replied",
        matchPredicate: { contactId: triggerInfo.contactId },
        timeoutAt: new Date(Date.now() + NUDGED_TIMEOUT_MINUTES * 60 * 1000),
        onResumeNext: step.id,
        onResumeCapture: "__lastInboundSmsId",
        onTimeoutNext: step.on_exit.next,
      };
    }
    // Phase = "nudged" (or "closed", unreachable but defensive).
    // Second timeout: send close-out goodbye + advance with empty
    // extract. create_booking's fallback path handles a missing
    // preferred_start by picking the next available slot — operator
    // can still review the lead in /contacts even if no booking.
    const goodbye = closeOutMessage(
      runtimeVars["contact.firstName"] ?? "",
      runtimeVars.businessName ?? "",
    );
    try {
      await sendSmsReply(run.orgId, triggerInfo.contactId, phoneNumber, goodbye);
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: "conversation.closeout_send_failed",
          runId: run.id,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
    await _context.storage.updateRun(run.id, {
      variableScope: {
        ...run.variableScope,
        [stateKey]: {
          ...state,
          phase: "closed" as ConversationPhase,
          transcript: [
            ...state.transcript,
            { role: "assistant", content: goodbye, ts: new Date().toISOString() },
          ],
        },
      },
      captureScope: { ...run.captureScope, __conversationTimeout: null },
    });
    return { kind: "advance", next: step.on_exit.next };
  }

  // ─── First dispatch: send initial message + pause ─────────────────
  if (!state || state.transcript.length === 0) {
    // 2026-05-18 (later) — double-send race fix via CAS UPDATE. If two
    // workers race to dispatch the same run (cron worker + event-resume,
    // or two concurrent cron sweeps), only ONE wins this atomic
    // conditional update; the loser sees rowcount=0 and bails out
    // without sending.
    //
    // The predicate: WHERE variable_scope->'<stateKey>'->'transcript'
    // IS NULL OR equals '[]'::jsonb. Only the first worker matches; the
    // second sees the populated transcript from the first and the
    // update affects 0 rows.
    //
    // Visible bug: form submission → speed-to-lead fired the opener
    // SMS twice (two Twilio SIDs, same body, seconds apart). Operator
    // received "Hi maxime..." TWICE — cron worker race because Vercel
    // can retry cron invocations.
    const resolvedInitial = interpolateRunTimeVars(step.initial_message, runtimeVars);
    const sendStartedAt = new Date().toISOString();
    const pendingState: ConversationState = {
      transcript: [
        {
          role: "assistant",
          content: resolvedInitial,
          ts: sendStartedAt,
        },
      ],
      turns: 1,
      startedAt: sendStartedAt,
      phase: "active",
    };
    const newScope = { ...run.variableScope, [stateKey]: pendingState };
    // CAS UPDATE — only writes if no other worker has populated the
    // transcript yet. RETURNING id gives us a row when we won. The
    // JSON path is parameterised to keep the query safe; stateKey is
    // a code-defined token (STATE_KEY_PREFIX + step.id) so it can't
    // contain injection chars, but we still go through the JSONB ops.
    const wonRace = await db
      .update(workflowRuns)
      .set({ variableScope: newScope, updatedAt: new Date() })
      .where(
        and(
          eq(workflowRuns.id, run.id),
          sql`COALESCE(${workflowRuns.variableScope} #> ARRAY[${stateKey}, 'transcript']::text[], '[]'::jsonb) = '[]'::jsonb`,
        ),
      )
      .returning({ id: workflowRuns.id });
    if (wonRace.length === 0) {
      // Another worker beat us — they own the send + the pause. We
      // re-pause on sms.replied with the same predicate so the wait
      // row is in place (idempotent — createWait is OK with a
      // duplicate; the conversation engine resumes on either).
      console.log(
        JSON.stringify({
          event: "conversation.opener_race_lost",
          runId: run.id,
          stepId: step.id,
        }),
      );
      return {
        kind: "pause_event",
        eventType: "sms.replied",
        matchPredicate: { contactId: triggerInfo.contactId },
        timeoutAt: new Date(Date.now() + ACTIVE_TIMEOUT_MINUTES * 60 * 1000),
        onResumeNext: step.id,
        onResumeCapture: "__lastInboundSmsId",
        onTimeoutNext: step.id,
      };
    }
    try {
      await sendSmsReply(run.orgId, triggerInfo.contactId, phoneNumber, resolvedInitial);
    } catch (err) {
      return {
        kind: "fail",
        reason: `conversation: failed to send initial SMS: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    return {
      kind: "pause_event",
      eventType: "sms.replied",
      matchPredicate: { contactId: triggerInfo.contactId },
      // 2026-05-18 — first wait is the short 6h tier. If the customer
      // doesn't reply, the cron sweeps the wait, resumeWait re-dispatches
      // with __conversationTimeout=true, and the silence-handling
      // branch above sends the nudge + flips phase to "nudged".
      timeoutAt: new Date(Date.now() + ACTIVE_TIMEOUT_MINUTES * 60 * 1000),
      onResumeNext: step.id,
      onResumeCapture: "__lastInboundSmsId",
      onTimeoutNext: step.id, // re-dispatch on timeout too (silence-handler branch decides)
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

  // Pull the appointment_type_id from the run's spec — find the
  // downstream create_booking step (if any) and grab its arg. The
  // value was substituted at synthesis time, so it's a real id.
  // Used by buildSystemPrompt to teach the LLM the tool signature.
  let appointmentTypeId: string | null = null;
  try {
    const specSteps = (run.specSnapshot as unknown as { steps?: Array<Record<string, unknown>> })?.steps ?? [];
    for (const s of specSteps) {
      if (
        s.type === "mcp_tool_call" &&
        s.tool === "create_booking" &&
        s.args &&
        typeof s.args === "object" &&
        typeof (s.args as Record<string, unknown>).appointment_type_id === "string"
      ) {
        appointmentTypeId = (s.args as Record<string, unknown>).appointment_type_id as string;
        break;
      }
    }
  } catch {
    appointmentTypeId = null;
  }

  const systemPrompt = await buildSystemPrompt(step, runtimeVars, appointmentTypeId);
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
    // Mid-conversation re-pause uses the same 6h active tier as the
    // first pause. Customer just sent something a moment ago, so 6h
    // of further silence is a real signal worth nudging on.
    timeoutAt: new Date(Date.now() + ACTIVE_TIMEOUT_MINUTES * 60 * 1000),
    onResumeNext: step.id,
    onResumeCapture: "__lastInboundSmsId",
    onTimeoutNext: step.id,
  };
}
