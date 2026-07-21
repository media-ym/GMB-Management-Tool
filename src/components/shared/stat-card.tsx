"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export type StatAccent =
  | "emerald"
  | "amber"
  | "teal"
  | "rose"
  | "slate"
  | "cyan"
  | "blue"
  | "violet"
  | "orange"
  | "indigo"
  | "purple"
  | "pink";

const ACCENT_STYLES: Record<
  StatAccent,
  { gradient: string; iconBg: string; trend: string }
> = {
  emerald: {
    gradient: "from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30",
    iconBg: "bg-emerald-500",
    trend: "text-emerald-600 dark:text-emerald-400",
  },
  amber: {
    gradient: "from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30",
    iconBg: "bg-amber-500",
    trend: "text-amber-600 dark:text-amber-400",
  },
  teal: {
    gradient: "from-teal-50 to-cyan-50 dark:from-teal-950/30 dark:to-cyan-950/30",
    iconBg: "bg-teal-500",
    trend: "text-teal-600 dark:text-teal-400",
  },
  rose: {
    gradient: "from-rose-50 to-pink-50 dark:from-rose-950/30 dark:to-pink-950/30",
    iconBg: "bg-rose-500",
    trend: "text-rose-600 dark:text-rose-400",
  },
  slate: {
    gradient: "from-slate-50 to-gray-100 dark:from-slate-950/30 dark:to-gray-900/30",
    iconBg: "bg-slate-500",
    trend: "text-slate-600 dark:text-slate-400",
  },
  cyan: {
    gradient: "from-cyan-50 to-sky-50 dark:from-cyan-950/30 dark:to-sky-950/30",
    iconBg: "bg-cyan-500",
    trend: "text-cyan-600 dark:text-cyan-400",
  },
  blue: {
    gradient: "from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30",
    iconBg: "bg-blue-500",
    trend: "text-blue-600 dark:text-blue-400",
  },
  violet: {
    gradient: "from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30",
    iconBg: "bg-violet-500",
    trend: "text-violet-600 dark:text-violet-400",
  },
  orange: {
    gradient: "from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30",
    iconBg: "bg-orange-500",
    trend: "text-orange-600 dark:text-orange-400",
  },
  indigo: {
    gradient: "from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30",
    iconBg: "bg-indigo-500",
    trend: "text-indigo-600 dark:text-indigo-400",
  },
  purple: {
    gradient: "from-purple-50 to-fuchsia-50 dark:from-purple-950/30 dark:to-fuchsia-950/30",
    iconBg: "bg-purple-500",
    trend: "text-purple-600 dark:text-purple-400",
  },
  pink: {
    gradient: "from-pink-50 to-rose-50 dark:from-pink-950/30 dark:to-rose-950/30",
    iconBg: "bg-pink-500",
    trend: "text-pink-600 dark:text-pink-400",
  },
};

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  delta?: number;
  deltaLabel?: string;
  hint?: string;
  iconClassName?: string;
  accent?: StatAccent;
}

/** Colorful gradient KPI card — matches Dashboard style across all pages. */
export function StatCard({
  label,
  value,
  icon: Icon,
  delta,
  deltaLabel,
  hint,
  iconClassName,
  accent = "emerald",
}: StatCardProps) {
  const style = ACCENT_STYLES[accent];
  const positive = (delta ?? 0) >= 0;

  return (
    <Card className={cn("bg-gradient-to-br border-0 shadow-sm", style.gradient)}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
              {label}
            </div>
            <div className="text-2xl font-bold tabular-nums mt-1 tracking-tight">{value}</div>
            {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
          </div>
          <div
            className={cn(
              "size-9 sm:size-10 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0",
              style.iconBg,
            )}
          >
            <Icon className={cn("size-4", iconClassName)} />
          </div>
        </div>
        {delta !== undefined && (
          <div className="mt-3 flex items-center gap-1.5 text-xs">
            <span className={cn("inline-flex items-center gap-0.5 font-medium", positive ? style.trend : "text-rose-600 dark:text-rose-400")}>
              {positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
              {Math.abs(delta)}%
            </span>
            <span className="text-muted-foreground">{deltaLabel ?? "vs last period"}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Compact colorful stat row — Dashboard secondary KPIs. */
export function MiniStatCard({
  icon: Icon,
  label,
  value,
  accent = "orange",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  accent?: StatAccent;
}) {
  const style = ACCENT_STYLES[accent];
  return (
    <Card className={cn("border-0 shadow-sm bg-gradient-to-br", style.gradient)}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("size-9 rounded-lg flex items-center justify-center text-white shadow-sm", style.iconBg)}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-bold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Score card with progress bar — Dashboard health/visibility style. */
export function ScoreStatCard({ label, value }: { label: string; value: number }) {
  const color =
    value >= 75 ? "text-emerald-500" : value >= 50 ? "text-amber-500" : "text-rose-500";
  const bg =
    value >= 75
      ? "from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30"
      : value >= 50
        ? "from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30"
        : "from-rose-50 to-pink-50 dark:from-rose-950/30 dark:to-pink-950/30";
  const bar =
    value >= 75 ? "bg-emerald-500" : value >= 50 ? "bg-amber-500" : "bg-rose-500";

  return (
    <Card className={cn("border-0 shadow-sm bg-gradient-to-br", bg)}>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground font-medium">{label}</div>
        <div className="mt-1 flex items-end gap-1.5">
          <span className={cn("text-2xl font-bold tabular-nums", color)}>{value}</span>
          <span className="text-xs text-muted-foreground mb-1">/100</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-white/60 dark:bg-white/10 overflow-hidden">
          <div className={cn("h-full rounded-full transition-all", bar)} style={{ width: `${Math.min(100, value)}%` }} />
        </div>
      </CardContent>
    </Card>
  );
}

/** Alias for dashboard imports */
export const ColorStatCard = StatCard;

export { ACCENT_STYLES as STAT_ACCENT_STYLES };
