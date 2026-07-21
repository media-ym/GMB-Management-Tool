export type ReviewRating = 1 | 2 | 3 | 4 | 5;

export const RATING_LABELS: Record<
  ReviewRating,
  { label: string; emoji: string }
> = {
  1: { label: "Terrible", emoji: "😞" },
  2: { label: "Bad", emoji: "🙁" },
  3: { label: "Average", emoji: "😐" },
  4: { label: "Good", emoji: "🙂" },
  5: { label: "Excellent", emoji: "😍" },
};

export const TAG_CONFIG: Record<
  ReviewRating,
  { heading: string; chips: string[] }
> = {
  1: {
    heading: "What went wrong?",
    chips: [
      "Service Delay",
      "Poor Quality",
      "High Pricing",
      "Staff Behaviour",
      "Booking Issue",
      "Vehicle Returned Dirty",
      "Communication",
      "Others",
    ],
  },
  2: {
    heading: "What could be better?",
    chips: [
      "Delayed Service",
      "Average Quality",
      "Pricing",
      "Booking Experience",
      "Support",
      "Pickup & Drop",
      "Communication",
    ],
  },
  3: {
    heading: "What did you like & dislike?",
    chips: [
      "Quick Booking",
      "Friendly Staff",
      "Reasonable Pricing",
      "Long Wait",
      "Average Quality",
      "Pickup & Drop",
    ],
  },
  4: {
    heading: "What did you like?",
    chips: [
      "Quick Service",
      "Professional Staff",
      "Easy Booking",
      "Reasonable Pricing",
      "Pickup & Drop",
      "Transparent Pricing",
    ],
  },
  5: {
    heading: "What did you love?",
    chips: [
      "Excellent Service",
      "Fast Delivery",
      "Friendly Staff",
      "Professional Team",
      "Transparent Pricing",
      "Value For Money",
      "Quick Booking",
      "Pickup & Drop",
      "Highly Recommended",
    ],
  },
};

/** Natural phrase expansions for common tags */
const TAG_DETAIL: Record<string, string> = {
  "Excellent Service": "the overall service quality was excellent from start to finish",
  "Fast Delivery": "the work was completed quickly without compromising on quality",
  "Friendly Staff": "the staff was warm, helpful, and easy to talk to",
  "Professional Team": "the team handled everything in a very professional manner",
  "Transparent Pricing": "the pricing was clear upfront with no hidden charges",
  "Value For Money": "it felt like genuine value for money",
  "Quick Booking": "booking a slot was quick and hassle-free",
  "Pickup & Drop": "the pickup and drop facility made the whole process convenient",
  "Highly Recommended": "I would gladly recommend them to family and friends",
  "Quick Service": "service turnaround was quick",
  "Professional Staff": "the staff was professional and courteous",
  "Easy Booking": "booking was simple and smooth",
  "Reasonable Pricing": "the pricing was reasonable for the work done",
  "Service Delay": "there were delays in completing the service",
  "Poor Quality": "the quality of work did not meet expectations",
  "High Pricing": "the pricing felt higher than expected",
  "Staff Behaviour": "staff behaviour needs improvement",
  "Booking Issue": "there were issues during booking",
  "Vehicle Returned Dirty": "the vehicle was returned dirty",
  Communication: "communication could have been clearer",
  Others: "a few other issues came up during the visit",
  "Delayed Service": "the service took longer than expected",
  "Average Quality": "the quality was only average",
  Pricing: "pricing could be more competitive",
  "Booking Experience": "the booking experience needs improvement",
  Support: "support follow-up could be better",
  "Long Wait": "waiting time was longer than expected",
};

function detailFor(tag: string): string {
  return TAG_DETAIL[tag] || `${tag.toLowerCase()} stood out during my visit`;
}

