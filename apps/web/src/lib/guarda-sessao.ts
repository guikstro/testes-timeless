import { cookies } from "next/headers";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_MAX_AGE,
  SESSION_COOKIE_OPTIONS,
} from "./session";

export interface ParDeTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Grava a sessão que a API acabou de devolver.
 *
 * Algumas ações renovam a sessão de quem as fez (trocar a senha, passar a
 * posse da conta). Gravar o par novo aqui mantém a pessoa logada nesta aba,
 * já com o que mudou, em vez de ela ser expulsa ou continuar com o papel velho.
 *
 * Fora de um arquivo `"use server"` de propósito: lá, tudo o que é exportado
 * vira ação que o navegador pode chamar, e esta não pode ser uma delas.
 */
export async function guardaSessao(tokens: ParDeTokens): Promise<void> {
  const bau = await cookies();
  bau.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, { ...SESSION_COOKIE_OPTIONS, maxAge: ACCESS_TOKEN_MAX_AGE });
  bau.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, { ...SESSION_COOKIE_OPTIONS, maxAge: REFRESH_TOKEN_MAX_AGE });
}
