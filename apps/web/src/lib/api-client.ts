import { cookies } from "next/headers";
import { ACCESS_TOKEN_COOKIE } from "./session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export interface ApiError {
  code: string;
  message: string;
}

export class ApiRequestError extends Error {
  constructor(public readonly body: ApiError, public readonly status: number) {
    super(body.message);
  }
}

/** Server-side fetch helper: attaches the session's access token as a Bearer header. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });

  // NestJS sends a genuinely empty body (Content-Length: 0), not the text
  // "null", when a controller returns `null` — e.g. GET /integrations/*
  // for an org with no connection yet. `response.json()` throws on that
  // empty string, and blindly falling back to `{}` there is a real bug:
  // `{}` is truthy in JS, so `connection ? <connected> : <emptyState>`
  // would render the wrong branch for exactly the case that endpoint
  // exists to report. Parse text ourselves so "empty" maps to `null`.
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { code: "INVALID_RESPONSE", message: "Resposta inválida do servidor." };
    }
  }

  if (!response.ok) {
    throw new ApiRequestError((body as ApiError) ?? { code: "UNKNOWN", message: "Erro desconhecido." }, response.status);
  }

  return body as T;
}
