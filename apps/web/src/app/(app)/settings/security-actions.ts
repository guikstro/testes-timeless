"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_MAX_AGE,
  SESSION_COOKIE_OPTIONS,
} from "@/lib/session";

export interface EstadoDeSeguranca {
  erro?: string;
  /** Carimbo do sucesso, para o formulário limpar os campos sem confundir dois envios. */
  okEm?: number;
}

interface ParDeTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * A API derruba todas as sessões ao trocar a credencial e devolve um par novo.
 * Gravar esse par aqui é o que mantém quem trocou logado nesta aba, em vez de
 * ser expulso pela própria ação.
 */
async function guardaSessao(tokens: ParDeTokens): Promise<void> {
  const bau = await cookies();
  bau.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });
  bau.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });
}

export async function trocarSenha(
  _anterior: EstadoDeSeguranca,
  formData: FormData,
): Promise<EstadoDeSeguranca> {
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "");

  if (!currentPassword || !newPassword) {
    return { erro: "Preencha a senha atual e a nova." };
  }
  if (newPassword.length < 8) {
    return { erro: "A nova senha precisa ter ao menos oito caracteres." };
  }
  // Conferida aqui e não só no servidor: digitar errado duas vezes é o jeito
  // mais comum de sair com uma senha que não se sabe qual é.
  if (newPassword !== confirmacao) {
    return { erro: "A confirmação não confere com a nova senha." };
  }

  try {
    const tokens = await apiFetch<ParDeTokens>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    await guardaSessao(tokens);
  } catch (error) {
    if (error instanceof ApiRequestError) return { erro: error.body.message };
    return { erro: "Não foi possível trocar a senha." };
  }

  revalidatePath("/settings");
  return { okEm: Date.now() };
}

export async function trocarEmail(
  _anterior: EstadoDeSeguranca,
  formData: FormData,
): Promise<EstadoDeSeguranca> {
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newEmail = String(formData.get("newEmail") ?? "").trim();
  const confirmacao = String(formData.get("confirmacao") ?? "").trim();

  if (!currentPassword || !newEmail) {
    return { erro: "Preencha a senha atual e o novo e-mail." };
  }
  /*
    Digitado duas vezes de propósito. O produto ainda não envia e-mail, então
    não há confirmação no endereço novo: um erro de digitação vira o login, e
    a recuperação de senha iria para um endereço que não existe.
  */
  if (newEmail.toLowerCase() !== confirmacao.toLowerCase()) {
    return { erro: "Os dois e-mails não são iguais. Confira antes de salvar." };
  }

  try {
    const tokens = await apiFetch<ParDeTokens>("/auth/email", {
      method: "PATCH",
      body: JSON.stringify({ currentPassword, newEmail }),
    });
    await guardaSessao(tokens);
  } catch (error) {
    if (error instanceof ApiRequestError) return { erro: error.body.message };
    return { erro: "Não foi possível trocar o e-mail." };
  }

  revalidatePath("/settings");
  return { okEm: Date.now() };
}
