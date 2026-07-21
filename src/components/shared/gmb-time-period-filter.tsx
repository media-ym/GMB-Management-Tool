"use client";

import { useMemo, useState } from "react";
import { format, parseISO, isValid } from "date-fns";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { DateRangeParams } from "@/lib/location-filter";

export type MonthKey = { year: number; month: number }; // month 1–12

export type GmbPeriodValue =
  | { mode: "months"; from: MonthKey; to: MonthKey }
  | { mode: "custom"; from: string; to: string };

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

function monthIndex(m: MonthKey): number {
  return m.year * 12 + (m.month - 1);
}

function fromIndex(i: number): MonthKey {
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

function clampMonth(m: MonthKey, min: MonthKey, max: MonthKey): MonthKey {
  const i = monthIndex(m);
  if (i < monthIndex(min)) return min;
  if (i > monthIndex(max)) return max;
  return m;
}

function isoLocal(y: number, month: number, day: number): string {
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayIso(): string {
  const n = new Date();
  return isoLocal(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

/** GMB-style label: "Feb 2026–Jul 2026" */
export function formatGmbMonthRange(from: MonthKey, to: MonthKey): string {
  const a = `${MONTH_SHORT[from.month - 1]} ${from.year}`;
  const b = `${MONTH_SHORT[to.month - 1]} ${to.year}`;
  return `${a}–${b}`;
}

function formatCustomDayLabel(from: string, to: string): string {
  try {
    const a = parseISO(from);
    const b = parseISO(to);
    if (!isValid(a) || !isValid(b)) return "Custom range";
    if (a.getFullYear() === b.getFullYear()) {
      return `${format(a, "MMM d")}–${format(b, "MMM d, yyyy")}`;
    }
    return `${format(a, "MMM d, yyyy")}–${format(b, "MMM d, yyyy")}`;
  } catch {
    return "Custom range";
  }
}

export function formatGmbPeriodLabel(value: GmbPeriodValue): string {
  if (value.mode === "custom") return formatCustomDayLabel(value.from, value.to);
  return formatGmbMonthRange(value.from, value.to);
}

/** Convert month range → API from/to (end month = last day, or today if current). */
export function monthRangeToDateParams(from: MonthKey, to: MonthKey): DateRangeParams {
  const now = new Date();
  const fromStr = isoLocal(from.year, from.month, 1);
  const isCurrentMonth = to.year === now.getFullYear() && to.month === now.getMonth() + 1;
  if (isCurrentMonth) {
    return { from: fromStr, to: isoLocal(now.getFullYear(), now.getMonth() + 1, now.getDate()) };
  }
  const lastDay = new Date(to.year, to.month, 0).getDate();
  return { from: fromStr, to: isoLocal(to.year, to.month, lastDay) };
}

export function gmbPeriodToDateParams(value: GmbPeriodValue): DateRangeParams {
  if (value.mode === "custom") return { from: value.from, to: value.to };
  return monthRangeToDateParams(value.from, value.to);
}

export function defaultGmbMonthRange(monthsBack = 5): { from: MonthKey; to: MonthKey } {
  const now = new Date();
  const to: MonthKey = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const start = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const from: MonthKey = { year: start.getFullYear(), month: start.getMonth() + 1 };
  return { from, to };
}

export function defaultGmbPeriod(monthsBack = 5): GmbPeriodValue {
  const r = defaultGmbMonthRange(monthsBack);
  return { mode: "months", from: r.from, to: r.to };
}

interface GmbTimePeriodFilterProps {
  value: GmbPeriodValue;
  onChange: (value: GmbPeriodValue) => void;
  className?: string;
  /** How many past months to show in the grid (default 18) */
  historyMonths?: number;
}

export function GmbTimePeriodFilter({
  value,
  onChange,
  className,
  historyMonths = 18,
}: GmbTimePeriodFilterProps) {
  const now = new Date();
  const maxMonth: MonthKey = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const minMonth = fromIndex(monthIndex(maxMonth) - (historyMonths - 1));

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"months" | "custom">(value.mode);
  const [draftFrom, setDraftFrom] = useState<MonthKey | null>(
    value.mode === "months" ? value.from : defaultGmbMonthRange(5).from,
  );
  const [draftTo, setDraftTo] = useState<MonthKey | null>(
    value.mode === "months" ? value.to : defaultGmbMonthRange(5).to,
  );
  const [customFrom, setCustomFrom] = useState(
    value.mode === "custom" ? value.from : gmbPeriodToDateParams(value).from ?? "",
  );
  const [customTo, setCustomTo] = useState(
    value.mode === "custom" ? value.to : gmbPeriodToDateParams(value).to ?? todayIso(),
  );
  const [anchorYear, setAnchorYear] = useState(
    value.mode === "months" ? value.from.year : now.getFullYear(),
  );

  const label = formatGmbPeriodLabel(value);
  const maxDate = todayIso();

  const monthsInView = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const m: MonthKey = { year: anchorYear, month: i + 1 };
      const idx = monthIndex(m);
      const disabled = idx < monthIndex(minMonth) || idx > monthIndex(maxMonth);
      return { m, disabled };
    });
  }, [anchorYear, minMonth, maxMonth]);

  function openPicker() {
    setTab(value.mode);
    if (value.mode === "months") {
      setDraftFrom(value.from);
      setDraftTo(value.to);
      setAnchorYear(value.from.year);
      const params = monthRangeToDateParams(value.from, value.to);
      setCustomFrom(params.from ?? "");
      setCustomTo(params.to ?? todayIso());
    } else {
      setCustomFrom(value.from);
      setCustomTo(value.to);
      try {
        const d = parseISO(value.from);
        if (isValid(d)) {
          setDraftFrom({ year: d.getFullYear(), month: d.getMonth() + 1 });
          setAnchorYear(d.getFullYear());
        }
      } catch {
        /* keep */
      }
      try {
        const d = parseISO(value.to);
        if (isValid(d)) setDraftTo({ year: d.getFullYear(), month: d.getMonth() + 1 });
      } catch {
        /* keep */
      }
    }
    setOpen(true);
  }

  function pickMonth(m: MonthKey) {
    if (!draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(m);
      setDraftTo(null);
      return;
    }
    if (monthIndex(m) < monthIndex(draftFrom)) {
      setDraftTo(draftFrom);
      setDraftFrom(m);
    } else {
      setDraftTo(m);
    }
  }

  function monthState(m: MonthKey): "start" | "end" | "middle" | "single" | "none" {
    if (!draftFrom) return "none";
    const i = monthIndex(m);
    const a = monthIndex(draftFrom);
    if (!draftTo) return i === a ? "single" : "none";
    const b = monthIndex(draftTo);
    if (i === a && i === b) return "single";
    if (i === a) return "start";
    if (i === b) return "end";
    if (i > a && i < b) return "middle";
    return "none";
  }

  function apply() {
    if (tab === "custom") {
      if (!customFrom || !customTo) return;
      const a = customFrom <= customTo ? customFrom : customTo;
      const b = customFrom <= customTo ? customTo : customFrom;
      onChange({ mode: "custom", from: a, to: b });
      setOpen(false);
      return;
    }
    if (!draftFrom) return;
    const end = draftTo ?? draftFrom;
    const f = clampMonth(draftFrom, minMonth, maxMonth);
    const t = clampMonth(end, minMonth, maxMonth);
    if (monthIndex(f) <= monthIndex(t)) onChange({ mode: "months", from: f, to: t });
    else onChange({ mode: "months", from: t, to: f });
    setOpen(false);
  }

  function cancel() {
    setOpen(false);
  }

  const canPrevYear = anchorYear > minMonth.year;
  const canNextYear = anchorYear < maxMonth.year;
  const draftLabel =
    tab === "custom"
      ? customFrom && customTo
        ? formatCustomDayLabel(customFrom, customTo)
        : "Pick dates"
      : draftFrom
        ? formatGmbMonthRange(draftFrom, draftTo ?? draftFrom)
        : label;
  const canApply =
    tab === "custom" ? Boolean(customFrom && customTo) : Boolean(draftFrom);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) openPicker();
        else setOpen(false);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-1.5 min-w-[148px] max-w-[240px] justify-between font-normal h-9",
            "border-[#0047AB]/40 data-[state=open]:border-[#0096FF] data-[state=open]:ring-2 data-[state=open]:ring-[#0096FF]/25",
            className,
          )}
        >
          <span className="flex items-center gap-1.5 truncate">
            <Calendar className="size-3.5 shrink-0 text-[#0047AB]" />
            <span className="truncate tabular-nums">{label}</span>
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[300px] p-0 overflow-hidden">
        <div className="px-3 pt-3 pb-2">
          <label className="text-[11px] font-medium text-muted-foreground">Time period</label>
          <div className="mt-1 flex h-10 items-center gap-2 rounded-lg border-2 border-[#0096FF] px-2.5 text-sm font-medium">
            <Calendar className="size-4 shrink-0 text-[#0047AB]" />
            <span className="truncate">{draftLabel}</span>
          </div>
        </div>

        <div className="mx-3 mb-2 grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-0.5">
          <button
            type="button"
            onClick={() => setTab("months")}
            className={cn(
              "h-7 rounded-md text-xs font-medium transition-colors",
              tab === "months"
                ? "bg-white dark:bg-card text-[#0047AB] shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Months
          </button>
          <button
            type="button"
            onClick={() => setTab("custom")}
            className={cn(
              "h-7 rounded-md text-xs font-medium transition-colors",
              tab === "custom"
                ? "bg-white dark:bg-card text-[#0047AB] shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Custom
          </button>
        </div>

        {tab === "months" ? (
          <>
            <div className="flex items-center justify-between px-3 pb-2">
              <button
                type="button"
                disabled={!canPrevYear}
                onClick={() => setAnchorYear((y) => y - 1)}
                className="size-7 rounded-full flex items-center justify-center hover:bg-accent disabled:opacity-30"
                aria-label="Previous year"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="text-sm font-semibold">{anchorYear}</span>
              <button
                type="button"
                disabled={!canNextYear}
                onClick={() => setAnchorYear((y) => y + 1)}
                className="size-7 rounded-full flex items-center justify-center hover:bg-accent disabled:opacity-30"
                aria-label="Next year"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-y-1 px-2 pb-3">
              {monthsInView.map(({ m, disabled }) => {
                const state = monthState(m);
                const isEdge = state === "start" || state === "end" || state === "single";
                const isMiddle = state === "middle";
                return (
                  <button
                    key={`${m.year}-${m.month}`}
                    type="button"
                    disabled={disabled}
                    onClick={() => pickMonth(m)}
                    className={cn(
                      "relative h-9 text-sm transition-colors disabled:opacity-30 disabled:pointer-events-none",
                      isMiddle && "bg-[#0096FF]/15",
                      state === "start" && "bg-[#0096FF]/15 rounded-l-full",
                      state === "end" && "bg-[#0096FF]/15 rounded-r-full",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-8 min-w-[4.5rem] items-center justify-center rounded-full px-2",
                        isEdge && "bg-[#0047AB] text-white font-medium",
                        !isEdge && !isMiddle && "hover:bg-accent",
                        isMiddle && "text-[#0047AB]",
                      )}
                    >
                      {MONTH_SHORT[m.month - 1]} {m.year}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="px-3 pb-3 space-y-2.5">
            <div className="space-y-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                From
              </label>
              <Input
                type="date"
                value={customFrom}
                max={customTo || maxDate}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                To
              </label>
              <Input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                max={maxDate}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>
        )}

        <div className="flex gap-2 border-t px-3 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 rounded-full border-[#0047AB]/30 text-[#0047AB]"
            onClick={cancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="flex-1 rounded-full bg-[#0047AB] hover:bg-[#003a8c] text-white"
            disabled={!canApply}
            onClick={apply}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
