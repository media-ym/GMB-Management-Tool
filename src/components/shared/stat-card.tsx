"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  delta?: number;
  deltaLabel?: string;
  hint?: string;
  iconClassName?: string;
  accent?: "emerald" | "amber" | "teal" | "rose" | "slate" | "cyan";
}

const ACCENT: Record<NonNullable<StatCardProps["accent"]>, string> = {
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  teal: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  slate: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  cyan: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
};

export function StatCard({ label, value, icon: Icon, delta, deltaLabel, hint, iconClassName, accent = "emerald" }: StatCardProps) {
  const positive = (delta ?? 0) >= 0;
  return (
    <div className="kt-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="kt-stat-label">{label}</div>
          <div className="kt-stat-value mt-2">{value}</div>
          {hint && <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>}
        </div>
        <div className={cn("kt-symbol size-12", ACCENT[accent])}>
          <Icon className={cn("size-5", iconClassName)} />
        </div>
      </div>
      {delta !== undefined && (
        <div className="mt-3 flex items-center gap-1.5 text-xs">
          <span className={positive ? "kt-trend-up" : "kt-trend-down"}>
            {positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(delta)}%
          </span>
          <span className="text-muted-foreground">{deltaLabel ?? "vs last period"}</span>
        </div>
      )}
    </div>
  );
}
