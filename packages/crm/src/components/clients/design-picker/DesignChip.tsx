"use client";

import { useState } from "react";
import type { DesignChipProps } from "./types";
import { templateById } from "./data";
import { DesignPicker } from "./DesignPicker";
import { Icon } from "./icons";

/**
 * DesignChip — the input-screen control (/clients/new).
 * Default reads "Design · Auto ✨ Best fit ▾" (Auto is clearly the on-by-default).
 * Selected collapses to "Design · <chosen name>". Opens the shared picker as a
 * popover (desktop) / bottom sheet (mobile). Drop it into the input-box toolbar.
 */
export function DesignChip({ value, onChange, mobile }: DesignChipProps) {
  const [open, setOpen] = useState(false);
  const cur = templateById(value);
  const isAuto = cur.id === "auto";
  const pick = (id: typeof value) => { onChange(id); setOpen(false); };

  return (
    <span className="pk-anchor pk-scope">
      <button type="button" className="pk-chip" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        <span className="pk-chip-key">Design</span>
        <span className="pk-chip-val">
          {isAuto ? (
            <>
              <span className="pk-chip-spark"><Icon.spark /></span>
              Auto
              <span className="pk-chip-best">Best fit</span>
            </>
          ) : (
            <>
              <span className="pk-chip-dot" style={{ backgroundImage: `url(${(cur as { thumb: string }).thumb})` }} />
              {cur.name}
            </>
          )}
        </span>
        <span className="pk-chip-chev"><Icon.chevron /></span>
      </button>
      <DesignPicker open={open} mobile={mobile} placement="top" value={value} onPick={pick} onClose={() => setOpen(false)} />
    </span>
  );
}
