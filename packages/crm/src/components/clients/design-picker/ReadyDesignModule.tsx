"use client";

import { useEffect, useRef, useState } from "react";
import type { ReadyDesignModuleProps } from "./types";
import { templateById } from "./data";
import { DesignPicker } from "./DesignPicker";
import { Icon } from "./icons";

function Thumb({ src, name }: { src?: string; name: string }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return <div className="rdm-thumb-ph">{name}</div>;
  return <img src={src} alt={name + " landing design preview"} loading="lazy" onError={() => setBad(true)} />;
}

/**
 * ReadyDesignModule — the ready-page swap module (/clients/[slug]/ready).
 * Shows the current landing design + a rationale. When the operator left Auto,
 * it shows what Auto resolved to ("Auto-picked for chiropractic"); once they
 * choose, it reads "Chosen by you". "Change design" reopens the shared picker;
 * selecting crossfades the preview and confirms with a brief "Design updated".
 *
 * The public page re-renders on the server; this module just reflects the new
 * `value` your handler persists to theme.landingTemplate.
 */
export function ReadyDesignModule({ value, autoResolvedId, autoReason, onChange, mobile, designs, sectionLabel, autoNote }: ReadyDesignModuleProps) {
  const [open, setOpen] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [toast, setToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAuto = !value || value === "auto";
  const shownId = isAuto ? (autoResolvedId || "earthy-modern-clinical") : value;
  const cur = templateById(shownId);
  const niche = "niche" in cur ? cur.niche.join(" · ") : "Applied to the public landing page";

  const pick = (id: typeof value) => {
    setOpen(false);
    setSwapping(true);
    window.setTimeout(() => { onChange(id); setSwapping(false); }, 220);
    setToast(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(false), 2200);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  return (
    <div className="rdm pk-scope">
      <div className="rdm-eyebrow"><Icon.wand /> Landing design</div>
      <div className="rdm-row">
        <div className={"rdm-preview" + (swapping ? " swapping" : "")}>
          <div className="rdm-thumb"><Thumb src={(cur as { thumb?: string }).thumb} name={cur.name} /></div>
          <div className="rdm-meta">
            <div className="rdm-name">{cur.name}</div>
            <div className="rdm-niche">{niche}</div>
            {isAuto ? (
              <div className="rdm-why"><Icon.spark /> {autoReason || "Auto-picked for this business"}</div>
            ) : (
              <div className="rdm-why" style={{ background: "var(--pk-line-2)", color: "var(--pk-muted)" }}><Icon.check /> Chosen by you</div>
            )}
          </div>
        </div>
        <span className="pk-anchor">
          <button type="button" className="rdm-change" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
            Change design <Icon.chevron />
          </button>
          <DesignPicker open={open} mobile={mobile} placement="bottom-end" value={value} onPick={pick} onClose={() => setOpen(false)} title="Change landing design" designs={designs} sectionLabel={sectionLabel} autoNote={autoNote} />
        </span>
      </div>
      <div className={"pk-toast" + (toast ? " show" : "")} role="status">
        <span className="pk-toast-ic"><Icon.check /></span> Design updated
      </div>
    </div>
  );
}
