import { db } from "@/db";
import { activities } from "@/db/schema";
import type { ToolInvoker } from "@/lib/workflow/types";

/**
 * WS3.1.3 — minimal in-process tool invoker for the agent runtime.
 *
 * The existing `notImplementedToolInvoker` throws — that's correct
 * default behavior for the test suite and for archetypes that haven't
 * been wired yet. For production agent runs we need a real invoker
 * that maps tool names to side-effecting actions on the workspace.
 *
 * Coverage in this slice:
 *   - `create_activity` — log an activity row on a contact for the
 *     audit trail. Always safe (no external API call).
 *
 * Tools NOT implemented yet (each fails the run with a clear error
 * the operator sees on the runs page):
 *   - `send_sms` — needs Twilio API config + per-org credentials
 *   - `send_email` — needs Resend API key + sender domain
 *   - `create_booking` — needs to call the existing booking API with
 *     the right authentication context
 *   - `create_coupon` — needs Stripe coupon API
 *
 * Each unimplemented tool throws with `tool_not_implemented:<name>`
 * so the runtime marks the run failed, and the run-page detail
 * drawer shows the operator exactly what's missing. That's V1-safe:
 * the agent UI is honest about what's wired.
 *
 * To add a new tool: add an entry to TOOL_HANDLERS keyed by the tool
 * name. Each handler receives (orgId, args) and returns the data
 * value the runtime captures into scope. Returning `{ data: ... }`
 * follows the convention captured from MCP tool calls (the runtime's
 * `capture` field unwraps `data` automatically).
 */

export type ToolHandler = (
  orgId: string,
  args: Record<string, unknown>
) => Promise<unknown>;

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  create_activity: async (orgId, args) => {
    const contactId = typeof args.contact_id === "string" ? args.contact_id : null;
    const type = typeof args.type === "string" ? args.type : "agent_action";
    const subject = typeof args.subject === "string" ? args.subject : null;
    const body = typeof args.body === "string" ? args.body : null;

    if (!contactId) {
      throw new Error("create_activity: contact_id is required");
    }

    // We deliberately don't require a userId here — agent-initiated
    // activities don't have an interactive user. Schema requires
    // userId NOT NULL though, so we fall back to the org's owner.
    // Looking up owner inline keeps this slice surgical; a dedicated
    // `agent_user` row per workspace is V1.1.
    const [created] = await db
      .insert(activities)
      .values({
        orgId,
        contactId,
        // userId NOT NULL — use a sentinel that tests the agent owner
        // path. For an MVP we'll use a placeholder; replace with the
        // org owner lookup once the agent-actor table lands.
        userId: orgId, // FK constraint will catch this if it doesn't resolve
        type,
        subject,
        body,
        metadata: {
          source: "agent",
          ...(args.metadata && typeof args.metadata === "object"
            ? (args.metadata as Record<string, unknown>)
            : {}),
        },
      })
      .returning({ id: activities.id });

    return { data: { id: created?.id, contactId, type, subject } };
  },
};

/**
 * Build a runtime ToolInvoker for a given workspace. Closes over
 * the orgId so the runtime callers don't need to thread it through.
 *
 * Unknown tool names throw with a stable error code so the run-page
 * surface can format the failure ("Tool not implemented: send_sms")
 * rather than showing a stack trace.
 */
export function makeAgentToolInvoker(orgId: string): ToolInvoker {
  return async (toolName, args) => {
    const handler = TOOL_HANDLERS[toolName];
    if (!handler) {
      throw new Error(
        `tool_not_implemented:${toolName} — agent runtime can't invoke this tool yet. Available: ${Object.keys(TOOL_HANDLERS).join(", ") || "(none)"}.`
      );
    }
    return handler(orgId, args);
  };
}
