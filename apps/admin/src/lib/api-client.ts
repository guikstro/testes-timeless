import { cookies } from "next/headers";
import { ADMIN_ACCESS_COOKIE } from "./session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export interface ApiError {
  code: string;
  message: string;
  requestId?: string;
}

export class ApiRequestError extends Error {
  constructor(
    readonly body: ApiError,
    readonly status: number,
  ) {
    super(body.message);
    this.name = "ApiRequestError";
  }
}

/**
 * Cliente da API para a administração.
 *
 * Gêmeo do que existe no site do cliente, e não compartilhado com ele: o que
 * muda é justamente o cookie lido, e um cliente único parametrizado pelo nome
 * do cookie seria um lugar só onde trocar o parâmetro errado faria um site
 * autenticar com a sessão do outro. Duas cópias de vinte linhas custam menos
 * que essa possibilidade.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const bau = await cookies();
  const token = bau.get(ADMIN_ACCESS_COOKIE)?.value;

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const texto = await response.text();
  const body = texto ? JSON.parse(texto) : null;

  if (!response.ok) {
    throw new ApiRequestError(
      (body as ApiError) ?? { code: "UNKNOWN", message: "Erro desconhecido." },
      response.status,
    );
  }

  return body as T;
}
