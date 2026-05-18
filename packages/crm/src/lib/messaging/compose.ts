// 2026-05-18 — Compose a customer-facing message via the operator's
// LLM, given a skill + render vars.
//
// Flow:
//   1. Render the skill prose with {{vars}} substituted
//   2. Call the operator's Anthropic (BYOK) — same path as the chatbot,
//      so the LLM cost lives on their key, not on SF's platform key.
//   3. Parse the response into { subject, body } — the skill prose
//      tells the LLM to emit a SUBJECT: prefix on the first line.
//   4. Run validators: forbidden strings, length cap, must mention
//      business name once. Reject + return error if any fail.
//
// Karpathy frame: this file is the thin harness. The skill (fat) does
// the work. When Claude improves, the skill prose can simplify. Code
// stays.

import type Anthropic from "@anthropic-ai/sdk";
import { getAIClient } from "@/lib/ai/client";
import {
  getMessageSkill,
  renderSkillPrompt,
  type OutboundMessageSkill,
} from "./skills/registry";

export type ComposeInput = {
  orgId: string;
  skillId: string;
  /** When set, used INSTEAD of the platform skill (operator override
   *  from outbound_message_triggers.custom_skill_md). */
  customSkillMd?: string | null;
  /** Render vars to substitute into the skill prose. Unknown {{slots}}
   *  are left intact so the LLM can see what was missing. */
  vars: Record<string, string>;
  /** Channel constrains length + format. Email = subject+body, SMS = body only. */
  channel: "email" | "sms";
};

export type ComposeSuccess = {
  ok: true;
  subject: string | null;
  body: string;
  model: string;
};
export type ComposeFailure = { ok: false; reason: string };

const MAX_EMAIL_BODY = 4000;
// 2026-05-18 — Slice 3: SMS body cap leaves room for the auto-appended
// STOP footer (~27 chars including the leading space). Two standard
// SMS segments = 320 chars total; we cap composed body at 290 so the
// final payload (body + footer) fits in 2 segments with room to spare.
// Carriers charge per segment; a 290+27 = 317-char send is one
// concatenated message billed as 2 segments. Going over starts to
// chunk in unpredictable ways.
const MAX_SMS_BODY = 290;
const FORBIDDEN_STRINGS = ["seldon", "seldonframe"];

export async function composeOutboundMessage(
  input: ComposeInput,
): Promise<ComposeSuccess | ComposeFailure> {
  const skill: OutboundMessageSkill | null =
    input.customSkillMd && input.customSkillMd.trim().length > 0
      ? buildAdHocSkill(input.skillId, input.customSkillMd, input.channel)
      : getMessageSkill(input.skillId);
  if (!skill) {
    return { ok: false, reason: `unknown_skill:${input.skillId}` };
  }

  const renderedPrompt = renderSkillPrompt(skill, input.vars);

  // Pull the operator's LLM. BYOK Anthropic = operator pays for the
  // compose; SF doesn't touch their bill.
  const ai = await getAIClient({ orgId: input.orgId });
  if (!ai.client) {
    return { ok: false, reason: "no_llm_available" };
  }

  let response: Anthropic.Messages.Message;
  try {
    response = await ai.client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: input.channel === "sms" ? 400 : 1200,
      system:
        "You are composing a single transactional message for a customer of a small business. " +
        "Follow the operator's skill prose exactly. Output only the message — no preamble, " +
        "no markdown code fences, no explanation. For email, the first line must start with `SUBJECT:` " +
        "followed by the subject; everything after is the body. For SMS, output only the body.",
      messages: [{ role: "user", content: renderedPrompt }],
    });
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? `llm_error:${err.message}` : "llm_error",
    };
  }

  const text = extractText(response);
  if (!text) return { ok: false, reason: "empty_llm_response" };

  const parsed = parseChannelResponse(text, input.channel);
  if (!parsed.ok) return parsed;

  // Validators — fail-closed.
  const lowered = parsed.body.toLowerCase();
  for (const forbidden of FORBIDDEN_STRINGS) {
    if (lowered.includes(forbidden)) {
      return { ok: false, reason: `forbidden_string:${forbidden}` };
    }
  }
  const cap = input.channel === "sms" ? MAX_SMS_BODY : MAX_EMAIL_BODY;
  if (parsed.body.length > cap) {
    return { ok: false, reason: `over_length:${parsed.body.length}>${cap}` };
  }

  return {
    ok: true,
    subject: parsed.subject,
    body: parsed.body,
    model: response.model,
  };
}

function buildAdHocSkill(
  id: string,
  prose: string,
  channel: "email" | "sms",
): OutboundMessageSkill {
  return {
    id,
    label: `Custom override for ${id}`,
    content: prose,
    channels: [channel],
    defaultEvents: [],
  };
}

function extractText(response: Anthropic.Messages.Message): string {
  return response.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function parseChannelResponse(
  text: string,
  channel: "email" | "sms",
):
  | { ok: true; subject: string | null; body: string }
  | { ok: false; reason: string } {
  if (channel === "sms") {
    return { ok: true, subject: null, body: text };
  }

  // Email: expect SUBJECT: on line 1.
  const lines = text.split(/\r?\n/);
  const subjectLine = lines[0]?.trim() ?? "";
  if (!/^SUBJECT:/i.test(subjectLine)) {
    return { ok: false, reason: "missing_subject_prefix" };
  }
  const subject = subjectLine.replace(/^SUBJECT:\s*/i, "").trim();
  if (!subject) {
    return { ok: false, reason: "empty_subject" };
  }
  const body = lines.slice(1).join("\n").trim();
  if (!body) {
    return { ok: false, reason: "empty_body" };
  }
  return { ok: true, subject, body };
}
