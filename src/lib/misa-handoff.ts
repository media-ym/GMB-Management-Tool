/** Cross-page handoff so Dashboard (etc.) can open MiSA with a prompt. */

export const MISA_PENDING_PROMPT_KEY = "myfng-misa-pending-prompt";

export function setMisaPendingPrompt(prompt: string): void {
  try {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    sessionStorage.setItem(MISA_PENDING_PROMPT_KEY, trimmed);
  } catch {
    /* ignore */
  }
}

export function consumeMisaPendingPrompt(): string | null {
  try {
    const v = sessionStorage.getItem(MISA_PENDING_PROMPT_KEY);
    if (!v) return null;
    sessionStorage.removeItem(MISA_PENDING_PROMPT_KEY);
    return v.trim() || null;
  } catch {
    return null;
  }
}
