"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface LocationOption {
  id: string;
  name: string;
  city?: string;
}

function filterLocations(locations: LocationOption[], query: string): LocationOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return locations;
  return locations.filter(
    (l) =>
      l.name.toLowerCase().includes(q) ||
      (l.city?.toLowerCase().includes(q) ?? false),
  );
}

export function LocationSelectSearch({
  value,
  onChange,
  placeholder = "Search locations…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("p-2 border-b bg-popover sticky top-0 z-10", className)}>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-8 pl-8 text-xs"
          onKeyDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}

export function useFilteredLocations(locations: LocationOption[] | undefined, query: string) {
  return useMemo(() => filterLocations(locations ?? [], query), [locations, query]);
}

interface LocationSingleSelectProps {
  locations: LocationOption[] | undefined;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  triggerClassName?: string;
  disabled?: boolean;
  noneValue?: string;
  noneLabel?: string;
}

/** Single location picker with in-dropdown search. */
export function LocationSingleSelect({
  locations,
  value,
  onValueChange,
  placeholder = "Select location",
  triggerClassName,
  disabled,
  noneValue,
  noneLabel,
}: LocationSingleSelectProps) {
  const [search, setSearch] = useState("");
  const filtered = useFilteredLocations(locations, search);

  return (
    <Select
      value={value || undefined}
      onValueChange={onValueChange}
      disabled={disabled}
      onOpenChange={(open) => {
        if (!open) setSearch("");
      }}
    >
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <LocationSelectSearch value={search} onChange={setSearch} />
        {noneValue != null && (
          <SelectItem value={noneValue}>{noneLabel ?? "All locations"}</SelectItem>
        )}
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">No locations match</div>
        ) : (
          filtered.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.name}
              {l.city ? ` · ${l.city}` : ""}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
