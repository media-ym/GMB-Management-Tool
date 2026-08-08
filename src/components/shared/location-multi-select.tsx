"use client";

import { useMemo, useState } from "react";
import { MapPin, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LocationSelectSearch, useFilteredLocations } from "@/components/shared/location-single-select";

interface LocationRow {
  id: string;
  name: string;
  city: string;
}

interface LocationMultiSelectProps {
  locations: LocationRow[] | undefined;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  className?: string;
  size?: "sm" | "default";
  showClearAll?: boolean;
}

export function LocationMultiSelect({
  locations,
  selectedIds,
  onChange,
  className,
  size = "sm",
  showClearAll = true,
}: LocationMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useFilteredLocations(locations, search);

  const label = useMemo(() => {
    if (selectedIds.length === 0) return "All locations";
    if (selectedIds.length === 1) {
      const loc = locations?.find((l) => l.id === selectedIds[0]);
      return loc?.name ?? "1 location";
    }
    return `${selectedIds.length} locations`;
  }, [selectedIds, locations]);

  function setChecked(id: string, checked: boolean) {
    if (checked) {
      if (!selectedIds.includes(id)) onChange([...selectedIds, id]);
      return;
    }
    onChange(selectedIds.filter((x) => x !== id));
  }

  function clearAll() {
    onChange([]);
  }

  function selectAll() {
    if (!filtered.length) return;
    const ids = new Set(selectedIds);
    for (const l of filtered) ids.add(l.id);
    onChange([...ids]);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size={size}
          className={cn("gap-1.5 min-w-[140px] justify-between font-normal", className)}
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{label}</span>
          </span>
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <LocationSelectSearch value={search} onChange={setSearch} />
        <div className="space-y-1 max-h-64 overflow-y-auto scroll-area p-2">
          <button
            type="button"
            className={cn(
              "w-full text-left px-2 py-1.5 text-xs rounded hover:bg-accent",
              selectedIds.length === 0 && "bg-accent font-medium",
            )}
            onClick={() => onChange([])}
          >
            All locations
          </button>
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground text-center">No locations match</p>
          ) : (
            filtered.map((loc) => {
              const checked = selectedIds.includes(loc.id);
              return (
                <div
                  key={loc.id}
                  role="button"
                  tabIndex={0}
                  className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-accent cursor-pointer"
                  onClick={() => setChecked(loc.id, !checked)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setChecked(loc.id, !checked);
                    }
                  }}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) => setChecked(loc.id, value === true)}
                    onClick={(e) => e.stopPropagation()}
                    className="size-3.5 pointer-events-auto"
                  />
                  <span className="truncate flex-1">{loc.name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{loc.city}</span>
                </div>
              );
            })
          )}
        </div>

        {showClearAll && (
          <div className="p-2 border-t flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 flex-1 text-xs"
              disabled={selectedIds.length === 0}
              onClick={clearAll}
            >
              Clear all
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 flex-1 text-xs"
              disabled={!filtered.length}
              onClick={selectAll}
            >
              Select visible
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
