import type { Metadata } from "next";
import { ConexaoPeloLink } from "./conexao-pelo-link";

export const metadata: Metadata = {
  title: "Conectar WhatsApp",
  // O token está na URL: não pode vazar para outros sites pelo cabeçalho Referer.
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function ConectarWhatsAppPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ConexaoPeloLink token={token} />;
}
