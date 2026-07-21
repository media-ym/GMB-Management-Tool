"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  RATING_LABELS,
  type ReviewRating,
} from "@/lib/review-landing";

type RatingSelectorProps = {
  rating: ReviewRating | null;
  onChange: (rating: ReviewRating) => void;
};

export function RatingSelector({ rating, onChange }: RatingSelectorProps) {
  const meta = rating ? RATING_LABELS[rating] : null;

  return (
    <div className="space-y-4">
      <h2 className="text-center text-lg font-semibold text-slate-900 sm:text-xl">
        How would you rate your experience?
      </h2>

      <div className="flex items-center justify-center gap-2 sm:gap-3">
        {([1, 2, 3, 4, 5] as ReviewRating[]).map((value) => {
          const active = rating != null && value <= rating;
          return (
            <button
              key={value}
              type="button"
              aria-label={`${value} star${value > 1 ? "s" : ""}`}
              onClick={() => onChange(value)}
              className={cn(
                "group rounded-full p-1.5 transition-transform duration-200 hover:scale-110 active:scale-95",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40",
              )}
            >
              <Star
                className={cn(
                  "size-10 sm:size-12 transition-all duration-200",
                  active
                    ? "fill-amber-400 text-amber-400 drop-shadow-sm scale-105"
                    : "fill-slate-100 text-slate-300 group-hover:text-amber-300 group-hover:fill-amber-100",
                )}
              />
            </button>
          );
        })}
      </div>

      <div
        className={cn(
          "min-h-[2rem] text-center transition-all duration-300",
          meta ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1",
        )}
      >
        {meta && (
          <p className="text-base font-medium text-slate-700 sm:text-lg">
            <span className="mr-1.5 text-xl">{meta.emoji}</span>
            {meta.label}
          </p>
        )}
      </div>
    </div>
  );
}
