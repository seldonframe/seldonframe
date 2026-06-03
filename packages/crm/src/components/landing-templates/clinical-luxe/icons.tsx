import type { SVGProps } from "react";

// Inline SVG only — no external icon libraries.
type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({ width: "1em" as const, height: "1em" as const, viewBox: "0 0 24 24", "aria-hidden": true, ...p });

export const Icon = {
  star: (p: P) => (<svg {...base(p)}><path fill="currentColor" d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 18.9 6.1 22l1.2-6.5L2.5 9.4l6.6-.9z" /></svg>),
  phone: (p: P) => (<svg {...base(p)}><path fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M5 4h3l1.5 4.5L7.5 10a12 12 0 0 0 6 6l1.5-2 4.5 1.5V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>),
  arrow: (p: P) => (<svg {...base(p)}><path fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" /></svg>),
  chevron: (p: P) => (<svg {...base(p)}><path fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" /></svg>),
  menu: (p: P) => (<svg {...base(p)}><path fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" /></svg>),
  close: (p: P) => (<svg {...base(p)}><path fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>),
  check: (p: P) => (<svg {...base(p)}><path fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>),
  clock: (p: P) => (<svg {...base(p)}><circle cx={12} cy={12} r={9} fill="none" stroke="currentColor" strokeWidth={2} /><path fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" d="M12 7v5l3 2" /></svg>),
  // refined diamond/petal mark for the luxe wordmark
  mark: (p: P) => (<svg {...{ ...base(p), viewBox: "0 0 28 28" }}><path fill="none" stroke="currentColor" strokeWidth={1.4} d="M14 2c2.4 5 5.6 8.2 10.6 10.6C19.6 15 16.4 18.2 14 23.2 11.6 18.2 8.4 15 3.4 12.6 8.4 10.2 11.6 7 14 2z" /></svg>),
};
