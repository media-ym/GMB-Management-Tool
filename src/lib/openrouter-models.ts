/**
 * OpenRouter models available to MiSA AI.
 * Add new entries here — they appear in the model selector automatically.
 */
export interface OpenRouterModel {
  id: string;
  label: string;
  provider: string;
  free?: boolean;
  description?: string;
}

export const OPENROUTER_MODELS: OpenRouterModel[] = [
  {
    id: "openrouter/free",
    label: "Free Router",
    provider: "OpenRouter",
    free: true,
    description: "Auto-picks a working free model",
  },
  {
    id: "openai/gpt-oss-20b:free",
    label: "GPT-OSS 20B",
    provider: "OpenAI",
    free: true,
    description: "Fast free OpenAI OSS model",
  },
  {
    id: "nvidia/nemotron-3-nano-30b-a3b:free",
    label: "Nemotron 3 Nano 30B",
    provider: "NVIDIA",
    free: true,
    description: "Fast Nemotron 3 Nano, free tier",
  },
  {
    id: "google/gemma-4-26b-a4b-it:free",
    label: "Gemma 4 26B",
    provider: "Google",
    free: true,
    description: "Google Gemma 4 instruction-tuned, free tier",
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    label: "Nemotron 3 Super 120B",
    provider: "NVIDIA",
    free: true,
    description: "Strong reasoning, free tier",
  },
];

/** Special value: try preferred order with automatic fallback */
export const AUTO_MODEL_ID = "auto";

export const DEFAULT_OPENROUTER_MODEL = AUTO_MODEL_ID;

export function getOpenRouterModelIds(): string[] {
  return OPENROUTER_MODELS.map((m) => m.id);
}

export function isValidOpenRouterModel(id: string): boolean {
  return id === AUTO_MODEL_ID || OPENROUTER_MODELS.some((m) => m.id === id);
}

export function getOpenRouterModelLabel(id: string): string {
  if (id === AUTO_MODEL_ID) return "Auto (best available)";
  const exact = OPENROUTER_MODELS.find((m) => m.id === id);
  if (exact) return exact.label;
  // OpenRouter sometimes returns a slightly different id than requested
  const partial = OPENROUTER_MODELS.find(
    (m) => m.id === id || m.id.startsWith(`${id}:`) || id.startsWith(m.id.replace(/:free$/, "")),
  );
  return partial?.label ?? id.split("/").pop() ?? id;
}
