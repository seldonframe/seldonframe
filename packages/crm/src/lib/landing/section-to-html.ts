import type { LandingPageSection } from "@/components/landing/sections/types";

export function getLandingPageCSS() {
  return `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif); }
  a { text-decoration: none; }
  `;
}

export function sectionsToHTML(sections: LandingPageSection[]) {
  const html = sections
    .sort((a, b) => a.order - b.order)
    .map((section) => {
      const payload = JSON.stringify(section.content ?? {});
      return `<section data-sf-type="${section.type}" data-sf-order="${section.order}"><pre>${payload}</pre></section>`;
    })
    .join("\n");
  const css = getLandingPageCSS();

  return { html, css };
}
