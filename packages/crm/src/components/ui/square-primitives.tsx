import * as React from "react";
import { cn } from "@/lib/utils";

export function SquarePageSection({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <section className={cn("space-y-4 sm:space-y-6", className)} {...props} />;
}

export function SquareSectionHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-6", className)} {...props} />;
}

export function SquareTitleBlock({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-2 sm:space-y-5", className)} {...props} />;
}

export function SquareCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border bg-card", className)} {...props} />;
}

export function SquareCardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 sm:p-6", className)} {...props} />;
}

export function SquareFilterBar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 sm:px-6 sm:py-3.5", className)} {...props} />;
}

export function SquareStatsGrid({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 p-3 sm:p-4 lg:p-6 rounded-xl border bg-card", className)} {...props} />;
}

export function SquareTableWrap({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-3 sm:px-6 pb-3 sm:pb-4 overflow-x-auto", className)} {...props} />;
}

export function SquareTableHeadRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("bg-muted/50 hover:bg-muted/50", className)} {...props} />;
}

export function SquareEmptyState({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border bg-card p-6 text-sm text-muted-foreground", className)} {...props} />;
}

export function SquareBadge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("inline-flex items-center rounded-md border border-border px-2 py-1 text-xs text-muted-foreground", className)} {...props} />;
}

export function SquareInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("crm-input h-9 w-full px-3", className)} {...props} />;
}

export function SquareSelect({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn("crm-input h-9 w-full px-3", className)} {...props} />;
}
