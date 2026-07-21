"use client";

import { cn } from "@/lib/utils";
import { TAG_CONFIG, type ReviewRating } from "@/lib/review-landing";

type TagSelectorProps = {
  rating: ReviewRating;
  selectedTags: string[];
  onChange: (tags: string[]) => void;
};

export function TagSelector({ rating, selectedTags, onChange }: TagSelectorProps) {
  const config = TAG_CONFIG[rating];

  function toggle(chip: string) {
    if (selectedTags.includes(chip)) {
      onChange(selectedTags.filter((t) => t !== chip));
    } else {
      onChange([...selectedTags, chip]);
    }
  }

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <h3 className="text-center text-base font-semibold text-slate-900 sm:text-lg">
        {config.heading}
      </h3>
      <div className="flex flex-wrap justify-center gap-2">
        {config.chips.map((chip) => {
          const selected = selectedTags.includes(chip);
          return (
            <button
              key={chip}
              type="button"
              onClick={() => toggle(chip)}
              className={cn(
                "rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200",
                "border shadow-sm active:scale-[0.97]",
                selected
                  ? "border-[#2563EB] bg-[#2563EB] text-white shadow-[#2563EB]/25 scale-[1.02]"
                  : "border-slate-200 bg-white text-slate-700 hover:border-[#2563EB]/40 hover:bg-[#2563EB]/5",
              )}
            >
              {chip}
            </button>
          );
        })}
      </div>
    </div>
  );
}
