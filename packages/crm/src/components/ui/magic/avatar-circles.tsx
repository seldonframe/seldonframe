// Vendored from Magic UI (https://magicui.design/docs/components/avatar-circles)
// on the `motion` engine already installed in this repo (no new dependency).
// Adapted per the cross-surface motion Adaptation Contract:
//  - This is a static overlapping avatar component with no keyframe dependency.
//    Upstream's hover scale effect is a Tailwind `transition-transform`
//    utility, not a `motion/react` component or custom `animate-*` keyframe.
//    This repo's Tailwind v4 has no custom keyframes registered, so depending
//    on one would silently no-op.
//  - Because no `motion` hooks or client-only state are used, this file
//    stays a plain server component — no `"use client"` directive needed.
//  - Avatar ring/border uses token-based theming (`ring-[var(--lp-bg)]`)
//    so it reads correctly in BOTH light "build" and warm "record" dark modes.
//    Hardcoded white/black would not flip with the landing's `data-mode`.
//  - `className` passthrough via `cn` (per convention).
//  - When `numPeople` prop is provided, renders an overflow badge showing
//    "+{numPeople}".

import React from "react";
import { cn } from "@/lib/utils";

interface Avatar {
  imageUrl: string;
  profileUrl: string;
  /** Optional display name, used for the link's accessible name / alt text. */
  name?: string;
}

interface AvatarCirclesProps {
  className?: string;
  numPeople?: number;
  avatarUrls: Avatar[];
}

export function AvatarCircles({
  className,
  numPeople,
  avatarUrls,
}: AvatarCirclesProps) {
  return (
    <div className={cn("flex items-center -space-x-4", className)}>
      {avatarUrls.map((avatar, index) => (
        <a
          key={index}
          href={avatar.profileUrl}
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--lp-card)] ring-2 ring-[var(--lp-bg)] hover:z-20 transition-transform hover:scale-110"
        >
          <img
            src={avatar.imageUrl}
            alt={avatar.name ?? "Profile"}
            className="h-full w-full rounded-full object-cover"
          />
        </a>
      ))}
      {numPeople !== undefined && (
        <div className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--lp-card)] ring-2 ring-[var(--lp-bg)]">
          <span className="text-xs font-semibold text-[var(--lp-body)]">
            {`+${numPeople}`}
          </span>
        </div>
      )}
    </div>
  );
}
