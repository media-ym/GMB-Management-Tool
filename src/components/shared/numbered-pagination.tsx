"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function getPageWindow(current0: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const pages = new Set<number>([0, total - 1, current0]);
  for (let i = current0 - 1; i <= current0 + 1; i++) {
    if (i >= 0 && i < total) pages.add(i);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i]! - sorted[i - 1]! > 1) out.push("…");
    out.push(sorted[i]!);
  }
  return out;
}

export interface NumberedPaginationProps {
  /** Current page. Use 0-based (default) or 1-based via `pageBase`. */
  page: number;
  totalPages: number;
  totalItems: number;
  perPage: number;
  onPageChange: (page: number) => void;
  /** Label after the count, e.g. "reviews", "posts" */
  itemLabel?: string;
  /** 0 = zero-based page index (reviews/posts), 1 = one-based (directories) */
  pageBase?: 0 | 1;
  className?: string;
  sticky?: boolean;
  /** Hide the whole bar when only one page (default false — still shows "Showing…") */
  hideWhenSinglePage?: boolean;
}

/**
 * Shared pagination — Reviews style: ‹ 1 2 3 … › + "Showing X–Y of Z"
 */
export function NumberedPagination({
  page,
  totalPages,
  totalItems,
  perPage,
  onPageChange,
  itemLabel = "items",
  pageBase = 0,
  className,
  sticky = false,
  hideWhenSinglePage = false,
}: NumberedPaginationProps) {
  if (totalItems === 0) return null;
  if (hideWhenSinglePage && totalPages <= 1) return null;

  const page0 = pageBase === 1 ? Math.max(0, page - 1) : page;
  const safeTotal = Math.max(1, totalPages);
  const start = page0 * perPage + 1;
  const end = Math.min((page0 + 1) * perPage, totalItems);
  const window = getPageWindow(page0, safeTotal);

  const toExternal = (idx0: number) => (pageBase === 1 ? idx0 + 1 : idx0);

  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 mt-1 border-t",
        sticky && "sticky bottom-0 bg-background/95 backdrop-blur-sm pb-1",
        className,
      )}
    >
      <span className="text-xs text-muted-foreground">
        Showing {start}–{end} of {totalItems} {itemLabel}
      </span>
      {safeTotal > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={page0 === 0}
            onClick={() => onPageChange(toExternal(page0 - 1))}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </Button>
          {window.map((item, idx) =>
            item === "…" ? (
              <span key={`e-${idx}`} className="text-xs text-muted-foreground px-1">
                …
              </span>
            ) : (
              <Button
                key={item}
                variant={page0 === item ? "default" : "outline"}
                size="sm"
                className="h-8 w-8 p-0 text-xs"
                onClick={() => onPageChange(toExternal(item))}
                aria-label={`Page ${item + 1}`}
                aria-current={page0 === item ? "page" : undefined}
              >
                {item + 1}
              </Button>
            ),
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={page0 >= safeTotal - 1}
            onClick={() => onPageChange(toExternal(page0 + 1))}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
