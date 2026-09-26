import type { Metadata } from "next";
import { AceitaConvite } from "./aceita-convite";

export const metadata: Metadata = {
  title: "Convite",
  // O token está na URL: não pode vazar para outros sites pelo cabeçalho Referer.
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AceitaConvite token={token} />;
}
