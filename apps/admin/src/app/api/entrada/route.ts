import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ACCESS_COOKIE } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
const SITE_DO_CLIENTE = process.env.NEXT_PUBLIC_WEB_APP_URL ?? "http://localhost:3000";

/**
 * Pede o código de entrada e monta o endereço para onde mandar o navegador.
 *
 * O código não volta para a página: ele vem para cá, vira uma URL completa, e
 * a página só recebe para onde ir. Devolvê-lo ao JavaScript o exporia a
 * qualquer script rodando na aba, e ele vale uma sessão de cliente.
 *
 * A sessão do operador não é tocada. É a diferença em relação ao jeito
 * antigo, que a estacionava em cookies paralelos e contava com o "sair do
 * cliente" para restaurá-la: agora ela simplesmente fica onde estava, neste
 * site, enquanto o navegador vai para o outro.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const token = request.cookies.get(ADMIN_ACCESS_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ code: "UNAUTHORIZED", message: "Não autenticado." }, { status: 401 });
  }

  const { organizationId } = await request.json().catch(() => ({}));

  /*
    Só um id no formato de id, antes de virar pedaço de endereço.

    O valor vem do navegador e ia direto para o caminho da chamada à API: um
    "../../outra-rota?" faria este servidor chamar outra rota com o token do
    operador. A API também confere o formato, mas a essa altura a chamada já
    teria ido para o lugar errado.
  */
  if (typeof organizationId !== "string" || !UUID.test(organizationId)) {
    return NextResponse.json({ code: "VALIDATION_ERROR", message: "Organização inválida." }, { status: 400 });
  }

  const resposta = await fetch(`${API_URL}/admin/organizations/${encodeURIComponent(organizationId)}/entrada`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const body = await resposta.json();
  if (!resposta.ok) {
    return NextResponse.json(body, { status: resposta.status });
  }

  const destino = new URL("/entrar-como", SITE_DO_CLIENTE);
  destino.searchParams.set("codigo", body.entrega);

  return NextResponse.json({ destino: destino.toString(), organization: body.organization });
}
