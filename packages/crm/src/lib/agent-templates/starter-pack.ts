// Starter Pack — a curated, forkable library of agent-template seeds.
//
// A NEW builder lands on the Agents Studio facing a blank roster. This module
// is the cure: a STATIC registry of polished, ready-to-resell agent templates
// (the top LLM-agent SMB use-cases). One click in the Studio forks a starter
// into a builder-OWNED agent_template they can edit → test → deploy → resell.
//
// WHY a plain module (NOT "use server"): per scripts/check-use-server.sh a
// "use server" file may export only async functions. This file exports the
// STARTER_TEMPLATES const + the pure getStarterTemplate/instantiateStarter
// helpers, so it MUST stay a plain module — exactly the split the generator
// (generate.ts) and the template MCP composition (mcp-actions.ts) use. The thin
// "use server" wrapper (createTemplateFromStarterAction in actions.ts) does only
// auth + wires the real createAgentTemplate + the blueprint-save path.
//
// ADDITIVE ONLY: this introduces NO new entity and NO migration. It reuses the
// EXISTING agent_templates table, TemplateBlueprintPatchSchema, createAgentTemplate
// and updateAgentTemplate. The deterministic /automations archetypes are a
// SEPARATE, untouched registry — these are the LLM-agent (voice/chat) seeds.
//
// INVARIANT (guarded by starter-pack.spec.ts): every blueprint here passes the
// REAL TemplateBlueprintPatchSchema and every capability is a subset of its
// surface's allowed set (capabilitiesForSurface) — so a fork can never persist
// an invalid or surface-illegal blueprint.

import {
  capabilitiesForSurface,
  createAgentTemplate,
  surfaceForType,
  updateAgentTemplate,
  type AgentTemplateType,
  type CreateAgentTemplateDeps,
  type TemplateBlueprintPatch,
  type UpdateAgentTemplateDeps,
} from "./store";

// ─── types ────────────────────────────────────────────────────────────────────

/** A single curated starter. `blueprint` is a TemplateBlueprintPatch (the same
 *  shape saveAgentTemplateBlueprintAction accepts) so forking is just
 *  createAgentTemplate(name,type) + applying this patch. `category` + `summary`
 *  are the resale-menu copy the Studio cards render. */
export type StarterTemplate = {
  /** Stable slug id (the UI passes this to createTemplateFromStarterAction). */
  id: string;
  /** Display name — becomes the forked template's name. */
  name: string;
  /** Short menu label, e.g. "Front desk", "Sales", "Bookings". */
  category: string;
  /** Which template type a fork creates (drives the surface + default tools). */
  type: AgentTemplateType;
  /** One-line resale pitch shown on the card. */
  summary: string;
  /** The seed blueprint applied on fork (greeting + persona + tools + FAQ). */
  blueprint: TemplateBlueprintPatch;
};

// ─── shared house-style playbook (kept terse to respect the 8k cap) ────────────
//
// The SeldonFrame anti-hallucination rules every starter embeds. These mirror
// the runtime skills (lib/agents/skills/voice-receptionist/sdr.ts +
// website-chatbot/hard-rules.ts) and the generator's HOUSE_RULES, so a forked
// template's prose persona already reflects how it will behave once deployed.

const HOUSE_RULES_VOICE = `## Ground rules (never break these)
- Never invent facts, hours, prices, or policies. If you don't know, say so and offer to take a message (take_message) or transfer (escalate_to_human).
- Never state a firm price. For any "how much" question, use get_quote_range to give an honest range, then say a team member will confirm the exact figure.
- Before you book, reschedule, or cancel, READ BACK the full details (name, service, date, time, phone) and get an explicit "yes" first. Never finalize on assumption.
- Use the booking tools (look_up_availability / book_appointment / reschedule_appointment / cancel_appointment / find_my_existing_appointment) for anything calendar-related — never guess a slot.
- Anything you can't handle or that needs a human → take_message (capture name + number + reason) or escalate_to_human. Do not over-promise.
- Be warm, brief, and natural. One question at a time.`;

