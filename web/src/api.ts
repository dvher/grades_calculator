import type { StoredClass, SyncedSettings } from "@grades/calc";

export interface SyncResponse {
  classes: StoredClass[];
  settings: SyncedSettings;
}

export class ApiError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

async function request<T>(serverUrl: string, path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${serverUrl.trim().replace(/\/+$/, "")}/api${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  } catch {
    throw new ApiError("NETWORK", 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error?.code ?? "UNKNOWN", res.status);
  return data as T;
}

type AuthResponse = { token: string; user: { id: string; email: string } };

export const api = {
  login: (serverUrl: string, email: string, password: string) =>
    request<AuthResponse>(serverUrl, "/auth/login", { email, password }),
  register: (serverUrl: string, email: string, password: string) =>
    request<AuthResponse>(serverUrl, "/auth/register", { email, password }),
  sync: (serverUrl: string, token: string, body: { classes: StoredClass[]; settings: SyncedSettings }) =>
    request<SyncResponse>(serverUrl, "/sync", body, token),
};
