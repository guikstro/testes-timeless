import { NextRequest } from "next/server";
import { repassaParaApi } from "@/lib/api-proxy";

export const dynamic = "force-dynamic";

/**
 * A ficha do lead para o lado do cliente.
 *
 * A caixa de entrada troca de conversa sem recarregar a página, então ela
 * precisa buscar a ficha do navegador. As telas de servidor continuam usando
 * `apiFetch` direto.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return repassaParaApi(request, `/leads/${encodeURIComponent(id)}`);
}