function sentenceList(parts: string[]): string {
  if (!parts.length) return "";
  if (parts.length === 1) return capitalize(parts[0]) + ".";
  if (parts.length === 2) {
    return `${capitalize(parts[0])}, and ${parts[1]}.`;
  }
  const head = parts.slice(0, -1).join("; ");
  return `${capitalize(head)}; and ${parts[parts.length - 1]}.`;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function tagSentences(tags: string[]): string[] {
  return tags.map((t) => detailFor(t));
}

type GenOpts = {
  rating: ReviewRating;
  selectedTags: string[];
  businessName: string;
  branchName: string;
};

/**
 * Build 3 review variants. Length grows with selected tags.
 */
export function generateReviewOptions(opts: GenOpts): [string, string, string] {
  const brand = opts.businessName || "My FNG";
  const branch = opts.branchName?.trim() || "";
  const at = branch ? ` at ${branch}` : "";
  const tags = opts.selectedTags;
  const details = tagSentences(tags);

  if (opts.rating >= 4) {
    return buildPositiveOptions(opts.rating, brand, at, tags, details);
  }
  if (opts.rating === 3) {
    return buildAverageOptions(brand, at, tags, details);
  }
  return buildNegativeOptions(opts.rating, brand, at, tags, details);
}

function buildPositiveOptions(
  rating: 4 | 5 | ReviewRating,
  brand: string,
  at: string,
  tags: string[],
  details: string[],
): [string, string, string] {
  const tone = rating === 5 ? "excellent" : "really good";
  const close5 =
    "Overall, a trustworthy multi-brand garage — I’ll definitely come back for the next service.";
  const close4 =
    "Overall I’m satisfied and would consider returning for future servicing.";

  const fallbackDetails = [
    "the booking process was smooth",
    "the staff explained the work clearly",
    "the vehicle was returned on time",
  ];
  const used = details.length ? details : fallbackDetails;

  // Option A — structured, tag-by-tag
  const aBody =
    used.length <= 2
      ? sentenceList(used)
      : `${sentenceList(used.slice(0, Math.ceil(used.length / 2)))} ${sentenceList(used.slice(Math.ceil(used.length / 2)))}`;
  const optionA = [
    `I had an ${tone} experience with ${brand}${at}.`,
    aBody,
    tags.length >= 3
      ? `From booking to delivery, everything felt organised and customer-friendly.`
      : `The team made the whole process comfortable.`,
    rating === 5 ? close5 : close4,
  ].join(" ");

  // Option B — narrative / story style
  const highlight =
    tags.length > 0
      ? `What I liked most: ${tags.map((t) => t.toLowerCase()).join(", ")}.`
      : "What I liked most was the clear communication and timely delivery.";
  const mid =
    used.length > 0
      ? `In particular, ${used.slice(0, 3).join("; ")}${used.length > 3 ? `; plus ${used.slice(3).join("; ")}` : ""}.`
      : "They kept me updated and completed the job properly.";
  const optionB = [
    `Visited ${brand}${at} for car service and walked away impressed.`,
    highlight,
    mid,
    rating === 5
      ? "If you need reliable multi-brand car care nearby, this is a solid choice. Highly recommended."
      : "A dependable option for routine car service. Happy with the outcome.",
  ].join(" ");

  // Option C — concise but still longer when many tags
  const bullets =
    tags.length > 0
      ? tags.map((t) => detailFor(t)).join(" Also, ")
      : "Service quality was solid and the team was helpful throughout.";
  const optionC = [
    `${brand}${at} delivered a ${tone} service experience.`,
    capitalize(bullets) + (bullets.endsWith(".") ? "" : "."),
    tags.length >= 4
      ? `With so many things done right — especially around ${tags
          .slice(0, 3)
          .map((t) => t.toLowerCase())
          .join(", ")} — I felt confident leaving my car with them.`
      : `I’d be comfortable recommending them for regular maintenance.`,
    rating === 5 ? "Five stars from me." : "Four stars — good job overall.",
  ].join(" ");

  return [optionA, optionB, optionC];
}

function buildAverageOptions(
  brand: string,
  at: string,
  tags: string[],
  details: string[],
): [string, string, string] {
  const used = details.length
    ? details
    : ["some parts of the visit were fine", "a few areas still need improvement"];

  const a = [
    `My experience with ${brand}${at} was average.`,
    sentenceList(used),
    "There’s potential, but consistency would make a big difference next time.",
  ].join(" ");

  const b = [
    `Visited ${brand}${at} — mixed feelings overall.`,
    tags.length
      ? `Notes on ${tags.map((t) => t.toLowerCase()).join(", ")}: some good, some not so much.`
      : "A few things worked well; others felt slow or average.",
    sentenceList(used.slice(0, 4)),
    "Hoping they improve these points for future customers.",
  ].join(" ");

  const c = [
    `${brand}${at} was okay, not great.`,
    capitalize(used.join(". ")) + (used.length ? "." : ""),
    "With a bit more attention to detail, this could easily become a 4-star visit.",
  ].join(" ");

  return [a, b, c];
}

function buildNegativeOptions(
  rating: ReviewRating,
  brand: string,
  at: string,
  tags: string[],
  details: string[],
): [string, string, string] {
  const used = details.length
    ? details
    : ["the visit did not meet expectations", "follow-up and communication were weak"];
  const tone = rating === 1 ? "disappointing" : "below expectations";

  const a = [
    `I had a ${tone} experience with ${brand}${at}.`,
    sentenceList(used),
    tags.length
      ? `Main issues related to ${tags.map((t) => t.toLowerCase()).join(", ")}.`
      : "I expected better for the time and money spent.",
    "Sharing this so the team can improve.",
  ].join(" ");

  const b = [
    `Unfortunately my visit to ${brand}${at} didn’t go well.`,
    sentenceList(used),
    "I would appreciate if management looks into these points and tightens the process.",
  ].join(" ");

  const c = [
    `${brand}${at}: ${tone}.`,
    capitalize(used.join("; ")) + ".",
    tags.length >= 2
      ? `Especially concerned about ${tags
          .slice(0, 3)
          .map((t) => t.toLowerCase())
          .join(" and ")}.`
      : "Hope things improve for other customers.",
  ].join(" ");

  return [a, b, c];
}

/** Back-compat: first option */
export function generateReviewWithAI(opts: GenOpts): string {
  return generateReviewOptions(opts)[0];
}