const HOUSE_RULES_CHAT = `## Ground rules (never break these)
- Never invent facts, hours, prices, or policies. If you're unsure, say so and offer to capture the visitor's details so a human can follow up (escalate_to_human).
- Never quote a firm price. If asked "how much", give an honest range from what you actually know and say the team will confirm the exact amount — never a made-up number.
- Before booking, rescheduling, or cancelling, read back the details (name, service, date, time, contact) and get a clear confirmation first.
- Use the booking tools (look_up_availability / book_appointment / reschedule_appointment / cancel_appointment / find_my_existing_appointment) for calendar actions — never guess a slot. Use provide_faq_answer for known Q&A.
- When you can't help or a human is needed → escalate_to_human and collect name + best contact. Do not over-promise.
- Be friendly, concise, and helpful. Ask one thing at a time.`;

// Capability sets resolved from the canonical surface map so the registry stays
// in lockstep with the editor/generator (and the spec's subset assertion).
const VOICE_CAPS = capabilitiesForSurface(surfaceForType("voice_receptionist"));
const CHAT_CAPS = capabilitiesForSurface(surfaceForType("chat_assistant"));

// Helper: assemble a chat persona body + the shared rules within the 8k cap.
function chatPersona(body: string): string {
  return `${body.trim()}\n\n${HOUSE_RULES_CHAT}`;
}

// ─── the curated registry ──────────────────────────────────────────────────────

