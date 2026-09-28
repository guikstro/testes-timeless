import { NextResponse } from "next/server";

// Lida a cada pedido, e não no build: o valor é o do serviço que está no ar.
export const dynamic = "force-dynamic";

/**
 * Qual commit o site está servindo. O Render preenche `RENDER_GIT_COMMIT`
 * sozinho a cada publicação; o CI usa isto para saber que a versão nova
 * entrou antes de conferir a produção. Fora do Render, `null`.
 */
export function GET() {
  return NextResponse.json({ commit: process.env.RENDER_GIT_COMMIT ?? null }, { headers: { "Cache-Control": "no-store" } });
}
