import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import { ThemeScript } from "@/components/theme-script";
import "./globals.css";

// `display: swap` e `variable`: o texto aparece na fonte do sistema e troca
// quando a web font chega, em vez de a tela ficar em branco esperando.
// Bricolage Grotesque nos títulos e números: tem personalidade sem virar
// enfeite, e os números grandes do resumo ganham peso próprio. Instrument Sans
// no texto: legível em tamanho pequeno e menos genérica que a Inter, que é a
// fonte de quase todo sistema.
const textos = Instrument_Sans({ subsets: ["latin"], display: "swap", variable: "--font-sans" });
const titulos = Bricolage_Grotesque({ subsets: ["latin"], display: "swap", variable: "--font-display" });

export const metadata: Metadata = {
  title: { default: "Timeless", template: "%s | Timeless" },
  description: "Anúncios, conversas e vendas no mesmo lugar, com a origem de cada cliente provada.",
  manifest: "/manifest.webmanifest",
  // No iPhone, os avisos só chegam para o sistema instalado na tela inicial.
  appleWebApp: { capable: true, title: "Timeless" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${textos.variable} ${titulos.variable}`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
