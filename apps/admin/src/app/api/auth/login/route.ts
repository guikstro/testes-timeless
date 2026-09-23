import { NextRequest, NextResponse } from "next/server";
import { cabecalhosDoCliente } from "@/lib/ip-do-cliente";
import { ADMIN_MFA_COOKIE, COOKIE_OPTIONS, MFA_MAX_AGE } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export async function POST(request: NextRequest) {
  const payload = await request.json();

  const resposta = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cabecalhosDoCliente(request) },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const body = await resposta.json();
  if (!resposta.ok) {
    return NextResponse.json(body, { status: resposta.status });
  }

  /*
    Toda conta de operador tem segundo fator, porque a administração o exige.
    Este ramo não é caso raro aqui: é o caminho normal.
  */
  if (body?.mfaObrigatorio) {
    const desafio = NextResponse.json({ mfaObrigatorio: true });
    desafio.cookies.set(ADMIN_MFA_COOKIE, body.desafio, { ...COOKIE_OPTIONS, maxAge: MFA_MAX_AGE });
    return desafio;
  }

  /*
    Senha certa, sem segundo fator: a conta pode até ser válida no site do
    cliente, mas aqui não entra.

    A recusa acontece antes de qualquer cookie ser gravado. Deixar entrar e
    barrar na primeira tela daria uma sessão de administração a quem a porta
    não devia ter aberto, mesmo que ela não servisse para nada depois.
  */
  return NextResponse.json(
    {
      code: "MFA_OBRIGATORIO",
      message:
        "A administração exige verificação em duas etapas. Configure em Configurações, Segurança, no painel do cliente.",
    },
    { status: 403 },
  );
}
