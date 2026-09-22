"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError } from "@/lib/api-client";

export interface EstadoDoMfa {
  erro?: string;
  /** Aparecem uma vez só, no retorno da confirmação. Nunca mais. */
  codigos?: string[];
  okEm?: number;
}

function motivo(erro: unknown, padrao: string): EstadoDoMfa {
  if (erro instanceof ApiRequestError) return { erro: erro.body.message };
  return { erro: padrao };
}

/**
 * Começa a inscrição e devolve o segredo e o endereço do QR.
 *
 * O QR é desenhado no servidor a partir deste endereço, e o segredo não sai
 * daqui para lugar nenhum além da própria tela: usar um serviço externo de QR
 * seria entregar a chave do segundo fator a um terceiro.
 */
export async function iniciarInscricao(): Promise<
  { segredo: string; endereco: string } | { erro: string }
> {
  try {
    return await apiFetch<{ segredo: string; endereco: string }>("/auth/mfa/inscricao", { method: "POST" });
  } catch (erro) {
    return motivo(erro, "Não foi possível começar a configuração.") as { erro: string };
  }
}

export async function confirmarInscricao(
  _anterior: EstadoDoMfa,
  formData: FormData,
): Promise<EstadoDoMfa> {
  const codigo = String(formData.get("codigo") ?? "").trim();
  if (!codigo) return { erro: "Digite o código de seis dígitos do aplicativo." };

  try {
    const { codigos } = await apiFetch<{ codigos: string[] }>("/auth/mfa/inscricao/confirmar", {
      method: "POST",
      body: JSON.stringify({ codigo }),
    });
    revalidatePath("/settings");
    return { codigos, okEm: Date.now() };
  } catch (erro) {
    return motivo(erro, "Não foi possível confirmar o código.");
  }
}

export async function cancelarInscricao(): Promise<void> {
  try {
    await apiFetch("/auth/mfa/inscricao", { method: "DELETE" });
  } catch {
    // A tela relista de qualquer jeito; falhar aqui não pode prender ninguém
    // numa configuração pela metade.
  }
  revalidatePath("/settings");
}

export async function regenerarCodigos(
  _anterior: EstadoDoMfa,
  formData: FormData,
): Promise<EstadoDoMfa> {
  const codigo = String(formData.get("codigo") ?? "").trim();
  if (!codigo) return { erro: "Confirme com o código do aplicativo." };

  try {
    const { codigos } = await apiFetch<{ codigos: string[] }>("/auth/mfa/codigos", {
      method: "POST",
      body: JSON.stringify({ codigo }),
    });
    revalidatePath("/settings");
    return { codigos, okEm: Date.now() };
  } catch (erro) {
    return motivo(erro, "Não foi possível gerar códigos novos.");
  }
}

export async function desativarMfa(
  _anterior: EstadoDoMfa,
  formData: FormData,
): Promise<EstadoDoMfa> {
  const senha = String(formData.get("senha") ?? "");
  const codigo = String(formData.get("codigo") ?? "").trim();

  if (!senha) return { erro: "Digite sua senha." };
  if (!codigo) return { erro: "Digite o código do aplicativo ou um de recuperação." };

  try {
    await apiFetch("/auth/mfa", { method: "DELETE", body: JSON.stringify({ senha, codigo }) });
    revalidatePath("/settings");
    return { okEm: Date.now() };
  } catch (erro) {
    return motivo(erro, "Não foi possível desativar.");
  }
}
