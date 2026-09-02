import { NextRequest } from "next/server";
import { repassaParaApi } from "@/lib/api-proxy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Repassa os filtros como vieram: a validação de verdade é da API, e
  // duplicá-la aqui só criaria duas regras para envelhecerem separadas.
  const busca = request.nextUrl.search;
  return repassaParaApi(request, `/notifications${busca}`);
}