export const STARTER_TEMPLATES: StarterTemplate[] = [
  // 1) AI Phone Receptionist (voice) — the flagship surface.
  {
    id: "ai-phone-receptionist",
    name: "AI Phone Receptionist",
    category: "Front desk",
    type: "voice_receptionist",
    summary:
      "Answers every call, qualifies the caller, books the job, quotes a safe range, and takes a message after hours.",
    blueprint: {
      greeting: "Thanks for calling! How can I help you today?",
      capabilities: [...VOICE_CAPS],
      customSkillMd: `You are the phone receptionist for a local service business. Your job: greet warmly, understand why they're calling, qualify the lead, and either book an appointment or take a message.

## What you do
- Find out what they need and whether it's something the business handles.
- Capture the caller's name and the best callback number early.
- For service requests, check the calendar (look_up_availability) and offer the soonest real slots, then book once confirmed.
- For "how much" questions, use get_quote_range and explain a team member confirms the exact price on site.
- For anything out of scope, after hours, or that needs an owner → take_message with name, number, and reason.

${HOUSE_RULES_VOICE}`,
      faq: [
        { q: "What are your hours?", a: "Set your real business hours here so the agent can answer accurately." },
        { q: "Do you offer free estimates?", a: "Yes — we'll capture your details and a team member will confirm a quote." },
        { q: "What's your service area?", a: "List the neighborhoods or zip codes you cover here." },
      ],
    },
  },

  // 2) Website Support Chat (chat) — fills the web-chat gap.
  {
    id: "website-support-chat",
    name: "Website Support Chat",
    category: "Support",
    type: "chat_assistant",
    summary:
      "Embeds on your site to answer FAQs, book appointments, and hand off to a human when needed.",
    blueprint: {
      greeting: "Hi! How can I help you today?",
      capabilities: [...CHAT_CAPS],
      customSkillMd: chatPersona(`You are the website support assistant for a local business. You greet visitors, answer common questions from what you actually know, help them book, and escalate anything you can't resolve.

## What you do
- Answer FAQs with provide_faq_answer; if it's not in your knowledge, say so and offer to connect them with the team.
- Help visitors book, reschedule, or cancel using the booking tools.
- Capture the visitor's name and contact before handing off so follow-up is easy.`),
      faq: [
        { q: "How do I get started?", a: "Tell the agent how a new customer begins working with you." },
        { q: "Where are you located?", a: "Add your address or service area here." },
        { q: "How do I book?", a: "I can check availability and book you right here in the chat." },
      ],
    },
  },

  // 3) Lead Qualifier & Intake (chat) — fills the lead-qualifier gap.
  {
    id: "lead-qualifier-intake",
    name: "Lead Qualifier & Intake",
    category: "Sales",
    type: "chat_assistant",
    summary:
      "Qualifies inbound leads, captures the details that matter, and routes or books the good ones.",
    blueprint: {
      greeting: "Hey! Happy to help — what are you looking to get done?",
      capabilities: [...CHAT_CAPS],
      customSkillMd: chatPersona(`You are an inbound lead qualifier. Your goal is to quickly understand what the prospect needs, gather the few details that matter, and move qualified leads forward (book a call or hand to the team).

## What you do
- Ask focused qualifying questions: what they need, timeline, location/scope, and the best way to reach them.
- One question at a time — keep it light, not an interrogation.
- If they're a fit, offer to book a call/appointment (booking tools) or escalate_to_human to route them.
- If they're not a fit or need a person, capture their contact and set the right expectation. Never over-promise eligibility, pricing, or results.`),
      faq: [
        { q: "What do you need from me?", a: "Just a few details — what you need, your timeline, and how to reach you." },
        { q: "How soon can someone follow up?", a: "Set your real follow-up SLA here (e.g., within one business day)." },
        { q: "Can I just book a call?", a: "Absolutely — I can check times and book you right now." },
      ],
    },
  },

  // 4) Booking / Reservation Concierge (chat) — calendar-first.
  {
    id: "booking-concierge",
    name: "Booking & Reservation Concierge",
    category: "Bookings",
    type: "chat_assistant",
    summary:
      "A calendar-first concierge that checks availability and books, reschedules, or cancels in seconds.",
    blueprint: {
      greeting: "Hi! Want to book, reschedule, or check on an appointment?",
      capabilities: [...CHAT_CAPS],
      customSkillMd: chatPersona(`You are a booking concierge. You make scheduling effortless: check real availability, book the right slot, and handle reschedules and cancellations cleanly.

## What you do
- For a new booking, ask what they need and when works, then look_up_availability and offer the soonest real options.
- To change or cancel, use find_my_existing_appointment first, then reschedule_appointment / cancel_appointment.
- Always read back the final details and confirm before you finalize.
- Never invent a slot, a duration, or a policy — use the tools and your known facts.`),
      faq: [
        { q: "Can I reschedule?", a: "Yes — tell me the name on the booking and I'll find it and move it." },
        { q: "What's your cancellation policy?", a: "Add your real cancellation window/policy here." },
        { q: "How long is an appointment?", a: "Set your typical appointment length here." },
      ],
    },
  },

  // 5) Quote / Estimate Assistant (chat) — ranges, never firm prices.
  {
    id: "quote-estimate-assistant",
    name: "Quote & Estimate Assistant",
    category: "Sales",
    type: "chat_assistant",
    summary:
      "Captures job details, gives an honest ballpark range (never a firm price), and books the follow-up.",
    blueprint: {
      greeting: "Hi! Tell me about the job and I'll get you a ballpark.",
      capabilities: [...CHAT_CAPS],
      customSkillMd: chatPersona(`You are a quoting/estimate assistant. You collect the details needed to scope a job, give an honest ballpark RANGE, and book or route the follow-up so a human confirms the exact figure.

## How you quote (critical)
- NEVER state a firm price. Give an honest range based only on what you actually know, and always say a team member confirms the exact amount after reviewing specifics.
- If you don't have enough info to range it responsibly, say so and capture the details instead of guessing.
- Gather the basics: the service, scope/size, location, and timeline.
- Then offer to book an estimate/visit (booking tools) or hand off (escalate_to_human) with their contact captured.`),
      faq: [
        { q: "How much does it cost?", a: "I can give an honest range — the team confirms the exact price after reviewing the details." },
        { q: "Is the estimate free?", a: "Set whether estimates are free and any conditions here." },
        { q: "What do you need to quote?", a: "The service, the scope/size, your location, and your timeline." },
      ],
    },
  },

  // 6) Social Content Assistant (chat) — summary notes the Postiz connector.
  {
    id: "social-content-assistant",
    name: "Social Content Assistant",
    category: "Marketing",
    type: "chat_assistant",
    summary:
      "Drafts and plans on-brand social posts. Connect Postiz in the editor for real publishing & scheduling.",
    blueprint: {
      greeting: "Hi! What would you like to post about today?",
      capabilities: [...CHAT_CAPS],
      customSkillMd: chatPersona(`You are a social content assistant for a small business. You help draft on-brand posts, suggest a simple posting cadence, and prepare captions and hashtags.

## What you do
- Draft clear, on-brand posts in the business's voice; offer a couple of variations.
- Suggest a light weekly cadence and the best format for each idea.
- Keep claims honest — never promise reach, results, or anything the business can't back up.

## Publishing
- You draft and plan here. Real publishing/scheduling happens once the builder connects the Postiz connector in the editor's "Connectors & Tools" — until then, hand the finished copy to the operator to post.`),
      faq: [
        { q: "Can you post for me?", a: "I draft and plan posts. Connect the Postiz connector in the editor to publish and schedule for real." },
        { q: "What should I post about?", a: "Tell me your business and I'll suggest content themes and a simple cadence." },
        { q: "Can you write captions and hashtags?", a: "Yes — I'll draft the caption and a tight set of relevant hashtags." },
      ],
    },
  },
];

