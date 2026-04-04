"use client";

import { useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toggleBlockVisibilityAction } from "@/lib/blocks/visibility-actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

export function BlockVisibilityToggle({ slug, hidden }: { slug: string; hidden: boolean }) {
  const [pending, startTransition] = useTransition();
  const { showDemoToast } = useDemoToast();

  return (
    <button
      type="button"
      disabled={pending}
      title={hidden ? "Show this block" : "Hide this block"}
      className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        startTransition(async () => {
          try {
            if (isDemoReadonlyClient) {
              showDemoToast();
              return;
            }
            await toggleBlockVisibilityAction(slug);
          } catch (error) {
            if (isDemoBlockedError(error)) {
              showDemoToast();
            }
          }
        });
      }}
    >
      {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
    </button>
  );
}
