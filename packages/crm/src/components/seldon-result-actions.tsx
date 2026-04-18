"use client";

import type { SeldonResultAction } from "@/lib/ai/seldon-actions";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SeldonResultActionsProps = {
  actions?: SeldonResultAction[];
  onPrompt?: (prompt: string) => void;
  className?: string;
};

export function SeldonResultActions({ actions = [], onPrompt, className }: SeldonResultActionsProps) {
  if (!actions.length) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2 pt-2", className)}>
      {actions.map((action) => {
        const key = `${action.label}-${action.kind}-${action.href ?? action.prompt ?? ""}`;
        const variant = action.primary ? "default" : "outline";

        if (action.kind === "prompt" && action.prompt) {
          return (
            <button
              key={key}
              type="button"
              className={buttonVariants({ variant, size: "sm" })}
              onClick={() => onPrompt?.(action.prompt ?? "")}
            >
              {action.label}
            </button>
          );
        }

        if (action.kind === "link" && action.href) {
          const isExternal = action.href.startsWith("http://") || action.href.startsWith("https://");
          return (
            <a
              key={key}
              href={action.href}
              className={buttonVariants({ variant, size: "sm" })}
              target={isExternal ? "_blank" : undefined}
              rel={isExternal ? "noopener noreferrer" : undefined}
            >
              {action.label}
            </a>
          );
        }

        return null;
      })}
    </div>
  );
}
