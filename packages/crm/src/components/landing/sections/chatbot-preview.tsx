// v1.55.0 — Default public surface for new workspaces when no landing
// page is generated. The chatbot loads as a floating widget in the
// bottom corner (via embed.js). This page renders the workspace's
// branded header, a callout pointing to the corner widget, and the
// copy-snippet helper for the agency operator.
//
// Theme tokens (--sf-bg, --sf-text, --sf-primary, --sf-accent) are
// applied by the existing PublicThemeProvider higher in the tree.
// The component just consumes them via CSS variables — no theme
// prop drilling required.

import type { ChatbotPreviewSectionContent } from "./types";

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
      <div className="max-w-2xl w-full mx-auto text-center">
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
          {businessName}
        </h1>
        <p
          className="mt-3 text-base md:text-lg opacity-70"
          style={{ color: "var(--sf-text)" }}
        >
          {tagline}
        </p>

        {/* Callout pointing to the floating widget. The embed.js script
            below mounts the chatbot as a floating widget in the bottom
            corner (bottom-right or bottom-left depending on theme).
            We don't render a placeholder div here — the widget is the
            chat UI. */}
        <div
          className="mt-12 inline-flex items-center gap-3 rounded-full px-6 py-3 text-sm font-medium"
          style={{
            backgroundColor: "var(--sf-accent)",
            color: "var(--sf-bg)",
            opacity: 0.95,
          }}
        >
          <span>Try the AI receptionist</span>
          <span className="text-lg" aria-hidden="true">↘</span>
        </div>
        <p className="mt-3 text-xs opacity-50">
          Chat widget loads in the corner of this page.
        </p>

        {/* Embed script — mounts the floating widget */}
        <script async src={embedUrl} />

        {/* Operator helper: the embed snippet to copy onto the client's
            existing site. The agency operator's primary takeaway from
            this page. */}
        <div
          className="mt-16 pt-8 border-t text-left"
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
