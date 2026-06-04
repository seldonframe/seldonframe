import type { SVGProps } from "react";

// Inline SVG only — no external icon libraries.
type P = SVGProps<SVGSVGElement>;
const b = (p: P) => ({ width: "1em" as const, height: "1em" as const, viewBox: "0 0 24 24", "aria-hidden": true, ...p });

export const Icon = {
  spark: (p: P) => (<svg {...b(p)}><path fill="currentColor" d="M12 2l1.7 5.2L19 9l-5.3 1.8L12 16l-1.7-5.2L5 9l5.3-1.8z" /><path fill="currentColor" d="M18.5 14l.8 2.4L21.7 17l-2.4.8-.8 2.2-.8-2.2L15.3 17l2.4-.6z" /></svg>),
  chevron: (p: P) => (<svg {...b(p)}><path fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" /></svg>),
  close: (p: P) => (<svg {...b(p)}><path fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>),
  check: (p: P) => (<svg {...b(p)}><path fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>),
  info: (p: P) => (<svg {...b(p)}><circle cx={12} cy={12} r={9} fill="none" stroke="currentColor" strokeWidth={2} /><path fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" d="M12 11v5M12 8h.01" /></svg>),
  wand: (p: P) => (<svg {...b(p)}><path fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M5 19L16 8M14 6l2-2 4 4-2 2M8 4l.6 1.6L10 6l-1.4.4L8 8l-.6-1.6L6 6l1.4-.4zM5 11l.5 1.3L7 13l-1.5.5L5 15l-.5-1.5L3 13l1.5-.5z" /></svg>),
};
