// Tiny typed fetch wrapper around our standard API envelope
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const text = await res.text();
  let json: { success?: boolean; message?: string; data?: T } = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    const snippet = text?.slice(0, 120) || "";
    if (snippet.includes("<!DOCTYPE") || snippet.includes("<html")) {
      throw new Error(
        res.status >= 500 || res.status === 524
          ? "Server timed out — your request may still be processing. Refresh in a minute."
          : "Unexpected server response. Try again or check server logs.",
      );
    }
    throw new Error(snippet || `Request failed (${res.status})`);
  }
  if (!json.success) {
    throw new Error(json.message || `Request failed (${res.status})`);
  }
  return json.data as T;
}

export async function apiRaw(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  return res.json();
}
