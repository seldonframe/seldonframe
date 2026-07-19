// Deterministic replay — Reelier phase 2c, ops hardening. An EXPLICIT
// allowlist of SF's own known tool names -> their REAL side effect, read
// from this codebase (not inferred from a name/verb heuristic).
//
// WHY THIS EXISTS: replay-before-llm.ts's passesAllReadGate previously
// trusted a compiled skill's own `effect:` line verbatim — text produced by
// reelier's compiler from a verb-prefix heuristic over the tool NAME (e.g.
// "get_*"/"list_*"/"search_*" -> read). A hypothetical tool named
// `search_and_purge` would classify as 'read' under that heuristic even
// though it deletes data — the gate would then treat it as safe to replay
// anywhere in the sequence, not just as the bounded final step. This module
// is the fix: SF's OWN tools are classified here, by hand, from reading
// their actual execute() bodies (see the two maps below) — never from their
// name. Any tool NOT in this map is UNKNOWN, and effectForTool returns
// undefined for it; the caller (replay-before-llm.ts) must treat undefined
// as "never read, never idempotent-write" — i.e. destructive by default —
// so an unknown tool can only ever appear as the gate's single bounded
// final step, exactly like a genuinely destructive one, regardless of what
// the compiled skill_md's text claims about it.
import type { ReelierEffect } from "@seldonframe/reelier/skill";

export type Effect = ReelierEffect;

/**
 * Native agent tools — lib/agents/tools.ts's ALL_TOOLS plus the opt-in
 * draft_for_approval capability tool (never in ALL_TOOLS itself, appended by
 * getToolsForCapabilities only when the DRAFT_FOR_APPROVAL_CAPABILITY is
 * requested). Classified by reading each tool's execute():
 *  - look_up_availability / find_my_existing_appointment / get_quote_range:
 *    pure reads off calendar/blueprint state, no DB write.
 *  - provide_faq_answer: pure in-memory search over blueprint.faq, no I/O.
 *  - escalate_to_human: writes portal_messages + activities rows only — an
 *    internal CRM record, no external send (no email/SMS call site).
 *  - draft_for_approval: creates an inert agent_action_drafts row awaiting a
 *    human's approval (the never-fail-compile precedent) — nothing external
 *    happens until a human acts on it separately.
 *  - book_appointment / reschedule_appointment / cancel_appointment: commit
 *    a real booking change (create/move/cancel a calendar commitment).
 *  - take_message: sends a REAL operator SMS via sendSmsFromApi (Twilio) —
 *    an external send, even though the recipient is the operator's own team
 *    rather than the caller.
 */
const NATIVE_TOOL_EFFECTS: Record<string, Effect> = {
  look_up_availability: "read",
  find_my_existing_appointment: "read",
  provide_faq_answer: "read",
  get_quote_range: "read",
  escalate_to_human: "idempotent-write",
  draft_for_approval: "idempotent-write",
  book_appointment: "destructive",
  reschedule_appointment: "destructive",
  cancel_appointment: "destructive",
  take_message: "destructive",
};

/**
 * Composio-connector tools — the curated default allowlist per toolkit
 * (lib/integrations/composio/catalog.ts's DEFAULT_TOOLS_BY_TOOLKIT). Slugs
 * follow Composio's own `{TOOLKIT}_{ACTION}` convention. Classified by each
 * action's documented behavior, not by the SEND/CREATE/LIST prefix alone:
 *  - *_SEND_EMAIL, *_SEND_MESSAGE, *_CREATE_EVENT (calendar — typically
 *    emails attendees an invite), *_CREATE_INVOICE (issues a real invoice):
 *    a real external send / booking / financial document. destructive.
 *  - *_FETCH_*, *_LIST_*, *_FIND_*, *_SEARCH_*, *_GET_*, *_QUERY_*,
 *    *_DOWNLOAD_*: read-only lookups.
 *  - *_CREATE_EMAIL_DRAFT, *_ADD_LABEL_*, *_MODIFY_*_LABELS, *_CREATE_LABEL,
 *    *_CREATE_FILE, *_CREATE_PAGE, *_CREATE_CONTACT, *_CREATE_DEAL,
 *    *_CREATE_CUSTOMER, *_BATCH_MOVE_MESSAGES, *_UPDATE_EMAIL_MESSAGE: a
 *    mutation confined to the connected account/workspace itself (labels,
 *    drafts, CRM/file records) — never a message or document reaching a
 *    third party. idempotent-write.
 */
