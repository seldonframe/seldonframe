"use client";

// Client wrapper for the ready-page ReadyDesignModule.
// - Derives `mobile` (the module is a bottom sheet on mobile, popover on desktop).
// - Holds optimistic `value` so the swap is instant; persistence + the public
//   re-render happen via the server action in a transition.
// - Mounts <PickerStyles/> (the token-driven stylesheet) once for this surface.

import { useEffect, useState, useTransition } from "react";

import { ReadyDesignModule } from "@/components/clients/design-picker/ReadyDesignModule";
import { PickerStyles } from "@/components/clients/design-picker/Styles";
import type { DesignId } from "@/components/clients/design-picker/types";

import { setLandingTemplateAction } from "./actions";

type Props = {
  slug: string;
  /** persisted choice: "auto" or a template id */
  initialValue: DesignId;
  /** what Auto resolves to for this workspace (a concrete template id) */
  autoResolvedId?: Exclude<DesignId, "auto">;
  autoReason?: string;
};

export function ReadyDesignPicker({ slug, initialValue, autoResolvedId, autoReason }: Props) {
  const [value, setValue] = useState<DesignId>(initialValue);
  const [mobile, setMobile] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const onChange = (id: DesignId) => {
    setValue(id); // optimistic — the module crossfades immediately
    startTransition(() => {
      void setLandingTemplateAction(slug, id);
    });
  };

  return (
    <>
      <PickerStyles />
      <ReadyDesignModule
        value={value}
        autoResolvedId={autoResolvedId}
        autoReason={autoReason}
        onChange={onChange}
        mobile={mobile}
      />
    </>
  );
}
