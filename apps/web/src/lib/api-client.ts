import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
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

/**
 * O navegador de quem está do outro lado, para a API.
 *
 * Toda chamada daqui sai do servidor do site, e o `User-Agent` dela diria
 * "Node". Isso importa nas ações que abrem sessão sem passar pelas rotas de
 * login, como trocar a senha: a sessão nova apareceria na tela de sessões como
 * aparelho não identificado, logo depois de a pessoa ter trocado a senha
 * justamente por desconfiar de algum aparelho.
 */
async function navegadorDeQuemChama(): Promise<Record<string, string>> {
  try {
    const navegador = (await headers()).get("user-agent");
    return navegador ? { "X-Client-User-Agent": navegador.slice(0, 400) } : {};
  } catch {
    // Fora de uma requisição, como num build, não há navegador a repassar.
    return {};
  }
}

/**
 * Os 401 que querem dizer "esta sessão acabou", e só esses.
 *
 * A distinção importa porque nem todo 401 é sobre a sessão: código de segundo
 * fator errado e senha errada também respondem 401, e mandar a pessoa para o
 * login por ter digitado um dígito errado seria absurdo.
 */
const SESSAO_ACABOU = new Set(["UNAUTHORIZED", "SESSAO_ENCERRADA", "IMPERSONATION_EXPIRED"]);

/**
 * Sessão acabada vira ida ao login, de qualquer lugar.
 *
 * No App Router a página busca dados em paralelo com o layout. O layout já
 * redirecionava num 401, mas a página podia tomá-lo antes e cair na tela de
 * erro. Era o que aconteceria no aparelho cuja sessão foi encerrada de outro:
 * em vez de voltar ao login, ele veria "esta tela não carregou". Tratar aqui
 * cobre toda chamada, sem cada página precisar lembrar.
 */
function redirecionaSeASessaoAcabou(status: number, codigo: string | undefined): void {
  if (status === 401 && codigo && SESSAO_ACABOU.has(codigo)) {
    redirect("/login?motivo=sessao-encerrada");
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
      ...(await navegadorDeQuemChama()),
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
    redirecionaSeASessaoAcabou(response.status, (body as ApiError | null)?.code);
    throw new ApiRequestError((body as ApiError) ?? { code: "UNKNOWN", message: "Erro desconhecido." }, response.status);
  }

  return body as T;
}

export { rota } from "./rota";
