"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError } from "@/lib/api-client";

export interface ResultadoDoControle {
  erro?: string;
  aviso?: string;
  okEm?: number;
}

/**
 * Pausar e reativar um anúncio.
 *
 * O servidor é quem decide se pode: o papel de quem clicou, o escopo da conta
 * e o teto da verba são conferidos lá. Esconder o botão aqui é cortesia, não
 * segurança, e esta ação existe justamente para não haver um caminho em que a
 * cortesia vira a única trava.
 */
export async function mudarStatusDoAnuncio(
  externalId: string,
  desejado: "pausar" | "ativar",
): Promise<ResultadoDoControle> {
  try {
    await apiFetch(`/controle-de-anuncios/anuncios/${encodeURIComponent(externalId)}/${desejado}`, {
      method: "POST",
    });
  } catch (erro) {
    if (erro instanceof ApiRequestError) return { erro: erro.body.message };
    return { erro: "Não foi possível falar com a Meta agora." };
  }

  revalidatePath("/verba");
  return { okEm: Date.now() };
}
