"use client";

import { cn } from "@/lib/utils";

type SubmitButtonProps = {
  disabled?: boolean;
  label?: string;
  onClick: () => void;
};

export function SubmitButton({
  disabled,
  label = "Submit Review",
  onClick,
}: SubmitButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "w-full rounded-2xl bg-[#2563EB] px-6 py-4 text-base font-semibold text-white shadow-lg shadow-[#2563EB]/25",
        "transition-all duration-200 hover:bg-[#1d4ed8] hover:shadow-xl hover:shadow-[#2563EB]/30",
        "active:scale-[0.99] disabled:opacity-40 disabled:pointer-events-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40 focus-visible:ring-offset-2",
      )}
    >
      {label}
    </button>
  );
}
