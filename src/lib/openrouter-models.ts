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
    id: "openai/gpt-oss-20b:free",
    label: "GPT-OSS 20B",
    provider: "OpenAI",
    free: true,
    description: "Fast free OpenAI OSS model",
  },
  {
    id: "tencent/hunyuan-h3:free",
    label: "Hunyuan H3",
    provider: "Tencent",
    free: true,
    description: "Tencent Hunyuan free tier",
  },
  {
    id: "nvidia/llama-3.1-nemotron-super-49b-v1:free",
    label: "Nemotron Super 49B",
    provider: "NVIDIA",
    free: true,
    description: "Strong reasoning, free tier",
  },
  {
    id: "nvidia/llama-3.1-nemotron-nano-30b-v1:free",
    label: "Nemotron Nano 30B",
    provider: "NVIDIA",
    free: true,
    description: "Faster Nano variant, free tier",
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
