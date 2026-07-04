import posthog from "posthog-js";

// PostHog Cloud US, project 497925. The key is the PUBLISHABLE client key —
// public by design (ships in the bundle); revenue/PII stays server-side.
// api_host points at our own /ingest reverse proxy (next.config rewrites →
// us.i.posthog.com) so ad-blockers don't eat events; ui_host keeps deep links
// into the PostHog app working.
if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2025-05-24",
    capture_exceptions: true, // error tracking product
  });
}
