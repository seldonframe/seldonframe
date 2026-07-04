// 2026-07-04 — Generic server-side PostHog capture, extracted as the sibling
// of mcp-capture.ts (Task 6 of the win-ladder + SeldonChat plan). Holds the
// lazy module-singleton posthog-node client (moved out of mcp-capture.ts so
// non-MCP server code — e.g. the activation-ladder funnel stamps — can fire
// events through the SAME client without duplicating the env/host/no-op
// posture) plus one small generic capture helper for arbitrary named events.
//
// mcp-capture.ts imports getPosthogClient() back from here; its own exported
// behavior is unchanged — see that file's captureMcpToolCall for the MCP-
// specific event taxonomy this module does NOT know about.
//
// DELIVERY + FAIL-SILENT posture (byte-for-byte identical to the client this
// was extracted from): serverless-safe captureImmediate (unbuffered single-
// event POST, since a Vercel function can freeze the instant the response is
// sent), called fire-and-forget (never awaited) with a .catch swallow, and a
// complete no-op when NEXT_PUBLIC_POSTHOG_KEY isn't configured — reuses the
// existing client-side key, no new env var.

import { PostHog } from "posthog-node";

const POSTHOG_HOST = "https://us.i.posthog.com";

let client: PostHog | null | undefined;

/** Lazy-init the module-singleton posthog-node client. Returns null (and
 *  caches the null) when no key is configured, so every subsequent call is a
 *  cheap no-op check rather than repeating the env read. */
export function getPosthogClient(): PostHog | null {
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

export type CaptureServerEventInput = {
  event: string;
  distinctId: string;
  properties?: Record<string, string | number | boolean | null>;
};

/**
 * Capture one arbitrary named server-side event to PostHog. Fire-and-silent:
 * never throws, never awaited by the caller (this function returns void),
 * no-ops entirely when NEXT_PUBLIC_POSTHOG_KEY is absent.
 */
export function captureServerEvent(input: CaptureServerEventInput): void {
  try {
    const ph = getPosthogClient();
    if (!ph) return;

    void ph
      .captureImmediate({
        distinctId: input.distinctId,
        event: input.event,
        properties: input.properties ?? {},
      })
      .catch(() => {
        // Swallow — a capture failure must be invisible to the caller.
      });
  } catch {
    // Never let a capture-construction bug reach the caller's request path.
  }
}
