import ZAI from "z-ai-web-dev-sdk";
import { db } from "./db";
import type { SessionUser } from "./types";

// MiSA AI — backend service layer for intelligent automation.
// Wraps z-ai-web-dev-sdk with versioned prompts, safety filtering, and full
// audit logging (per architecture doc §54–§58).

let _zai: Awaited<ReturnType<typeof ZAI.create>> | null = null;
async function client() {
  if (!_zai) _zai = await ZAI.create();
  return _zai;
}

interface CompletionArgs {
  system: string;
  user: string;
  maxTokens?: number;
}

async function complete({ system, user }: CompletionArgs): Promise<{ content: string; tokens: number }> {
  const zai = await client();
  const start = Date.now();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: "assistant", content: system },
      { role: "user", content: user },
    ],
    thinking: { type: "disabled" },
  });
  const content = completion.choices[0]?.message?.content ?? "";
  // rough token estimate (SDK doesn't always return usage)
  const tokens = Math.ceil((system.length + user.length + content.length) / 4);
  void start;
  return { content, tokens };
}

function sanitize(text: string, maxLen = 2000): string {
  // Strip script/style tags, collapse whitespace, cap length (per §57)
  const stripped = text
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\r/g, "")
    .trim();
  return stripped.length > maxLen ? stripped.slice(0, maxLen) : stripped;
}

