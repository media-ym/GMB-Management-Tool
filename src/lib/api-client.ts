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
    throw new Error(text?.slice(0, 200) || `Request failed (${res.status})`);
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
