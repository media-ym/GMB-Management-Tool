"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";

export function RatingStars({ rating, size = 14, showValue = true }: { rating: number; size?: number; showValue?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            style={{ width: size, height: size }}
            className={cn(
              i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "fill-muted text-muted-foreground/40",
            )}
          />
        ))}
      </span>
      {showValue && <span className="text-xs font-medium tabular-nums">{rating.toFixed(1)}</span>}
    </span>
  );
}

export function SentimentBadge({ sentiment }: { sentiment: "positive" | "neutral" | "negative" }) {
  const map = {
    positive: { label: "Positive", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
    neutral: { label: "Neutral", cls: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" },
    negative: { label: "Negative", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" },
  }[sentiment];
  return <Badge variant="outline" className={cn("font-medium", map.cls)}>{map.label}</Badge>;
}

export function SyncStatusBadge({ status }: { status: "synced" | "syncing" | "pending" | "error" }) {
  const map = {
    synced: { label: "Synced", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
    syncing: { label: "Syncing", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
    pending: { label: "Pending", cls: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" },
    error: { label: "Error", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" },
  }[status];
  return <Badge variant="outline" className={cn("font-medium", map.cls)}>{map.label}</Badge>;
}

export function StatusBadge({ status }: { status: "active" | "paused" | "error" }) {
  const map = {
    active: { label: "Active", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
    paused: { label: "Paused", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
    error: { label: "Error", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" },
  }[status];
  return <Badge variant="outline" className={cn("font-medium", map.cls)}>{map.label}</Badge>;
}

export function PostStatusBadge({ status }: { status: "draft" | "scheduled" | "published" | "failed" }) {
  const map = {
    draft: { label: "Draft", cls: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" },
    scheduled: { label: "Scheduled", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
    published: { label: "Published", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
    failed: { label: "Failed", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" },
  }[status];
  return <Badge variant="outline" className={cn("font-medium", map.cls)}>{map.label}</Badge>;
}

export function ScoreBadge({ score, label }: { score: number; label?: string }) {
  const color = score >= 75 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : score >= 50 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums", color)}>
      {score}{label && <span className="opacity-70">/ {label}</span>}
    </span>
  );
}
