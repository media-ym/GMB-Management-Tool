"use client";

import { useState } from "react";
import { Calendar, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  ANALYTICS_DATE_RANGE_OPTIONS,
  DEFAULT_ANALYTICS_DATE_RANGE,
  getAnalyticsDateRangeLabel,
  type AnalyticsDateRangeKey,
} from "@/lib/analytics-date-range";
import type { DateRangeParams } from "@/lib/location-filter";

interface DateRangeFilterProps {
  value: AnalyticsDateRangeKey;
  onChange: (value: AnalyticsDateRangeKey) => void;
  customRange?: DateRangeParams | null;
  onCustomRangeChange?: (range: DateRangeParams | null) => void;
  className?: string;
  defaultValue?: AnalyticsDateRangeKey;
  showClearAll?: boolean;
}

export function DateRangeFilter({
  value,
  onChange,
  customRange,
  onCustomRangeChange,
  className,
  defaultValue = DEFAULT_ANALYTICS_DATE_RANGE,
  showClearAll = true,
}: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(customRange?.from ?? "");
  const [draftTo, setDraftTo] = useState(customRange?.to ?? "");
  const label = getAnalyticsDateRangeLabel(value, customRange);

  function selectPreset(preset: Exclude<AnalyticsDateRangeKey, "custom">) {
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

  function resetToDefault() {
    onChange(defaultValue);
    onCustomRangeChange?.(null);
    setDraftFrom("");
    setDraftTo("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-1.5 min-w-[140px] max-w-[240px] justify-between font-normal",
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
      <PopoverContent
        align="end"
        className="w-56 p-2"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Date range
        </p>
        <div className="space-y-0.5">
          {ANALYTICS_DATE_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={cn(
                "w-full flex items-center justify-between px-2 py-1.5 text-xs rounded hover:bg-accent",
                value === opt.value && "bg-accent font-medium ring-1 ring-primary/30",
              )}
              onClick={() => selectPreset(opt.value)}
            >
              <span>{opt.label}</span>
              {value === opt.value && <Check className="size-3.5 text-primary shrink-0" />}
            </button>
          ))}
          <button
            type="button"
            className={cn(
              "w-full flex items-center justify-between px-2 py-1.5 text-xs rounded hover:bg-accent",
              value === "custom" && "bg-accent font-medium ring-1 ring-primary/30",
            )}
            onClick={selectCustomMode}
          >
            <span>Custom range</span>
            {value === "custom" && <Check className="size-3.5 text-primary shrink-0" />}
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

        {showClearAll && (
          <div className="mt-2 pt-2 border-t">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs"
              disabled={value === defaultValue && !customRange?.from}
              onClick={resetToDefault}
            >
              Clear / Reset to {getAnalyticsDateRangeLabel(defaultValue)}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export { getAnalyticsDateRangeLabel, DEFAULT_ANALYTICS_DATE_RANGE };
export type { AnalyticsDateRangeKey };
