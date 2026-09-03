import { NextRequest } from "next/server";
import { repassaParaApi } from "@/lib/api-proxy";

/**
 * Repasse do envio de logo.
 *
 * Rota de repasse, e não ação de servidor: uma imagem de dois megabytes em
 * base64 passa dos dois e meio, e o limite padrão do corpo de uma ação é de
 * um megabyte. A recusa apareceria como erro genérico, sem dizer o motivo.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const corpo = await request.text();
  return repassaParaApi(request, "/organizations/current/logo", { method: "POST", body: corpo });
}

export async function DELETE(request: NextRequest) {
  return repassaParaApi(request, "/organizations/current/logo", { method: "DELETE" });
}
