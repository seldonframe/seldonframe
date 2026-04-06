"use client";

import type { ReactNode } from "react";

type UpgradeGateProps = {
  feature: string;
  requiredPlan: "cloud" | "pro";
  hasAccess: boolean;
  message?: string;
  children: ReactNode;
};

export function UpgradeGate({ feature, requiredPlan, hasAccess, message, children }: UpgradeGateProps) {
  if (hasAccess) {
    return <>{children}</>;
  }

  return (
    <div className="relative rounded-lg">
      <div className="pointer-events-none opacity-50">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-zinc-950/60 p-6 backdrop-blur-sm">
        <div className="max-w-sm text-center">
          <p className="mb-3 text-sm text-zinc-300">
            {message || `This feature requires ${requiredPlan === "pro" ? "Pro" : "Cloud"}.`}
          </p>
          <a
            href={`/settings/billing?feature=${encodeURIComponent(feature)}`}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: "#14b8a6" }}
          >
            Upgrade to {requiredPlan === "pro" ? "Pro" : "Cloud"}
          </a>
        </div>
      </div>
    </div>
  );
}