const COMPOSIO_TOOL_EFFECTS: Record<string, Effect> = {
  // Gmail
  GMAIL_SEND_EMAIL: "destructive",
  GMAIL_FETCH_EMAILS: "read",
  GMAIL_CREATE_EMAIL_DRAFT: "idempotent-write",
  GMAIL_ADD_LABEL_TO_EMAIL: "idempotent-write",
  GMAIL_MODIFY_THREAD_LABELS: "idempotent-write",
  GMAIL_LIST_LABELS: "read",
  GMAIL_CREATE_LABEL: "idempotent-write",
  // Google Calendar
  GOOGLECALENDAR_CREATE_EVENT: "destructive",
  GOOGLECALENDAR_FIND_FREE_SLOTS: "read",
  GOOGLECALENDAR_FIND_EVENT: "read",
  GOOGLECALENDAR_LIST_EVENTS: "read",
  // Google Drive
  GOOGLEDRIVE_FIND_FILE: "read",
  GOOGLEDRIVE_CREATE_FILE: "idempotent-write",
  GOOGLEDRIVE_DOWNLOAD_FILE: "read",
  // Slack
  SLACK_SEND_MESSAGE: "destructive",
  SLACK_LIST_CHANNELS: "read",
  SLACK_FETCH_CONVERSATION_HISTORY: "read",
  // Notion
  NOTION_CREATE_PAGE: "idempotent-write",
  NOTION_SEARCH: "read",
  NOTION_QUERY_DATABASE: "read",
  // HubSpot
  HUBSPOT_CREATE_CONTACT: "idempotent-write",
  HUBSPOT_SEARCH_CONTACTS: "read",
  HUBSPOT_CREATE_DEAL: "idempotent-write",
  // QuickBooks
  QUICKBOOKS_CREATE_INVOICE: "destructive",
  QUICKBOOKS_CREATE_CUSTOMER: "idempotent-write",
  QUICKBOOKS_LIST_INVOICES: "read",
  // Outlook
  OUTLOOK_SEND_EMAIL: "destructive",
  OUTLOOK_LIST_MESSAGES: "read",
  OUTLOOK_CALENDAR_CREATE_EVENT: "destructive",
  OUTLOOK_CALENDAR_GET_SCHEDULE: "read",
  OUTLOOK_LIST_MAIL_FOLDERS: "read",
  OUTLOOK_BATCH_MOVE_MESSAGES: "idempotent-write",
  OUTLOOK_UPDATE_EMAIL_MESSAGE: "idempotent-write",
};

const TOOL_EFFECTS: Record<string, Effect> = {
  ...NATIVE_TOOL_EFFECTS,
  ...COMPOSIO_TOOL_EFFECTS,
};

/**
 * Strip any number of leading `<namespace>__` groups off a recorded tool
 * name. Recorded/traced tool names carry the SAME namespace prefix the
 * runtime wraps them with before handing them to the model — this
 * allowlist is keyed by the bare action name, so a lookup on the raw
 * recorded name always misses:
 *  - Composio connector tools: `composio__<TOOLKIT_ACTION>` — the fixed
 *    `composio` namespace (COMPOSIO_TOOL_NAMESPACE in
 *    lib/integrations/composio/connector.ts), e.g.
 *    `composio__GMAIL_FETCH_EMAILS`.
 *  - Generic MCP connector tools: `<serviceName>__<toolName>` — an
 *    arbitrary per-connector serviceName (lib/agents/mcp/wrap-tool.ts),
 *    so the namespace itself isn't a fixed string.
 * Native SF tools (book_appointment, look_up_availability, ...) are never
 * namespaced and pass through unchanged. Only a `__`-delimited prefix is
 * stripped — never a fuzzy match — so an unrelated name is returned as-is
 * and still misses the allowlist (stays UNKNOWN, still destructive by
 * default).
 */
export function normalizeToolName(name: string): string {
  return name.replace(/^(?:[A-Za-z0-9-]+__)+/, "");
}

/**
 * Look up a tool's REAL effect from this explicit allowlist. Tries the
 * exact recorded name first, then the name with any leading
 * `<namespace>__` prefix(es) stripped (normalizeToolName) — so a recorded
 * `composio__GMAIL_FETCH_EMAILS` matches this table's `GMAIL_FETCH_EMAILS`
 * entry. Returns `undefined` for any name not in the map either way — an
 * unknown tool, NEVER a guess. Callers must treat `undefined` as untrusted
 * (never 'read', never 'idempotent-write') — see replay-before-llm.ts's
 * passesAllReadGate, the only caller with a safety contract riding on this.
 */
export function effectForTool(name: string): Effect | undefined {
  const exact = TOOL_EFFECTS[name];
  if (exact !== undefined) return exact;
  return TOOL_EFFECTS[normalizeToolName(name)];
}

/** Total tool names this allowlist explicitly classifies. Exposed for the
 *  ops CLI + tests — not itself load-bearing on the gate. */
export function allowlistSize(): number {
  return Object.keys(TOOL_EFFECTS).length;
}

/** The full name -> Effect map, read-only. Exposed for the ops CLI's
 *  `compile` warning line (flagging any compiled step whose tool isn't
 *  allowlisted 'read') without duplicating this table elsewhere. */
export function listToolEffects(): ReadonlyArray<[string, Effect]> {
  return Object.entries(TOOL_EFFECTS);
}
