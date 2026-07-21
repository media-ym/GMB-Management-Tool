"use client";

import { LayoutGrid, LayoutList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LayoutMode = "grid" | "list";

interface LayoutToggleProps {
  value: LayoutMode;
  onChange: (value: LayoutMode) => void;
  className?: string;
}

export function LayoutToggle({ value, onChange, className }: LayoutToggleProps) {
  return (
    <div className={cn("flex items-center rounded-lg border bg-muted/30 p-0.5", className)}>
      <Button
        type="button"
        size="sm"
        variant={value === "grid" ? "secondary" : "ghost"}
        className="h-8 px-2.5"
        onClick={() => onChange("grid")}
        aria-label="Grid view"
        title="Grid view"
      >
        <LayoutGrid className="size-4" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant={value === "list" ? "secondary" : "ghost"}
        className="h-8 px-2.5"
        onClick={() => onChange("list")}
        aria-label="List view"
        title="List view"
      >
        <LayoutList className="size-4" />
      </Button>
    </div>
  );
}
