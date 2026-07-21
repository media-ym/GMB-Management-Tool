"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  generateReviewOptions,
  type ReviewRating,
} from "@/lib/review-landing";

type ReviewTextareaProps = {
  value: string;
  onChange: (value: string) => void;
  rating: ReviewRating | null;
  selectedTags: string[];
  businessName: string;
  branchName: string;
};

export function ReviewTextarea({
  value,
  onChange,
  rating,
  selectedTags,
  businessName,
  branchName,
}: ReviewTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [writing, setWriting] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(160, el.scrollHeight)}px`;
  }, [value]);

  // Clear options when tags/rating change so user regenerates with new selections
  useEffect(() => {
    setOptions([]);
    setSelectedIdx(null);
  }, [rating, selectedTags.join("|")]);

  async function handleAiWrite() {
    if (!rating) return;
    setWriting(true);
    await new Promise((r) => setTimeout(r, 400));
    const next = generateReviewOptions({
      rating,
      selectedTags,
      businessName,
      branchName,
    });
    setOptions([...next]);
    setSelectedIdx(0);
    onChange(next[0]);
    setWriting(false);
  }

  function pickOption(idx: number) {
    setSelectedIdx(idx);
    onChange(options[idx] ?? "");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900 sm:text-lg">
            Tell us about your experience
          </h3>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm">
            Select more tags for a longer review, then pick one of 3 AI options.
          </p>
        </div>
        <button
          type="button"
          disabled={!rating || writing}
          onClick={() => void handleAiWrite()}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all shrink-0",
            "border border-[#2563EB]/25 bg-[#2563EB]/5 text-[#2563EB]",
            "hover:bg-[#2563EB] hover:text-white hover:shadow-md hover:shadow-[#2563EB]/20",
            "disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98]",
          )}
        >
          {writing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {options.length ? "Regenerate 3 options" : "Write with AI"}
        </button>
      </div>

      {options.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Choose a review
          </p>
          <div className="grid gap-2">
            {options.map((opt, idx) => {
              const active = selectedIdx === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => pickOption(idx)}
                  className={cn(
                    "rounded-xl border px-4 py-3 text-left text-sm leading-relaxed transition-all",
                    active
                      ? "border-[#2563EB] bg-[#2563EB]/5 text-slate-900 shadow-sm ring-1 ring-[#2563EB]/30"
                      : "border-slate-200 bg-white text-slate-700 hover:border-[#2563EB]/40",
                  )}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "text-[11px] font-semibold uppercase tracking-wide",
                        active ? "text-[#2563EB]" : "text-slate-400",
                      )}
                    >
                      Option {idx + 1}
                    </span>
                    {active && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#2563EB]">
                        <Check className="size-3.5" /> Selected
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap">{opt}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm focus-within:border-[#2563EB]/50 focus-within:ring-2 focus-within:ring-[#2563EB]/15 transition-shadow">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setSelectedIdx(null);
          }}
          placeholder={
            selectedTags.length
              ? "Tap Write with AI to generate 3 reviews from your selected tags…"
              : "Select tags above, then Write with AI — or type your own review…"
          }
          rows={6}
          className={cn(
            "w-full resize-none bg-transparent px-4 py-3.5 text-sm sm:text-base text-slate-800",
            "placeholder:text-slate-400 focus:outline-none rounded-2xl min-h-[160px]",
          )}
        />
      </div>
    </div>
  );
}
