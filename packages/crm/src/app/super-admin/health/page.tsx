import { PlaceholderTab } from "../placeholder-tab";

export default function HealthTabPage() {
  return (
    <PlaceholderTab
      title="Health"
      ship="v1.35.5"
      summary="Is the platform up and fast? The technical pulse alongside the business numbers."
      bullets={[
        "API error rate (5xx % over time, with recent incidents annotated)",
        "p95 / p99 latency for the public landing pages, the chatbot embed, and the MCP routes",
        "Vercel Workflows run success rate (the post-booking reminders + future durable flows)",
        "LLM provider observed uptime (Anthropic, OpenAI — as we see them from the runtime)",
        "Sentry-style error feed for the SF platform itself (separate from operator-side errors)",
        "Status banners that auto-publish when error rate or latency crosses thresholds",
      ]}
    />
  );
}
