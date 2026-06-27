// ICP-3 — calm "section" chrome for the Agent editor (Claude Design, direction A).
//
// A quiet, numbered section header used to group the editor's controls into
// breathing, scannable blocks: a small mono step number in the brand color, a
// confident title, and a one-line description. Pure presentation (server-safe —
// no "use client", no hooks) so BOTH the editor page (page.tsx) and the editor
// client island (editor-client.tsx) can frame their controls identically.
//
// Reskin only: this introduces NO behavior. It wraps the EXISTING controls in a
// consistent container so the page reads as one calm document instead of a stack
// of mismatched cards. Colors/typography map to the live SeldonFrame tokens
// (--primary, --foreground, --muted-foreground, --border) — not the mockup's
// mobile-design-system vars.

import type { ReactNode } from "react";

/** A grouped section: mono step number + title + description, then its body.
 *  `anchor` sets a scroll-target id (used by the header's section nav / deep
 *  links); `scroll-mt` clears the sticky header so an anchored jump isn't hidden
 *  underneath it. */
export function EditorSection({
  step,
  title,
  description,
  anchor,
  children,
}: {
  /** Two-char step label, e.g. "01". Rendered in the brand mono accent. */
  step: string;
  title: string;
  description?: ReactNode;
  anchor?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={anchor}
      data-section={anchor}
      className="scroll-mt-28 space-y-5"
      aria-label={title}
    >
      <div className="space-y-1.5">
        <div className="flex items-baseline gap-3">
          <span
            aria-hidden
            className="font-mono text-xs font-semibold tracking-wide text-primary"
          >
            {step}
          </span>
          <h2 className="text-[1.35rem] font-semibold leading-tight tracking-tight text-foreground">
            {title}
          </h2>
        </div>
        {description ? (
          <p className="max-w-2xl pl-8 text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** The hairline divider between calm sections. Generous vertical rhythm so the
 *  page breathes. Pure presentation. */
export function EditorSectionDivider() {
  return <div aria-hidden className="my-10 h-px bg-border/70 sm:my-12" />;
}
