// 2026-07-04 — Server-side PostHog capture of MCP tool calls, SERVER HALF of
// the MCP-analytics wave (client-side posthog-js already merged via
// instrumentation-client.ts + the /ingest proxy). This module instruments the
// three FIRST-PARTY MCP surfaces in this backend (builder mcp.seldonframe.com/v1,
// the agent-marketplace rental MCP, the ChatGPT MCP app). It deliberately does
// NOT touch skills/mcp-server (the shipped OSS connector) — that would
// contradict the privacy policy already submitted to Anthropic's directory.
//
// EVENT TAXONOMY (matched to @posthog/mcp so PostHog's own MCP-analytics
// product — the "Listening for your first MCP event…" onboarding screen and
// its dashboards — recognizes these events):
//   Scratch-installed @posthog/mcp@0.8.0 into the scratchpad (never added as a
//   crm dependency) and read its source. The constants are hard-coded in
//   node_modules/@posthog/mcp/src/extensions/constants.ts:
//     event name:      $mcp_tool_call            (PostHogMCPAnalyticsEvent.ToolCall)
//     properties used here:
//       $mcp_tool_name       — the tool's name (constants.ToolName)
//       $mcp_duration_ms     — call duration in ms (constants.DurationMs)
//       $mcp_is_error        — boolean (constants.IsError)
//       $mcp_error_type      — coarse error class, only when isError (constants.ErrorType)
//       $mcp_server_name     — which of our 3 servers handled the call (constants.ServerName)
//       $mcp_source          — POSTHOG_MCP_ANALYTICS_SOURCE = 'posthog_mcp_analytics' (constants.Source)
//   We do NOT use the @posthog/mcp package or its McpEventSink — that class
//   expects a live MCP SDK Server instance to hang lifecycle hooks off of,
//   which none of our 3 hand-rolled JSON-RPC routers construct. Instead this
//   module calls `posthog.capture()` directly with the SAME event name +
//   property keys @posthog/mcp emits, so the dashboards key off it identically.
//   NOTE ($mcp_source): @posthog/mcp stamps this on every event exactly as
//   'posthog_mcp_analytics' regardless of the actual SDK; that's the taxonomy
//   value the dashboards filter on, not a claim that we're running their SDK.
//
// PRIVACY (hard rule from the brief): NEVER send tool ARGUMENT VALUES or
// RESULTS — only the tool name, argument KEY NAMES (argKeys, not values),
// error code/class, timing, surface, and org/distinct ids. No raw bearer/
// rental tokens ever leave this module — see hashToken() below.
//
// DELIVERY: serverless (Vercel functions can freeze/terminate the instant the
// response is sent), so this uses posthog-node's captureImmediate — an
// awaited, unbuffered single-event POST — rather than the default batched
// queue (flushAt/flushInterval), which could be dropped once the function
// suspends. Every call site fires this WITHOUT awaiting the returned promise
// (fire-and-forget with a .catch swallow), so capture adds zero blocking
// latency to the MCP response path beyond scheduling the request.
//
// FAIL-SILENT: no key configured → captureMcpToolCall is a no-op (dev/self-
// host safe, no new env var — reuses NEXT_PUBLIC_POSTHOG_KEY, already set in
// Vercel for the client-side capture). Any error constructing/sending the
// event is caught and swallowed; a capture failure must be invisible to the
// MCP caller and never change tools/call response behavior.

import crypto from "node:crypto";
import { PostHog } from "posthog-node";

const POSTHOG_HOST = "https://us.i.posthog.com";

// PostHog's own MCP-analytics taxonomy (@posthog/mcp/src/extensions/constants.ts).
const MCP_TOOL_CALL_EVENT = "$mcp_tool_call";
const PROP_TOOL_NAME = "$mcp_tool_name";
const PROP_DURATION_MS = "$mcp_duration_ms";
const PROP_IS_ERROR = "$mcp_is_error";
const PROP_ERROR_TYPE = "$mcp_error_type";
const PROP_SERVER_NAME = "$mcp_server_name";
const PROP_SOURCE = "$mcp_source";
const MCP_ANALYTICS_SOURCE = "posthog_mcp_analytics";

