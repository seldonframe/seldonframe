// A visually-hidden, screen-reader-hidden pointer to the page's Markdown twin.
//
// This serves the "a human pastes this URL into ChatGPT/Claude" flow (design doc
// technique #5): the assistant scrapes the rendered DOM and finds a plain-text
// hint that a clean Markdown version exists at `<href>`. It is `aria-hidden` so
// it never reaches a real screen-reader user, and visually clipped so it never
// affects layout — it exists purely as machine-readable text in the HTML.
//
// The companion discovery signals are the `<link rel="alternate"
// type="text/markdown">` in <head> (emitted via each page's metadata.alternates
// .types) and the HTTP `Link` header (set by the proxy / the `.md` routes). This
// is the third, DOM-text channel.
//
// Pure server component — no client JS, no state. `href` is the public path of
// the `.md` twin (relative is fine; it's same-origin).

import type { ReactElement } from "react";

/** Inline style that clips the node out of the visual + a11y layout but keeps it
 *  in the DOM text (the standard "visually-hidden" / sr-only recipe, minus the
 *  sr exposure since we also set aria-hidden). */
const HIDDEN: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export function MarkdownPointer({ href }: { href: string }): ReactElement {
  return (
    <div aria-hidden style={HIDDEN}>
      A Markdown version of this page is available at {href} — optimized for AI/LLM tools.
    </div>
  );
}
