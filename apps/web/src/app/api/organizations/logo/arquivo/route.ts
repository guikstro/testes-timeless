import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
const TETO = 3 * 1024 * 1024;

/**
 * O logo da organização da sessão, servido por este domínio.
 *
 * O arquivo mora na API, que é outro endereço, e o navegador não deixa ler
 * os pixels de uma imagem de outro endereço. Sem isto, a tela de aparência
 * não conseguiria sugerir as cores do próprio logo.
 *
 * Só serve o logo enviado pelo sistema, e da organização de quem pede: o nome
 * do arquivo sai do cadastro, nunca da requisição, então não vira um jeito de
 * buscar endereço qualquer pelo servidor.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const organizacao = await apiFetch<{ logoUrl: string | null }>("/organizations/current").catch(() => null);
  const nome = organizacao?.logoUrl ? /\/uploads\/([\w.-]+)$/.exec(organizacao.logoUrl)?.[1] : undefined;
  if (!nome) return new NextResponse(null, { status: 404 });

  const resposta = await fetch(`${new URL(API_URL).origin}/uploads/${nome}`, { cache: "no-store" });
  const tipo = resposta.headers.get("content-type") ?? "";
  if (!resposta.ok || !tipo.startsWith("image/")) return new NextResponse(null, { status: 404 });

  const corpo = await resposta.arrayBuffer();
  if (corpo.byteLength > TETO) return new NextResponse(null, { status: 413 });
  return new NextResponse(corpo, { headers: { "Content-Type": tipo, "Cache-Control": "private, max-age=300" } });
}
