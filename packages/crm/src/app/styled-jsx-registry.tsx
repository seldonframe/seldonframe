"use client";

// styled-jsx style registry for the App Router.
//
// Why this exists (2026-07-13 — FOUC fix):
//   Every public surface — the workspace landing at /w/[slug] and its
//   landing-r1 sections (hero, navbar, services-grid, faq, footer, …), plus
//   /s, /l, /book, /forms — writes its layout + typography through styled-jsx
//   (`<style jsx>` blocks inside "use client" components). In the Next.js App
//   Router, styled-jsx in Client Components is ONLY injected after client-side
//   hydration UNLESS a `useServerInsertedHTML` registry collects the rules
//   during SSR and flushes them into the streamed <head>.
//
//   Without this registry the server HTML shipped the archetype palette (inline
//   CSS vars on the shell) but NONE of the `.sf-*` layout rules — so visitors
//   saw a few-hundred-ms flash of raw, top-left-stacked text before hydration
//   injected the styles. This registry emits those rules server-side, so the
//   first paint is fully styled.
//
// Canonical pattern from the Next.js docs (CSS-in-JS → styled-jsx). Mounted
// once at the top of the tree in app/layout.tsx.

import React, { useState } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { StyleRegistry, createStyleRegistry } from "styled-jsx";

export default function StyledJsxRegistry({
  children,
}: {
  children: React.ReactNode;
}) {
  // Create the stylesheet only once (lazy initial state) so subsequent
  // server renders don't regenerate + re-send the rules.
  const [jsxStyleRegistry] = useState(() => createStyleRegistry());

  useServerInsertedHTML(() => {
    const styles = jsxStyleRegistry.styles();
    jsxStyleRegistry.flush();
    return <>{styles}</>;
  });

  return <StyleRegistry registry={jsxStyleRegistry}>{children}</StyleRegistry>;
}
