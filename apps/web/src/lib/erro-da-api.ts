import type { ApiError } from "./api-client";

/** A mensagem padrão do Express para rota desconhecida: "Cannot PUT /api/...". */
const ROTA_INEXISTENTE = /^Cannot (GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS) \//;

/**
 * O erro da API em palavras que a tela pode mostrar.
 *
 * Quando o site é publicado antes da API, a rota nova ainda não existe do
 * outro lado, e a resposta é o texto cru do Express, em inglês e com o
 * caminho. A API nova já troca isso na origem; este passo cobre a API que
 * ainda está no ar.
 */
export function erroLegivel(corpo: ApiError | null, status: number): ApiError {
  if (!corpo) return { code: "UNKNOWN", message: "Erro desconhecido." };
  if (status === 404 && ROTA_INEXISTENTE.test(corpo.message ?? "")) {
    return {
      code: "ROTA_INEXISTENTE",
      message: "Esta função ainda não chegou ao servidor. Tente de novo em alguns minutos.",
    };
  }
  return corpo;
}
