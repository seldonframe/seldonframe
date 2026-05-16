// v1.55.1 — Default public surface for new workspaces when no landing
// page is generated. The chatbot loads as a floating widget in the
// bottom corner (via embed.js). This page renders the workspace's
// branded header, a 6-step launch wizard for the agency operator,
// and a copy-snippet helper.
//
// The wizard replaces the v1.55.0 "Try the AI receptionist" pill —
// operators landed on this preview page asking "what now?" The wizard
// answers that explicitly: test → customize → eval → promote → embed →
// watch leads. Each numbered step links to the exact dashboard URL the
// operator needs.
//
// Theme tokens (--sf-bg, --sf-text, --sf-primary, --sf-accent) are
// applied by the existing PublicThemeProvider higher in the tree.
// The component just consumes them via CSS variables — no theme
// prop drilling required.

import type { ChatbotPreviewSectionContent } from "./types";

const AGENTS_URL = "https://app.seldonframe.com/agents";
const CONTACTS_URL = "https://app.seldonframe.com/contacts";

type WizardStep = {
  /** Emoji rendered before the heading — visual anchor for scanning. */
  emoji: string;
  /** Short bold heading. */
  title: string;
  /** Optional href — when set, the description text and any inline
   *  URLs become a single clickable link. */
  href?: string;
  /** Body content. Inline JSX so we can mix prose and links. */
  body: React.ReactNode;
};

const STEPS: WizardStep[] = [
  {
    emoji: "✅",
    title: "Test the chatbot",
    body: "It's live in the bottom-right corner — try a question.",
  },
  {
    emoji: "📝",
    title: "Customize behavior",
    body: (
      <>
        Edit FAQ, voice, tools at{" "}
        <a
          href={AGENTS_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--sf-accent)", textDecoration: "underline" }}
        >
          app.seldonframe.com/agents
        </a>
        . Or ask Claude Code:{" "}
        <em>&ldquo;update the chatbot&apos;s FAQ to mention financing&rdquo;</em>
      </>
    ),
  },
  {
    emoji: "🧪",
    title: "Run evals to ensure safety",
    body: (
      <>
        <a
          href={AGENTS_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--sf-accent)", textDecoration: "underline" }}
        >
          app.seldonframe.com/agents
        </a>{" "}
        → Run evals. Make sure it answers correctly before going live.
      </>
    ),
  },
  {
    emoji: "🚀",
    title: "Promote TEST → LIVE",
    body: (
      <>
        <a
          href={AGENTS_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--sf-accent)", textDecoration: "underline" }}
        >
          app.seldonframe.com/agents
        </a>{" "}
        → Publish.
      </>
    ),
  },
  {
    emoji: "🌐",
    title: "Paste on your client's site",
    body: (
      <>
        Snippet is below — paste before <code>&lt;/body&gt;</code>.
      </>
    ),
  },
  {
    emoji: "📊",
    title: "Watch leads come in",
    body: (
      <a
        href={CONTACTS_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "var(--sf-accent)", textDecoration: "underline" }}
      >
        app.seldonframe.com/contacts
      </a>
    ),
  },
];

export function ChatbotPreviewSection(props: ChatbotPreviewSectionContent) {
  const { businessName, tagline, embedUrl } = props;
  const snippet = `<script src="${embedUrl}" async></script>`;

  return (
    <section
      className="min-h-screen flex flex-col items-center justify-center px-6 py-12"
      style={{
        backgroundColor: "var(--sf-bg)",
        color: "var(--sf-text)",
      }}
    >
      <div className="max-w-2xl w-full mx-auto">
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
            {businessName}
          </h1>
          <p
            className="mt-3 text-base md:text-lg opacity-70"
            style={{ color: "var(--sf-text)" }}
          >
            {tagline}
          </p>
        </div>

        {/* 6-step operator launch wizard. Replaces the v1.55.0 "Try the
            AI receptionist" pill — operators wanted explicit next steps.
            The chat-bubble SVG icon now sits next to step 1 as a visual
            anchor for "the widget is in the corner — try it now."
            The chat widget itself is mounted by the public page route
            handler via setPublicChatbotEmbed (registered at v2/complete
            time) — we don't inject a <script> tag from this component. */}
        <div
          className="mt-12 rounded-2xl border p-6 md:p-8"
          style={{
            borderColor: "var(--sf-accent)",
            backgroundColor: "var(--sf-bg)",
          }}
        >
          <div className="flex items-center gap-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ color: "var(--sf-accent)" }}
            >
              <path d="M8 9h8" />
              <path d="M8 13h6" />
              <path d="M9 18h-3a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-3l-3 3l-3 -3z" />
            </svg>
            <h2 className="text-lg md:text-xl font-semibold">
              6 steps to launch your AI receptionist
            </h2>
          </div>
          <ol className="mt-6 space-y-5">
            {STEPS.map((step, idx) => (
              <li key={step.title} className="flex gap-4">
                <span
                  className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold"
                  style={{
                    backgroundColor: "var(--sf-accent)",
                    color: "var(--sf-bg)",
                  }}
                  aria-hidden="true"
                >
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm md:text-base font-semibold">
                    <span aria-hidden="true">{step.emoji}</span>
                    <span>{step.title}</span>
                  </div>
                  <div
                    className="mt-1 text-sm opacity-75 leading-relaxed"
                    style={{ color: "var(--sf-text)" }}
                  >
                    {step.body}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Operator helper: the embed snippet to copy onto the client's
            existing site. The agency operator's primary takeaway from
            this page. Preserved unchanged from v1.55.0. */}
        <div
          className="mt-12 pt-8 border-t text-left"
          style={{ borderColor: "var(--sf-accent)", opacity: 0.85 }}
        >
          <p className="text-sm font-medium">
            Want this on your site? Paste before <code>&lt;/body&gt;</code>:
          </p>
          <pre
            className="mt-3 rounded-lg p-4 text-xs overflow-x-auto"
            style={{
              backgroundColor: "var(--sf-text)",
              color: "var(--sf-bg)",
            }}
          >
            <code>{snippet}</code>
          </pre>
          <p className="mt-4 text-xs opacity-60">
            Or skip the paste — share this URL with your customers directly.
          </p>
        </div>
      </div>
    </section>
  );
}
