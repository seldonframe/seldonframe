"use client";

import { useEffect, useState } from "react";
import type { DesignPickerProps } from "./types";
import { AUTO, DESIGNS } from "./data";
import { Icon } from "./icons";

function Thumb({ src, name, cls }: { src?: string; name: string; cls: string }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return <div className={cls + "-ph"}>{name}</div>;
  return <img src={src} alt={name + " landing design preview"} loading="lazy" onError={() => setBad(true)} />;
}

// Shared picker contents (used by both the popover and the bottom sheet).
function PickerBody({ value, onPick, onClose, title }: Pick<DesignPickerProps, "value" | "onPick" | "onClose" | "title">) {
  const autoSel = !value || value === "auto";
  return (
    <>
      <div className="pk-head">
        <div>
          <h3>{title || "Choose a landing design"}</h3>
          <p>Applies to this workspace's public site.</p>
        </div>
        <button className="pk-x" aria-label="Close" onClick={onClose}><Icon.close /></button>
      </div>
      <div className="pk-body">
        <button className="pk-auto" aria-pressed={autoSel} onClick={() => onPick("auto")}>
          <span className="pk-auto-ic"><Icon.spark /></span>
          <span className="pk-auto-main">
            <span className="pk-auto-top"><span className="pk-auto-name">{AUTO.name}</span><span className="pk-tag">Recommended</span></span>
            <span className="pk-auto-blurb">{AUTO.blurb}</span>
          </span>
          <span className="pk-auto-check"><Icon.check /></span>
        </button>

        <div className="pk-sec"><span>Health &amp; wellness designs</span></div>
        <div className="pk-grid">
          {DESIGNS.map((d) => (
            <button className="pk-card" key={d.id} aria-pressed={value === d.id} onClick={() => onPick(d.id)}>
              <span className="pk-check"><Icon.check /></span>
              <span className="pk-thumb"><Thumb src={d.thumb} name={d.name} cls="pk-thumb" /></span>
              <span className="pk-card-b">
                <span className="pk-card-name">{d.name}</span>
                <span className="pk-card-niche">{d.niche.join(" · ")}</span>
                {d.swatch && <span className="pk-card-sw">{d.swatch.map((c, i) => <i key={i} style={{ background: c }} />)}</span>}
              </span>
            </button>
          ))}
        </div>

        <div className="pk-foot"><Icon.info /> Non-health businesses always use Auto — it picks from the full archetype system.</div>
      </div>
    </>
  );
}

/**
 * DesignPicker — the shared selection surface.
 * Desktop: an anchored popover (wrap the trigger in `.pk-anchor`, which is
 * `position:relative`). Mobile: a `position:fixed` bottom sheet + scrim.
 *
 * Note on the mobile sheet: it is `position:fixed`, so it pins to the viewport.
 * If your dashboard has a `transform`ed ancestor around this control, the sheet
 * will scope to that element instead — either render this picker near the app
 * root, or portal the sheet to `document.body`.
 */
export function DesignPicker({ open, mobile, placement = "top", value, onPick, onClose, title }: DesignPickerProps) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  if (mobile) {
    return (
      <>
        <div className="pk-sheet-scrim" onClick={onClose} />
        <div className="pk-sheet" role="dialog" aria-modal="true" aria-label={title || "Choose a landing design"}>
          <div className="pk-sheet-grip" />
          <PickerBody value={value} onPick={onPick} onClose={onClose} title={title} />
        </div>
      </>
    );
  }
  return (
    <div className="pk-pop" data-place={placement} role="dialog" aria-label={title || "Choose a landing design"}>
      <PickerBody value={value} onPick={onPick} onClose={onClose} title={title} />
    </div>
  );
}