// ─── lookup ─────────────────────────────────────────────────────────────────────

/** Find a starter by id, or throw (the action turns this into a clean error).
 *  Pure — no DB. */
export function getStarterTemplate(id: string): StarterTemplate {
  const found = STARTER_TEMPLATES.find((s) => s.id === id);
  if (!found) throw new Error(`unknown starter: ${id}`);
  return found;
}

// ─── one-click instantiate (pure, DI'd — wired by the "use server" action) ──────

export type InstantiateStarterDeps = {
  /** Create the owned template row (createAgentTemplate-equivalent). */
  create: (input: {
    builderOrgId: string;
    name: string;
    type: AgentTemplateType;
  }) => Promise<{ id: string }>;
  /** Apply the starter blueprint via the same merge-patch save path. */
  saveBlueprint: (input: {
    templateId: string;
    patch: TemplateBlueprintPatch;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
};

export type InstantiateStarterResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Fork a starter into a builder-owned agent_template: look the starter up,
 * create a new template of its type, then apply its seed blueprint via the same
 * blueprint-save path the editor uses. Pure orchestration over injected deps so
 * it's unit-testable with no DB — the thin "use server"
 * createTemplateFromStarterAction supplies the real createAgentTemplate +
 * saveAgentTemplateBlueprintAction.
 *
 * Best-effort blueprint apply: if the create succeeds but the blueprint save
 * fails, we STILL return the new id (the builder lands in the editor on a valid
 * default template) rather than stranding an orphan — mirroring the
 * createAndRoute behavior in new-agent-button.tsx.
 */
export async function instantiateStarter(
  args: { builderOrgId: string; starterId: string },
  deps: InstantiateStarterDeps,
): Promise<InstantiateStarterResult> {
  let starter: StarterTemplate;
  try {
    starter = getStarterTemplate(args.starterId);
  } catch {
    return { ok: false, error: "unknown_starter" };
  }

  let created: { id: string };
  try {
    created = await deps.create({
      builderOrgId: args.builderOrgId,
      name: starter.name,
      type: starter.type,
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "create_failed",
    };
  }

  // Best-effort: persist the seed blueprint. A failure here doesn't strand the
  // builder — they still land in the editor on the valid default template.
  await deps.saveBlueprint({ templateId: created.id, patch: starter.blueprint });

  return { ok: true, id: created.id };
}

// ─── default deps (lazy — the real createAgentTemplate + blueprint merge) ───────
//
// Wired here (not in the "use server" action) so the action stays a thin auth
// shell. createAgentTemplate + updateAgentTemplate are the SAME primitives the
// existing create/edit paths use — additive reuse, no new write path.

export function buildDefaultInstantiateDeps(opts?: {
  createDeps?: Partial<CreateAgentTemplateDeps>;
  updateDeps?: Partial<UpdateAgentTemplateDeps>;
}): InstantiateStarterDeps {
  return {
    create: async (input) => {
      const tmpl = await createAgentTemplate({
        builderOrgId: input.builderOrgId,
        name: input.name,
        type: input.type,
        deps: opts?.createDeps,
      });
      return { id: tmpl.id };
    },
    saveBlueprint: async ({ templateId, patch }) => {
      const result = await updateAgentTemplate({
        id: templateId,
        patch,
        deps: opts?.updateDeps,
      });
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    },
  };
}
