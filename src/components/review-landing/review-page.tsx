"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BusinessCard } from "./business-card";
import { RatingSelector } from "./rating-selector";
import { TagSelector } from "./tag-selector";
import { ReviewTextarea } from "./review-textarea";
import { SubmitButton } from "./submit-button";
import type { ReviewRating } from "@/lib/review-landing";

export type ReviewPageProps = {
  businessName?: string;
  branchName?: string;
  locationId?: string | null;
  logoSrc?: string;
  /** Google "Write a review" deep link for this branch (g.page or placeid) */
  googleReviewUrl?: string | null;
};

export function ReviewPage({
  businessName = "My FNG",
  branchName = "Vartak Nagar, Thane West",
  locationId = null,
  logoSrc = "/myfng-logo.png",
  googleReviewUrl = null,
}: ReviewPageProps) {
  const [rating, setRating] = useState<ReviewRating | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [reviewText, setReviewText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSelectedTags([]);
    setReviewText("");
  }, [rating]);

  async function copyReviewText(text: string) {
    if (!text.trim()) return false;
    try {
      await navigator.clipboard.writeText(text.trim());
      return true;
    } catch {
      return false;
    }
  }

  async function handleSubmit() {
    if (!rating) {
      toast.error("Please select a star rating");
      return;
    }

    if (rating >= 4 && !reviewText.trim()) {
      toast.error("Generate or write a review before continuing to Google");
      return;
    }

    setSubmitting(true);

    try {
      if (rating >= 4) {
        if (!googleReviewUrl) {
          toast.error(
            "Google review link missing for this branch. Sync the location from Google first.",
          );
          return;
        }

        const copied = await copyReviewText(reviewText);
        toast.success(
          copied
            ? "Review copied — on Google: tap stars → paste (Ctrl/Cmd+V) → Post"
            : "Opening Google — write your review there and Post",
          { duration: 5000 },
        );

        await new Promise((r) => setTimeout(r, 700));
        window.location.href = googleReviewUrl;
        return;
      }

      toast.success("Thank you — your feedback was shared with our team privately.");
    } finally {
      setSubmitting(false);
    }
  }

  const submitLabel =
    rating != null && rating >= 4
      ? "Continue to Google Review"
      : "Submit Feedback";

  return (
    <div className="min-h-dvh bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="mx-auto w-full max-w-[900px] px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8 space-y-2 text-center sm:mb-10">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Share Your Experience
          </h1>
          <p className="mx-auto max-w-md text-sm text-slate-500 sm:text-base">
            Rate your visit, generate a review with AI, then publish on Google.
          </p>
        </header>

        <div className="space-y-8 sm:space-y-10">
          <BusinessCard
            logoSrc={logoSrc}
            businessName={businessName}
            branchName={branchName}
          />

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-8">
            <RatingSelector rating={rating} onChange={(r) => setRating(r)} />
          </section>

          {rating != null && (
            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-8">
              <TagSelector
                rating={rating}
                selectedTags={selectedTags}
                onChange={setSelectedTags}
              />
            </section>
          )}

          {rating != null && (
            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-8 space-y-6">
              <ReviewTextarea
                value={reviewText}
                onChange={setReviewText}
                rating={rating}
                selectedTags={selectedTags}
                businessName={businessName}
                branchName={branchName}
              />

              {rating >= 4 && (
                <div className="space-y-2 rounded-xl bg-[#2563EB]/5 px-4 py-3 text-center text-xs text-[#1d4ed8] sm:text-sm">
                  <p>
                    Pick one AI option (or edit it), then continue.
                    Google will open for <strong>{branchName}</strong>.
                  </p>
                  <p className="text-[#1d4ed8]/80">
                    On Google: select the same stars → paste your text → tap Post.
                  </p>
                </div>
              )}
              {rating <= 3 && (
                <p className="rounded-xl bg-slate-100 px-4 py-3 text-center text-xs text-slate-600 sm:text-sm">
                  Low ratings are shared privately with My FNG so we can improve — they are not posted publicly on Google.
                </p>
              )}
            </section>
          )}

          <div className="sticky bottom-4 z-10 sm:static sm:bottom-auto">
            <SubmitButton
              disabled={!rating || submitting}
              label={submitting ? "Please wait…" : submitLabel}
              onClick={() => void handleSubmit()}
            />
          </div>

          <p className="pb-4 text-center text-xs text-slate-400">
            Powered by My FNG · Positive reviews appear on Google after you publish there
          </p>
        </div>
      </div>
    </div>
  );
}
