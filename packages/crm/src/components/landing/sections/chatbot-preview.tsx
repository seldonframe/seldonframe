// v1.55.0 — Default public surface for new workspaces when no landing
// page is generated. Renders a full-page branded chat interface
// (NOT the floating widget) so the agency operator can share a URL
// with their client to demo the AI receptionist before pasting the
// embed snippet on the client's existing site.
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
      <div className="max-w-3xl w-full mx-auto text-center">
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
          {businessName}
        </h1>
        <p
          className="mt-3 text-base md:text-lg opacity-70"
          style={{ color: "var(--sf-text)" }}
        >
          {tagline}
        </p>

        {/* The actual chatbot — embed.js loads the floating widget.
            On this demo page, the widget is the primary content; on
            real client sites where the snippet gets pasted, it's an
            unobtrusive floating button. */}
        <div className="mt-12">
          <div
            id="seldonframe-chatbot-preview-root"
            className="rounded-2xl border p-8 min-h-[400px] flex items-center justify-center"
            style={{ borderColor: "var(--sf-accent)" }}
          >
            <p className="opacity-60">
              Loading your AI receptionist…
            </p>
          </div>
          <script async src={embedUrl} />
        </div>

        {/* Operator helper: the embed snippet to copy onto the client's
            existing site. Rendered as a literal code block so the
            operator can select + copy. */}
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
