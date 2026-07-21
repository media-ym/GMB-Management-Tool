"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { UPCOMING_HOLIDAYS } from "@/lib/content-update-fields";
import { formatDisplayDate, type SpecialHoursEntry } from "@/lib/content-gmb-forms";
import { Calendar, Plus, Trash2 } from "lucide-react";

interface GmbSpecialHoursFormProps {
  entries: SpecialHoursEntry[];
  onChange: (entries: SpecialHoursEntry[]) => void;
}

function newId() {
  return `sh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function parseHolidayDate(_name: string, dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function GmbSpecialHoursForm({ entries, onChange }: GmbSpecialHoursFormProps) {
  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const [closed, setClosed] = useState(true);
  const [from, setFrom] = useState("10:00");
  const [to, setTo] = useState("14:00");

  function addEntry(partial?: Partial<SpecialHoursEntry>) {
    const entryDate = partial?.date ?? date;
    if (!entryDate) return;
    if (entries.some((e) => e.date === entryDate)) return;
    onChange([
      ...entries,
      {
        id: newId(),
        date: entryDate,
        label: partial?.label ?? (label || undefined),
        closed: partial?.closed ?? closed,
        from: partial?.from ?? from,
        to: partial?.to ?? to,
      },
    ]);
    setDate("");
    setLabel("");
    setClosed(true);
  }

  function removeEntry(id: string) {
    onChange(entries.filter((e) => e.id !== id));
  }

  function quickAddHoliday(name: string, dateStr: string) {
    const iso = parseHolidayDate(name, dateStr);
    if (!iso) return;
    addEntry({ date: iso, label: name, closed: true });
  }

  return (
    <div className="space-y-5">
      {/* Upcoming holidays — GMB style quick add */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2">Upcoming holidays</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {UPCOMING_HOLIDAYS.map((h) => {
            const iso = parseHolidayDate(h.name, h.date);
            const added = entries.some((e) => e.date === iso);
            return (
              <button
                key={h.name}
                type="button"
                disabled={added || !iso}
                onClick={() => quickAddHoliday(h.name, h.date)}
                className={cn(
                  "shrink-0 rounded-lg border px-3 py-2 text-left min-w-[140px] transition-colors",
                  added
                    ? "opacity-50 cursor-not-allowed bg-muted"
                    : "hover:border-primary/40 hover:bg-primary/5",
                )}
              >
                <p className="text-xs font-semibold">{h.name}</p>
                <p className="text-[10px] text-muted-foreground">{h.date}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Add new special hour */}
      <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
        <p className="text-xs font-semibold flex items-center gap-1.5">
          <Calendar className="size-3.5" />
          Add a date
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Label (optional)</label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Independence Day"
              className="h-10"
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2.5">
          <span className="text-sm font-medium">Closed all day</span>
          <Switch checked={closed} onCheckedChange={setClosed} />
        </div>

        {!closed && (
          <div className="flex items-center gap-3">
            <div className="space-y-1.5 flex-1">
              <label className="text-xs text-muted-foreground">Opens</label>
              <Input type="time" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10" />
            </div>
            <span className="text-muted-foreground pt-5">–</span>
            <div className="space-y-1.5 flex-1">
              <label className="text-xs text-muted-foreground">Closes</label>
              <Input type="time" value={to} onChange={(e) => setTo(e.target.value)} className="h-10" />
            </div>
          </div>
        )}

        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1.5"
          disabled={!date}
          onClick={() => addEntry()}
        >
          <Plus className="size-3.5" />
          Add special hours
        </Button>
      </div>

      {/* Added entries list */}
      {entries.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">
            {entries.length} special hour{entries.length !== 1 ? "s" : ""} added
          </p>
          <div className="space-y-2">
            {entries
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 rounded-xl border bg-background px-3 py-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{formatDisplayDate(entry.date)}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.label && `${entry.label} · `}
                      {entry.closed ? "Closed" : `${entry.from} – ${entry.to}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeEntry(entry.id)}
                    className="size-8 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex items-center justify-center shrink-0"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {entries.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4 border border-dashed rounded-xl">
          No special hours added yet. Pick a holiday above or add a custom date.
        </p>
      )}
    </div>
  );
}
