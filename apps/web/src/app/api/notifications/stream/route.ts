import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_MAX_AGE,
  SESSION_COOKIE_OPTIONS,
} from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/**
 * O cano de tempo real passa por aqui, e não direto do navegador para a API.
 *
 * Dois motivos, e nenhum deles é preferência de arquitetura:
 *
 * - O navegador não alcança `http://api:3001`, que é nome interno do Docker.
 * - O token está num cookie httpOnly deste domínio, e o `EventSource` não
 *   permite mandar cabeçalho `Authorization`. Só quem lê o cookie do lado do
 *   servidor consegue autenticar a conexão, e assim o token nunca chega ao
 *   navegador.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Conexao {
  resposta: Response;
  /** Preenchido quando a sessão foi renovada no caminho, para o cookie acompanhar. */
  novosTokens?: { accessToken: string; refreshToken: string };
}

async function abrir(request: NextRequest, accessToken: string): Promise<Response> {
  return fetch(`${API_URL}/notifications/stream`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "text/event-stream" },
    cache: "no-store",
    // Amarra a vida da conexão de cima à de baixo. Sem isto, fechar a aba
    // deixaria a conexão com a API pendurada, e o contador de quem está
    // ouvindo nunca zeraria: a API seguiria assinada no Redis para sempre.
    signal: request.signal,
  });
}

async function conectar(request: NextRequest): Promise<Conexao> {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  if (accessToken) {
    const resposta = await abrir(request, accessToken);
    if (resposta.status !== 401) return { resposta };
  }

  /*
    O token de acesso dura quinze minutos e quem fica parado numa tela não
    dispara o middleware que o renova. Sem esta segunda chance, uma aba aberta
    por mais de quinze minutos perderia o tempo real de vez: o navegador
    reconectaria de bom grado, e tomaria 401 em todas as tentativas.
  */
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) return { resposta: new Response(null, { status: 401 }) };

  const renovacao = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
  });
  if (!renovacao.ok) return { resposta: new Response(null, { status: 401 }) };

  const novosTokens = (await renovacao.json()) as { accessToken: string; refreshToken: string };
  return { resposta: await abrir(request, novosTokens.accessToken), novosTokens };
}

export async function GET(request: NextRequest) {
  let conexao: Conexao;
  try {
    conexao = await conectar(request);
  } catch {
    // A aba fechou no meio da conexão, ou a API está fora. Nos dois casos o
    // navegador tenta de novo sozinho; devolver 503 evita o log de exceção.
    return new Response(null, { status: 503 });
  }

  const { resposta, novosTokens } = conexao;
  if (!resposta.ok || !resposta.body) {
    return new Response(null, { status: resposta.status === 401 ? 401 : 503 });
  }

  const saida = new NextResponse(resposta.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // `no-transform` junto com o cabeçalho do nginx abaixo: qualquer camada
      // que resolva bufferizar transforma tempo real em lote.
      "Cache-Control": "no-cache, no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });

  if (novosTokens) {
    saida.cookies.set(ACCESS_TOKEN_COOKIE, novosTokens.accessToken, {
      ...SESSION_COOKIE_OPTIONS,
      maxAge: ACCESS_TOKEN_MAX_AGE,
    });
    saida.cookies.set(REFRESH_TOKEN_COOKIE, novosTokens.refreshToken, {
      ...SESSION_COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });
  }

  return saida;
}