let client: PostHog | null | undefined;

/** Lazy-init the module-singleton posthog-node client. Returns null (and
 *  caches the null) when no key is configured, so every subsequent call is a
 *  cheap no-op check rather than repeating the env read. */
function getClient(): PostHog | null {
  if (client !== undefined) return client;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    client = null;
    return client;
  }

  try {
    client = new PostHog(key, { host: POSTHOG_HOST });
  } catch {
    // Constructing the client itself must never throw into a caller's request
    // path — treat any construction failure as "capture disabled".
    client = null;
  }
  return client;
}

/** sha256 a bearer/rental token so it never leaves this process in the
 *  clear — used only as a LAST-RESORT distinct id when no org id is
 *  resolvable (matches the existing crypto.createHash("sha256") pattern in
 *  lib/utils/api-auth.ts). Never logged, never sent as a property — only the
 *  resulting hash becomes the distinct_id. */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 32);
}

/** Resolve a stable, non-PII distinct id: the org id when resolvable, else a
 *  hash of the bearer/rental token, else "anonymous". Never the raw token. */
export function resolveMcpDistinctId(input: { orgId?: string | null; bearerToken?: string | null }): string {
  if (input.orgId) return input.orgId;
  if (input.bearerToken) return `mcp_token_${hashToken(input.bearerToken)}`;
  return "anonymous";
}

export type McpSurface = "builder" | "agent_rental" | "chatgpt";

export interface CaptureMcpToolCallInput {
  /** Which of the three first-party MCP surfaces handled the call. */
  surface: McpSurface;
  /** The tool's name (e.g. "discover", "ask", "deploy_agent"). Never the args. */
  tool: string;
  /** Stable, non-PII distinct id — see resolveMcpDistinctId. */
  distinctId: string;
  /** The workspace/org this call ran against, when resolvable. */
  orgId?: string | null;
  /** Whether the tool call resolved successfully. */
  success: boolean;
  /** Call duration in milliseconds, when timed. */
  durationMs?: number;
  /** A coarse error class/code — NEVER a full error message with user data. */
  errorCode?: string | null;
  /** Argument KEY NAMES only (never values) — e.g. ["query", "limit"]. */
  argKeys?: string[];
}

/**
 * Capture one MCP `tools/call` event to PostHog, matching @posthog/mcp's
 * `$mcp_tool_call` taxonomy. Fire-and-silent: never throws, never awaited by
 * the caller (this function returns void), no-ops entirely when
 * NEXT_PUBLIC_POSTHOG_KEY is absent. Call ONLY for tools/call — never for
 * initialize/ping/list/other JSON-RPC methods.
 */
export function captureMcpToolCall(input: CaptureMcpToolCallInput): void {
  try {
    const ph = getClient();
    if (!ph) return;

    const properties: Record<string, unknown> = {
      [PROP_SOURCE]: MCP_ANALYTICS_SOURCE,
      [PROP_TOOL_NAME]: input.tool,
      [PROP_SERVER_NAME]: `seldonframe_${input.surface}`,
      [PROP_IS_ERROR]: !input.success,
      mcp_surface: input.surface,
    };
    if (input.durationMs !== undefined) {
      properties[PROP_DURATION_MS] = input.durationMs;
    }
    if (!input.success && input.errorCode) {
      properties[PROP_ERROR_TYPE] = input.errorCode;
    }
    if (input.orgId) {
      properties.org_id = input.orgId;
    }
    if (input.argKeys && input.argKeys.length > 0) {
      properties.mcp_arg_keys = input.argKeys;
    }
    // No identified org/user → don't mint a person profile per anonymous
    // caller (matches @posthog/mcp's own $process_person_profile guard).
    if (!input.orgId) {
      properties.$process_person_profile = false;
    }

    void ph
      .captureImmediate({
        distinctId: input.distinctId,
        event: MCP_TOOL_CALL_EVENT,
        properties,
      })
      .catch(() => {
        // Swallow — a capture failure must be invisible to the MCP caller.
      });
  } catch {
    // Never let a capture-construction bug reach the MCP response path.
  }
}
