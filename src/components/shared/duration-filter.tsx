"use client";

import { useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { DateRangeParams } from "@/lib/location-filter";

export type DurationValue =
  | "all"
  | "today"
  | "yesterday"
  | "7"
  | "30"
  | "90"
  | "180"
  | "6m"
  | "custom";

export type DurationCustomRange = DateRangeParams;

const PRESET_OPTIONS: { value: Exclude<DurationValue, "custom">; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7", label: "Past 7 days" },
  { value: "30", label: "Past 30 days" },
  { value: "90", label: "Past 90 days" },
  { value: "180", label: "Past 180 days" },
  /** Calendar months (e.g. Feb 1 → today) — matches GMB Performance month picker */
  { value: "6m", label: "Past 6 months" },
  { value: "all", label: "All Time" },
];

function formatCustomLabel(range: DurationCustomRange | null | undefined): string {
  if (!range?.from) return "Custom";
  try {
    const from = parseISO(range.from);
    if (!isValid(from)) return "Custom";
    const fromLabel = format(from, "MMM d, yyyy");
    if (!range.to) return `${fromLabel} - now`;
    const to = parseISO(range.to);
    if (!isValid(to)) return fromLabel;
    return `${fromLabel} - ${format(to, "MMM d, yyyy")}`;
  } catch {
    return "Custom";
  }
}

export function getDurationLabel(
  value: DurationValue,
  customRange?: DurationCustomRange | null,
): string {
  if (value === "custom") return formatCustomLabel(customRange);
  return PRESET_OPTIONS.find((o) => o.value === value)?.label ?? "All Time";
}

/** Inclusive calendar bounds for a duration preset, or null for All Time. */
export function durationToBounds(
  value: DurationValue,
  customRange?: DurationCustomRange | null,
): { from: Date; to: Date | null } | null {
  if (value === "all") return null;

  let from: Date | null = null;
  let to: Date | null = null;
  const now = new Date();

  if (value === "custom" && customRange?.from) {
    from = new Date(customRange.from);
    from.setHours(0, 0, 0, 0);
    if (customRange.to) {
      to = new Date(customRange.to);
      to.setHours(23, 59, 59, 999);
    }
  } else if (value === "today") {
    from = new Date(now);
    from.setHours(0, 0, 0, 0);
  } else if (value === "yesterday") {
    from = new Date(now);
    from.setDate(from.getDate() - 1);
    from.setHours(0, 0, 0, 0);
    to = new Date(from);
    to.setHours(23, 59, 59, 999);
  } else if (value === "6m") {
    from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    from.setHours(0, 0, 0, 0);
  } else {
    const days = parseInt(value, 10);
    if (Number.isFinite(days)) {
      from = new Date(now);
      from.setDate(from.getDate() - days);
    }
  }

  if (!from) return null;
  return { from, to };
}

interface DurationFilterProps {
  value: DurationValue;
  onChange: (value: DurationValue) => void;
  customRange?: DurationCustomRange | null;
  onCustomRangeChange?: (range: DurationCustomRange | null) => void;
  className?: string;
  /** Hide "All Time" for pages that always need a bounded window */
  hideAllTime?: boolean;
}

export function DurationFilter({
  value,
  onChange,
  customRange,
  onCustomRangeChange,
  className,
  hideAllTime = false,
}: DurationFilterProps) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(customRange?.from ?? "");
  const [draftTo, setDraftTo] = useState(customRange?.to ?? "");

  const label = getDurationLabel(value, customRange);
  const presets = hideAllTime
    ? PRESET_OPTIONS.filter((o) => o.value !== "all")
    : PRESET_OPTIONS;

  function selectPreset(preset: Exclude<DurationValue, "custom">) {
    onChange(preset);
    onCustomRangeChange?.(null);
    setOpen(false);
  }

  function selectCustomMode() {
    onChange("custom");
    setDraftFrom(customRange?.from ?? "");
    setDraftTo(customRange?.to ?? "");
  }

  function applyCustom() {
    if (!draftFrom) return;
    onChange("custom");
    onCustomRangeChange?.({
      from: draftFrom,
      to: draftTo || undefined,
    });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-1.5 min-w-[120px] max-w-[240px] justify-between font-normal",
            className,
          )}
        >
          <span className="flex items-center gap-1.5 truncate">
            <Calendar className="size-3.5 shrink-0 opacity-70" />
            <span className="truncate">{label}</span>
          </span>
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Duration
        </p>
        <div className="space-y-0.5">
          {presets.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={cn(
                "w-full text-left px-2 py-1.5 text-xs rounded hover:bg-accent",
                value === opt.value && "bg-accent font-medium ring-1 ring-primary/30",
              )}
              onClick={() => selectPreset(opt.value)}
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            className={cn(
              "w-full text-left px-2 py-1.5 text-xs rounded hover:bg-accent",
              value === "custom" && "bg-accent font-medium ring-1 ring-primary/30",
            )}
            onClick={selectCustomMode}
          >
            Custom range
          </button>
        </div>

        {(value === "custom" || draftFrom) && (
          <div className="mt-2 pt-2 border-t space-y-2 px-1">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                From
              </label>
              <Input
                type="date"
                value={draftFrom}
                onChange={(e) => setDraftFrom(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                To
              </label>
              <Input
                type="date"
                value={draftTo}
                min={draftFrom || undefined}
                onChange={(e) => setDraftTo(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <Button
              size="sm"
              className="w-full h-8 text-xs"
              disabled={!draftFrom}
              onClick={applyCustom}
            >
              Apply custom range
            </Button>
          </div>
        )}

        <div className="mt-2 pt-2 border-t">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full h-7 text-xs"
            disabled={value === (hideAllTime ? "30" : "all") && !customRange?.from}
            onClick={() => {
              onChange(hideAllTime ? "30" : "all");
              onCustomRangeChange?.(null);
              setDraftFrom("");
              setDraftTo("");
              setOpen(false);
            }}
          >
            {hideAllTime ? "Reset to Past 30 days" : "Clear all"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
