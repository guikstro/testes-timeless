import { NextRequest } from "next/server";
import { repassaParaApi } from "@/lib/api-proxy";
import { cabecalhosDoCliente } from "@/lib/ip-do-cliente";

/** Repassa a consulta da página pública do link, com o IP de quem abriu (o limite de requisições conta por ele). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return repassaParaApi(request, `/publico/whatsapp/${encodeURIComponent(token)}`, {
    headers: cabecalhosDoCliente(request),
  });
}
