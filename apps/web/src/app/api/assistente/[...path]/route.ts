import { NextRequest, NextResponse } from "next/server";
import { repassaParaApi } from "@/lib/api-proxy";

/** Ponte do navegador para "Meu painel" (GET/PUT /painel) e a barra de perguntas (POST /busca). */
type Context = { params: Promise<{ path: string[] }> };

async function rota(context: Context): Promise<string | null> {
  const { path } = await context.params;
  if (path.length === 1 && (path[0] === "painel" || path[0] === "busca")) return path[0];
  return null;
}
const naoEncontrada = () => NextResponse.json({ message: "Rota não encontrada." }, { status: 404 });

export async function GET(request: NextRequest, context: Context) {
  return (await rota(context)) === "painel" ? repassaParaApi(request, "/painel") : naoEncontrada();
}

export async function PUT(request: NextRequest, context: Context) {
  if ((await rota(context)) !== "painel") return naoEncontrada();
  return repassaParaApi(request, "/painel", { method: "PUT", body: await request.text() });
}

export async function POST(request: NextRequest, context: Context) {
  if ((await rota(context)) !== "busca") return naoEncontrada();
  return repassaParaApi(request, "/busca", { method: "POST", body: await request.text() });
}
