"use client";

// Thin markdown renderer for SeldonChat assistant bubbles (onboarding-batch-2).
// User bubbles stay plain text; only assistant replies pass through this —
// the copilot's own prose (bold emphasis, short lists, links) reads far
// better than raw markdown syntax showing up as literal asterisks/pipes.
//
// Deliberately constrained: small prose only (bold, lists, inline code,
// links). No headings/images/tables/HTML passthrough — markdown-to-jsx
// never uses dangerouslySetInnerHTML under the hood, so this stays safe
// for untrusted-ish model output by construction.

import Markdown from "markdown-to-jsx";

const MARKDOWN_OPTIONS = {
  disableParsingRawHTML: true,
  forceBlock: true,
  overrides: {
    a: {
      component: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a {...props} target="_blank" rel="noopener noreferrer" />
      ),
    },
  },
} as const;

export function ChatMarkdown({ content }: { content: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed [&_code]:rounded [&_code]:bg-black/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
      <Markdown options={MARKDOWN_OPTIONS}>{content}</Markdown>
    </div>
  );
}
