// Tiny typed fetch wrapper around our standard API envelope
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const json = await res.json();
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
