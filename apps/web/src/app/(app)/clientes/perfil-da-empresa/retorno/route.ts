import { NextRequest } from "next/server";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { redireciona } from "@/lib/redireciona";

/** Só volta para dentro da área de clientes, como a API confere. */
const VOLTA = /^\/clientes(\/[A-Za-z0-9-]*)?$/;

/**
 * Para onde voltar, lido do estado sem conferir a assinatura: aqui ele só
 * escolhe a tela de volta, e só dentro de /clientes. Quem confere a
 * assinatura, o prazo e a pessoa é a API, antes de aceitar o código.
 */
function voltaDoEstado(estado: string | null): string {
  try {
    const dados = estado?.split(".")[0];
    const volta = dados ? (JSON.parse(Buffer.from(dados, "base64url").toString("utf8")) as { v?: unknown }).v : null;
    return typeof volta === "string" && VOLTA.test(volta) ? volta : "/clientes";
  } catch {
    return "/clientes";
  }
}

/**
 * A volta do Google depois do consentimento da conta da equipe.
 *
 * Rota, e não página: o código vem na URL, e uma página o deixaria na barra
 * de endereço e no histórico. Aqui ele é entregue à API e a pessoa segue para
 * a tela do cliente de onde começou, com o resultado no endereço.
 */
export async function GET(request: NextRequest) {
  const busca = request.nextUrl.searchParams;
  const volta = voltaDoEstado(busca.get("state"));
  const destino = (resultado: Record<string, string>) => redireciona(request, `${volta}?${new URLSearchParams(resultado).toString()}`);

  // A pessoa negou na tela do Google, ou o Google recusou antes de pedir.
  if (busca.get("error")) {
    return destino({ perfil: busca.get("error") === "access_denied" ? "recusado" : "erro", motivo: busca.get("error") ?? "" });
  }

  const codigo = busca.get("code");
  const estado = busca.get("state");
  if (!codigo || !estado) return destino({ perfil: "erro", motivo: "A volta do Google chegou sem o código." });

  try {
    await apiFetch("/admin/perfil-da-empresa/conexao", { method: "POST", body: JSON.stringify({ codigo, estado }) });
  } catch (error) {
    if (error instanceof ApiRequestError) return destino({ perfil: "erro", motivo: error.body.message.slice(0, 400) });
    throw error;
  }
  return destino({ perfil: "conectado" });
}
