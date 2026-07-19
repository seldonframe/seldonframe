// "The short version" TL;DR card — a bordered, softly-tinted skimmability box
// dropped near the top of every comparison/alternative/best SEO page, right
// after the intro. One bullet per fact (icon + bold label + emphasized fact),
// pulled verbatim from the live registries — never paraphrased (never-lies).

import type { CSSProperties, ReactElement } from "react";
import { MKT } from "@/components/marketplace/marketplace-data";
import { emphasize } from "@/lib/seo/emphasize";

export type TldrItem = {
  icon: string;
  label: string;
  text: string;
};

export function TldrBox({ items }: { items: TldrItem[] }): ReactElement {
  return (
    <div
      className="sf-tldr"
      style={{
        border: `1px solid ${MKT.ink10}`,
        borderRadius: 16,
        padding: "18px 20px",
        background: MKT.green10,
        maxWidth: 760,
        margin: "22px 0",
      }}
    >
      <div
        style={{
          fontSize: 11.5,
          fontWeight: 800,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: MKT.green,
          marginBottom: 10,
        }}
      >
        The short version
      </div>
      <ul style={UL}>
        {items.map((item) => (
          <li key={item.label} style={LI}>
            <span aria-hidden="true" style={{ marginRight: 8 }}>
              {item.icon}
            </span>
            <strong style={{ color: "rgba(34,29,23,0.9)" }}>{item.label}:</strong>{" "}
            {emphasize(item.text)}
          </li>
        ))}
      </ul>
    </div>
  );
}

const UL: CSSProperties = { margin: 0, padding: 0, listStyle: "none" };
const LI: CSSProperties = {
  fontSize: 14.5,
  lineHeight: 1.55,
  color: "rgba(34,29,23,0.78)",
  marginBottom: 8,
};
