import { redirect } from "next/navigation";
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
    redirecionaSeASessaoAcabou(response.status, (body as ApiError | null)?.code);
    throw new ApiRequestError(
      (body as ApiError) ?? { code: "UNKNOWN", message: "Erro desconhecido." },
      response.status,
    );
  }

  return body as T;
}
