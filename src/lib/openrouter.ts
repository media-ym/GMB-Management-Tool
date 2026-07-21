import {
  AUTO_MODEL_ID,
  getOpenRouterModelIds,
  isValidOpenRouterModel,
} from "./openrouter-models";

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OpenRouterChatResult = {
  content: string;
  model: string;
  tokens: number;
};

function resolveModelOrder(preferred?: string): string[] {
  const all = getOpenRouterModelIds();
  if (!preferred || preferred === AUTO_MODEL_ID || !isValidOpenRouterModel(preferred)) {
    return all;
  }
  // Try selected model first, then fall back through the rest
  return [preferred, ...all.filter((id) => id !== preferred)];
}

/**
 * Chat via OpenRouter. Tries the preferred model first, then falls back
 * through the free model list until one succeeds.
 */
export async function openRouterChat(
  messages: OpenRouterMessage[],
  preferredModel?: string,
): Promise<OpenRouterChatResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const models = resolveModelOrder(preferredModel);
  const errors: string[] = [];

  for (const model of models) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || "https://myfng.in",
          "X-Title": process.env.OPENROUTER_APP_TITLE || "MyFNG",
        },
        body: JSON.stringify({ model, messages }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`${res.status}${errText ? `: ${errText.slice(0, 200)}` : ""}`);
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content ?? "";
      if (!content) throw new Error("Empty response");

      const usage = data?.usage;
      const tokens =
        typeof usage?.total_tokens === "number"
          ? usage.total_tokens
          : Math.ceil(
              (messages.map((m) => m.content).join("").length + content.length) / 4,
            );

      console.log("MiSA AI using OpenRouter model:", model);
      return {
        content: String(content),
        model: data?.model || model,
        tokens,
      };
    } catch (e: any) {
      const msg = e?.message || "failed";
      console.warn(`OpenRouter model ${model} failed:`, msg);
      errors.push(`${model}: ${msg}`);
    }
  }

  throw new Error(
    errors.length
      ? `No free model available (${errors[errors.length - 1]})`
      : "No free model available",
  );
}
