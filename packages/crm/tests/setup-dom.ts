// packages/crm/tests/setup-dom.ts
//
// JSDOM bootstrap for `@testing-library/react` component tests under
// `node --import tsx --import <this file> --test ...`. Existing TSX tests
// that use `renderToString` from `react-dom/server` (e.g.
// customer-action-form.spec.tsx) do not need a DOM and are unaffected by
// loading this file — jsdom installs harmless globals.
//
// Why this exists: Cut A / Cut B / Cut C of the web-onboarding pivot
// introduce interactive React components (UpgradeModal, /clients/new
// SSE form, /clients page) whose state transitions and click handlers
// are best tested with @testing-library/react's render + fireEvent.
// Those APIs require a DOM. Plain Node has no `window`/`document`.
//
// Pattern is to construct a jsdom and copy its globals onto Node's
// globalThis. The order matters — `window` and `document` must exist
// before React's runtime imports (which check for `window === undefined`
// to decide between server / client render).

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

// Copy the DOM globals onto globalThis. This includes window, document,
// HTMLElement, Element, Node, getComputedStyle, etc. Node 24 made some
// globals (notably `navigator`) read-only getters, so we use
// Object.defineProperty with `configurable: true` to override.
const globals = [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLAnchorElement",
  "HTMLButtonElement",
  "HTMLDivElement",
  "HTMLFormElement",
  "HTMLInputElement",
  "Element",
  "Node",
  "NodeList",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "CustomEvent",
  "getComputedStyle",
  // Animation primitives — base-ui's Dialog uses requestAnimationFrame for
  // mount/unmount transitions; jsdom provides them on the window but not
  // on the global scope by default.
  "requestAnimationFrame",
  "cancelAnimationFrame",
  // Pointer/touch event constructors used by some base-ui interaction layers.
  "PointerEvent",
  "DOMRect",
  // Mutation observer used by @testing-library/react's wait helpers.
  "MutationObserver",
] as const;

for (const key of globals) {
  const value = (dom.window as unknown as Record<string, unknown>)[key];
  try {
    Object.defineProperty(globalThis, key, {
      value,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  } catch {
    // Some globals (e.g. Node 24's `navigator`) are non-configurable. Best-effort
    // override; if it sticks the test will work, if not the @testing-library
    // code path that needs it will throw a clearer error than the bootstrap.
  }
}

// Mark the test environment so React doesn't print "act()" warnings
// for every microtask flush in fireEvent.click.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
