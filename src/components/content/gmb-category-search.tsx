"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Search, X, Check } from "lucide-react";

interface GmbCategorySearchProps {
  value: string;
  onChange: (category: string) => void;
  suggestions: string[];
  placeholder?: string;
}

export function GmbCategorySearch({
  value,
  onChange,
  suggestions,
  placeholder = "Search categories…",
}: GmbCategorySearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = (query || value).trim().toLowerCase();
    if (!q) return suggestions.slice(0, 10);
    return suggestions.filter((s) => s.toLowerCase().includes(q)).slice(0, 10);
  }, [query, value, suggestions]);

  function selectCategory(name: string) {
    onChange(name);
    setQuery("");
    setOpen(false);
  }

  function clear() {
    onChange("");
    setQuery("");
    inputRef.current?.focus();
  }

  return (
    <div className="space-y-3">
      {value ? (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-primary/30 bg-primary/5">
          <Check className="size-4 text-primary shrink-0" />
          <span className="text-sm font-medium text-foreground flex-1">{value}</span>
          <button
            type="button"
            onClick={clear}
            className="size-7 rounded-full hover:bg-primary/10 flex items-center justify-center text-muted-foreground"
            aria-label="Change category"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 180)}
            placeholder={placeholder}
            className="h-11 pl-10 text-base"
            autoFocus
          />

          {open && filtered.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-xl border bg-popover shadow-lg overflow-hidden max-h-[280px] overflow-y-auto">
              <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/40 border-b">
                Google categories
              </p>
              {filtered.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={cn(
                    "w-full text-left px-3 py-2.5 text-sm hover:bg-accent transition-colors border-b border-border/40 last:border-0",
                    value === item && "bg-primary/5 text-primary font-medium",
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!value && query.length === 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[10px] text-muted-foreground w-full">Popular for auto service:</span>
          {suggestions.slice(0, 4).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => selectCategory(s)}
              className="text-[11px] px-2.5 py-1 rounded-full border border-primary/25 text-primary hover:bg-primary/5"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
