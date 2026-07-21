"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Search, X, Plus } from "lucide-react";

interface GmbTagInputProps {
  label: string;
  emptyLabel?: string;
  placeholder?: string;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  suggestions?: string[];
  maxTags?: number;
}

export function GmbTagInput({
  label,
  emptyLabel = "None added yet",
  placeholder = "Search categories…",
  tags,
  onTagsChange,
  suggestions = [],
  maxTags = 9,
}: GmbTagInputProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const atLimit = tags.length >= maxTags;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return suggestions
      .filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()))
      .filter((s) => !q || s.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, suggestions, tags]);

  const canAddCustom =
    query.trim().length > 0 &&
    !atLimit &&
    !tags.some((t) => t.toLowerCase() === query.trim().toLowerCase());

  function addTag(name: string) {
    const trimmed = name.trim();
    if (!trimmed || atLimit) return;
    if (tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) return;
    onTagsChange([...tags, trimmed]);
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function removeTag(name: string) {
    onTagsChange(tags.filter((t) => t !== name));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <span className={cn("text-[11px] tabular-nums font-medium", atLimit ? "text-amber-600" : "text-muted-foreground")}>
          {tags.length}/{maxTags}
        </span>
      </div>

      {/* GMB-style chip container */}
      <div
        className={cn(
          "rounded-xl border bg-background min-h-[52px] p-2 transition-colors",
          open ? "border-primary ring-2 ring-primary/15" : "border-input",
          atLimit && "opacity-90",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.length === 0 && !open && (
            <span className="text-sm text-muted-foreground px-2 py-1.5">{emptyLabel}</span>
          )}
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-sm font-medium max-w-full"
            >
              <span className="truncate">{tag}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(tag);
                }}
                className="size-5 rounded-full hover:bg-primary/20 flex items-center justify-center shrink-0"
                aria-label={`Remove ${tag}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>

        {!atLimit && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canAddCustom) {
                  e.preventDefault();
                  addTag(query);
                }
                if (e.key === "Backspace" && !query && tags.length > 0) {
                  removeTag(tags[tags.length - 1]);
                }
              }}
              placeholder={placeholder}
              className="h-9 pl-9 border-0 shadow-none focus-visible:ring-0 bg-muted/30"
            />

            {open && (filtered.length > 0 || canAddCustom) && (
              <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-lg border bg-popover shadow-lg overflow-hidden">
                {filtered.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent transition-colors flex items-center gap-2"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addTag(item)}
                  >
                    <Plus className="size-3.5 text-primary shrink-0" />
                    {item}
                  </button>
                ))}
                {canAddCustom && (
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent border-t transition-colors text-primary font-medium"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addTag(query)}
                  >
                    Add &quot;{query.trim()}&quot;
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {!atLimit && suggestions.length > 0 && tags.length === 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          <span className="text-[10px] text-muted-foreground w-full mb-0.5">Suggested:</span>
          {suggestions.slice(0, 5).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addTag(s)}
              className="text-[11px] px-2.5 py-1 rounded-full border border-dashed border-primary/30 text-primary hover:bg-primary/5 transition-colors"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
