import { NextRequest } from "next/server";
import { repassaParaApi } from "@/lib/api-proxy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Filtros repassados como vieram: a validação de verdade é da API, e
  // duplicá-la aqui criaria duas regras para envelhecerem separadas.
  return repassaParaApi(request, `/conversations${request.nextUrl.search}`);
}
