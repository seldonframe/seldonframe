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
// 2026-05-18 — deterministic template fallback. Operator reported
// "booked a job, no email" after Resend was connected. Root cause:
// no Anthropic key configured on the workspace, so getAIClient()
// returned no client and compose silently failed with
// no_llm_available. The fallback below makes sure SOMETHING ships
// even without an LLM — a generic-but-real confirmation message
// with the customer's name + booking time + business name slotted in.
// Once an Anthropic key is set, the LLM path takes over automatically.
import { renderTemplateMessage } from "./compose-template";

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

// 2026-05-18 (later) — strip URLs before the forbidden-string scan.
// The check's intent is to prevent the LLM (or template) from
// advertising "SeldonFrame" to the operator's customer in the prose.
// But functional URLs like https://app.seldonframe.com/book/<slug> are
// REQUIRED for the customer to reschedule — and operators using the
// default app domain (which they always do until they configure a
// custom domain) all carry "seldonframe" in the URL. Without this
// strip, every confirmation message under the default domain was
// failing with forbidden_string:seldon. URLs are recognized by the
// http(s):// prefix; bare-domain references like "seldonframe.com"
// in PROSE still get caught.
const URL_PATTERN = /https?:\/\/\S+/gi;
function bodyWithoutUrls(body: string): string {
  return body.replace(URL_PATTERN, " ");
}

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
    // 2026-05-18 — fall back to the deterministic template so the
    // customer always gets a confirmation. See compose-template.ts
    // for per-skill body shapes. Logs a structured event so the
    // dispatcher's audit row records WHY this send is generic
    // (operator can wire an Anthropic key to upgrade to LLM compose).
    console.log(
      JSON.stringify({
        event: "compose.template_fallback",
        orgId: input.orgId,
        skillId: input.skillId,
        channel: input.channel,
        reason: "no_llm_available",
      }),
    );
    return renderViaTemplate(input);
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
    // 2026-05-18 — LLM errored (rate limit, invalid key, network).
    // Same fallback path so customer still gets the confirmation.
    console.warn(
      JSON.stringify({
        event: "compose.llm_error_fallback",
        orgId: input.orgId,
        skillId: input.skillId,
        channel: input.channel,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return renderViaTemplate(input);
  }

  const text = extractText(response);
  if (!text) {
    console.warn(
      JSON.stringify({
        event: "compose.empty_llm_response_fallback",
        orgId: input.orgId,
        skillId: input.skillId,
      }),
    );
    return renderViaTemplate(input);
  }

  const parsed = parseChannelResponse(text, input.channel);
  if (!parsed.ok) {
    // Subject prefix missing or empty body — fall back rather than
    // rejecting so the customer still gets a confirmation.
    console.warn(
      JSON.stringify({
        event: "compose.parse_failed_fallback",
        orgId: input.orgId,
        skillId: input.skillId,
        reason: parsed.reason,
      }),
    );
    return renderViaTemplate(input);
  }

  // Validators — fail-closed. URLs are stripped from the scan because
  // the booking page URL contains "app.seldonframe.com" under the
  // default domain; that's functional, not promotional. See URL_PATTERN
  // above.
  const proseOnly = bodyWithoutUrls(parsed.body).toLowerCase();
  for (const forbidden of FORBIDDEN_STRINGS) {
    if (proseOnly.includes(forbidden)) {
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

// 2026-05-18 — wrap the deterministic template renderer to match the
// ComposeSuccess/Failure shape the dispatcher already handles. We tag
// model="template-fallback" so audit rows make the source obvious in
// outbound_message_sends.metadata. Validators still apply: if the
// template somehow generated forbidden strings or over-length output,
// we surface the same failure shape as the LLM path.
function renderViaTemplate(input: ComposeInput): ComposeSuccess | ComposeFailure {
  const rendered = renderTemplateMessage({
    skillId: input.skillId,
    channel: input.channel,
    vars: input.vars,
  });

  // Validators — same fail-closed posture as the LLM path so a buggy
  // template doesn't slip past TCPA/forbidden-string guarantees. URLs
  // are stripped before scanning since functional links to
  // app.seldonframe.com under the default domain are not promotional.
  const proseOnly = bodyWithoutUrls(rendered.body).toLowerCase();
  for (const forbidden of FORBIDDEN_STRINGS) {
    if (proseOnly.includes(forbidden)) {
      return { ok: false, reason: `forbidden_string_in_template:${forbidden}` };
    }
  }
  const cap = input.channel === "sms" ? MAX_SMS_BODY : MAX_EMAIL_BODY;
  if (rendered.body.length > cap) {
    return { ok: false, reason: `template_over_length:${rendered.body.length}>${cap}` };
  }
  // Email path requires non-empty subject; template fallback always
  // sets one but we double-check.
  if (input.channel === "email" && !rendered.subject) {
    return { ok: false, reason: "template_missing_subject" };
  }

  return {
    ok: true,
    subject: rendered.subject,
    body: rendered.body,
    model: "template-fallback",
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