async function logAI(opts: {
  user: SessionUser;
  promptType: string;
  input: unknown;
  output: unknown;
  tokens: number;
  durationMs: number;
  status: "success" | "failed";
}) {
  try {
    await db.aIHistory.create({
      data: {
        userId: opts.user.id,
        promptType: opts.promptType,
        model: "glm-4.6",
        input: JSON.stringify(opts.input).slice(0, 8000),
        output: JSON.stringify(opts.output).slice(0, 8000),
        tokens: opts.tokens,
        durationMs: opts.durationMs,
        status: opts.status,
      },
    });
  } catch (e) {
    console.error("ai history log failed", e);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AI: Review Reply
// ────────────────────────────────────────────────────────────────────────────
export async function aiReviewReply(opts: {
  user: SessionUser;
  locationName: string;
  authorName: string;
  rating: number;
  reviewText: string;
  tone?: "professional" | "warm" | "apologetic";
}): Promise<{ reply: string }> {
  const start = Date.now();
  const tone = opts.tone ?? (opts.rating <= 2 ? "apologetic" : "warm");
  const system = `You are MiSA AI, the official AI assistant for MyFNG Autocare (a multi-brand car service & repair brand in Maharashtra, India with centres in Mumbai, Navi Mumbai, Thane, and Pune).
You write public review replies that will be published on Google Business Profile.

Rules:
- Address the customer by name when natural.
- Tone: ${tone}. Keep it genuine, never robotic.
- ${opts.rating <= 2 ? "Acknowledge the issue sincerely and offer to make it right. Provide a contact path: care@myfng.in / +91 support line." : "Thank them warmly and reference specifics from their review (car model, service type, etc.)."}
- Keep it under 90 words. No emojis unless the customer used them. No markdown. No URLs.
- Never invent prices, dates, or employee names.

Google Review Reply Policy (STRICTLY PROHIBITED — violation can get the Business Profile suspended):
- Never ask or hint that the customer should change, edit, or remove their review.
- Never offer discounts, refunds, freebies, gifts, or any incentive in exchange for editing or removing the review.
- Never make legal threats, mention attorneys, lawyers, legal action, or suing.
- Never share PII: no staff full names, no customer phone numbers, no email addresses, no home addresses.
- Never impersonate the customer or put words in their mouth.
- Never include promotional spam, unrelated marketing, or links to other businesses.
- Never argue, be defensive, or accuse the reviewer of being fake — even if you suspect it.
- If the review mentions a specific employee negatively, do NOT name them in the reply — refer to "our team" or "the concerned team member".

If the review is clearly spammy, abusive, or fake, write a brief neutral reply acknowledging the feedback and asking the customer to contact care@myfng.in so the team can investigate — do NOT accuse.`;

  const userMsg = `Brand: MyFNG — ${opts.locationName}
Reviewer: ${opts.authorName}
Rating: ${opts.rating}/5
Review: "${opts.reviewText}"

Write the Google review reply now. Output ONLY the reply text.`;

  try {
    const { content, tokens } = await complete({ system, user: userMsg });
    const reply = sanitize(content, 600);
    await logAI({
      user: opts.user,
      promptType: "review_reply",
      input: { locationName: opts.locationName, authorName: opts.authorName, rating: opts.rating, reviewText: opts.reviewText, tone },
      output: { reply },
      tokens,
      durationMs: Date.now() - start,
      status: "success",
    });
    return { reply };
  } catch (e: any) {
    await logAI({
      user: opts.user,
      promptType: "review_reply",
      input: { reviewText: opts.reviewText },
      output: { error: e.message },
      tokens: 0,
      durationMs: Date.now() - start,
      status: "failed",
    });
    throw e;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AI: Google Post generation
// ────────────────────────────────────────────────────────────────────────────
export async function aiGeneratePost(opts: {
  user: SessionUser;
  locationName: string;
  type: "whats_new" | "offer" | "event" | "update";
  topic: string;
}): Promise<{ title: string; content: string; ctaType: string }> {
  const start = Date.now();
  const typeLabel = {
    whats_new: "What's New",
    offer: "Offer / Promotion",
    event: "Event",
    update: "Business Update",
  }[opts.type];

  const system = `You are MiSA AI for MyFNG Autocare (multi-brand car service & repair brand across Mumbai, Navi Mumbai, Thane, Pune, India).
Generate a Google Business Profile ${typeLabel} post.

Rules:
- Title: under 60 characters, attention-grabbing but honest.
- Body: 100–180 words, scannable, highlight value to local car owners (Maruti, Hyundai, Honda, Tata, Mahindra, Toyota).
- CTA type must be one of: book, order, sign_up, call, learn_more.
- No emojis spam (max 2). No markdown headings. No fake dates.
- Reference the city/location naturally.`;

  const userMsg = `Location: MyFNG — ${opts.locationName}
Post type: ${typeLabel}
Topic/angle: ${opts.topic}

Respond as STRICT JSON only:
{"title": "...", "content": "...", "ctaType": "book|order|sign_up|call|learn_more"}`;

  try {
    const { content, tokens } = await complete({ system, user: userMsg });
    let parsed: { title?: string; content?: string; ctaType?: string } = {};
    try { parsed = JSON.parse(content.replace(/```json|```/g, "").trim()); } catch { parsed = { title: opts.topic.slice(0, 60), content: sanitize(content, 1200), ctaType: "learn_more" }; }
    const result = {
      title: sanitize(parsed.title ?? opts.topic.slice(0, 60), 80),
      content: sanitize(parsed.content ?? "", 1200),
      ctaType: parsed.ctaType ?? "learn_more",
    };
    await logAI({
      user: opts.user,
      promptType: "post",
      input: { locationName: opts.locationName, type: opts.type, topic: opts.topic },
      output: result,
      tokens,
      durationMs: Date.now() - start,
      status: "success",
    });
    return result;
  } catch (e: any) {
    await logAI({
      user: opts.user,
      promptType: "post",
      input: { topic: opts.topic },
      output: { error: e.message },
      tokens: 0,
      durationMs: Date.now() - start,
      status: "failed",
    });
    throw e;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AI: SEO Recommendations
// ────────────────────────────────────────────────────────────────────────────
export async function aiSeoSuggestions(opts: {
  user: SessionUser;
  locationName: string;
  avgRank: number;
  topKeywords: { keyword: string; rank: number }[];
  healthScore: number;
  visibilityScore: number;
}): Promise<{ recommendations: string[] }> {
  const start = Date.now();
  const system = `You are MiSA AI — local SEO advisor for MyFNG Autocare (multi-brand car service brand in Mumbai, Navi Mumbai, Thane, Pune, India).
Give 5 concrete, actionable recommendations to improve local Google Business Profile ranking.
Be specific to the data. No fluff. Each recommendation under 25 words. Plain text bullets.`;

  const userMsg = `Location: MyFNG — ${opts.locationName}
Profile health score: ${opts.healthScore}/100
Visibility score: ${opts.visibilityScore}/100
Average keyword rank: ${opts.avgRank.toFixed(1)}
Top keywords: ${opts.topKeywords.map(k => `${k.keyword} (#${k.rank})`).join(", ") || "none tracked"}

Return as STRICT JSON: {"recommendations": ["...", "...", "...", "...", "..."]}`;

  try {
    const { content, tokens } = await complete({ system, user: userMsg });
    let parsed: { recommendations?: string[] } = {};
    try { parsed = JSON.parse(content.replace(/```json|```/g, "").trim()); } catch { parsed = { recommendations: content.split("\n").filter(Boolean).slice(0, 5) }; }
    const recs = (parsed.recommendations ?? []).map(r => sanitize(r, 200)).slice(0, 5);
    await logAI({
      user: opts.user,
      promptType: "seo",
      input: { locationName: opts.locationName, avgRank: opts.avgRank, topKeywords: opts.topKeywords, healthScore: opts.healthScore, visibilityScore: opts.visibilityScore },
      output: { recommendations: recs },
      tokens,
      durationMs: Date.now() - start,
      status: "success",
    });
    return { recommendations: recs };
  } catch (e: any) {
    await logAI({
      user: opts.user,
      promptType: "seo",
      input: { locationName: opts.locationName },
      output: { error: e.message },
      tokens: 0,
      durationMs: Date.now() - start,
      status: "failed",
    });
    throw e;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AI: Monthly performance summary
// ────────────────────────────────────────────────────────────────────────────
export async function aiMonthlySummary(opts: {
  user: SessionUser;
  locationName: string;
  metrics: { searchViews: number; mapsViews: number; websiteClicks: number; phoneCalls: number; directionRequests: number; newReviews: number; avgRating: number; prevAvgRating: number };
}): Promise<{ summary: string }> {
  const start = Date.now();
  const system = `You are MiSA AI. Write a concise monthly performance summary for the MyFNG Autocare marketing team.
Tone: professional, insightful. 120–180 words. Highlight trends, deltas, and one priority for next month. No markdown headings.`;

  const m = opts.metrics;
  const ratingDeltaNum = m.avgRating - m.prevAvgRating;
  const ratingDelta = ratingDeltaNum.toFixed(2);
  const userMsg = `Location: MyFNG — ${opts.locationName}
This month: ${m.searchViews} search views, ${m.mapsViews} maps views, ${m.websiteClicks} website clicks, ${m.phoneCalls} calls, ${m.directionRequests} direction requests, ${m.newReviews} new reviews.
Avg rating: ${m.avgRating} (prev ${m.prevAvgRating}, delta ${ratingDeltaNum > 0 ? "+" : ""}${ratingDelta}).

Write the summary as plain text.`;

  try {
    const { content, tokens } = await complete({ system, user: userMsg });
    const summary = sanitize(content, 1200);
    await logAI({
      user: opts.user,
      promptType: "summary",
      input: { locationName: opts.locationName, metrics: m },
      output: { summary },
      tokens,
      durationMs: Date.now() - start,
      status: "success",
    });
    return { summary };
  } catch (e: any) {
    await logAI({
      user: opts.user,
      promptType: "summary",
      input: { locationName: opts.locationName },
      output: { error: e.message },
      tokens: 0,
      durationMs: Date.now() - start,
      status: "failed",
    });
    throw e;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AI: MiSA Assistant chat (multi-turn)
// ────────────────────────────────────────────────────────────────────────────
export async function aiChat(opts: {
  user: SessionUser;
  messages: { role: "user" | "assistant"; content: string }[];
}): Promise<{ reply: string }> {
  const start = Date.now();
  const system = `You are MiSA AI, the internal operations & marketing assistant for MyFNG Autocare — a multi-brand car service & repair brand across Mumbai, Navi Mumbai, Thane, and Pune, India.

Your job: help the MyFNG marketing/operations team manage Google Business Profiles, draft review replies, plan Google Posts, interpret local SEO, summarise performance, and surface locations needing attention.

Rules:
- Be concise, operational, and specific. No generic marketing fluff.
- When the user asks you to draft content (reply/post/description), produce ready-to-use text.
- You can see aggregate context but not individual PII beyond what the user shares.
- If asked something outside MyFNG ops, politely redirect to in-scope topics.`;

  try {
    const zai = await client();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: system },
        ...opts.messages.map(m => ({ role: m.role, content: m.content })),
      ] as any,
      thinking: { type: "disabled" },
    });
    const reply = sanitize(completion.choices[0]?.message?.content ?? "", 4000);
    const tokens = Math.ceil((system.length + opts.messages.map(m => m.content.length).reduce((a, b) => a + b, 0) + reply.length) / 4);
    await logAI({
      user: opts.user,
      promptType: "chat",
      input: { messageCount: opts.messages.length, last: opts.messages[opts.messages.length - 1]?.content.slice(0, 500) },
      output: { reply: reply.slice(0, 500) },
      tokens,
      durationMs: Date.now() - start,
      status: "success",
    });
    return { reply };
  } catch (e: any) {
    await logAI({
      user: opts.user,
      promptType: "chat",
      input: { last: opts.messages[opts.messages.length - 1]?.content.slice(0, 200) },
      output: { error: e.message },
      tokens: 0,
      durationMs: Date.now() - start,
      status: "failed",
    });
    throw e;
  }
}
