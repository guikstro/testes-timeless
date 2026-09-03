import { NextRequest } from "next/server";
import { repassaParaApi } from "@/lib/api-proxy";

/**
 * Repasse do relato de erro do navegador.
 *
 * Sem sessão do lado da API, porque a tela de login também quebra, mas ainda
 * assim passa por aqui: o navegador não alcança o endereço interno da API.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const corpo = await request.text();
  return repassaParaApi(request, "/telemetria/erro", { method: "POST", body: corpo });
}
