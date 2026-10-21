import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import { ThemeScript } from "@/components/theme-script";
import "./globals.css";

// `display: swap` e `variable`: o texto aparece na fonte do sistema e troca
// quando a web font chega, em vez de a tela ficar em branco esperando.
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-sans" });
const manrope = Manrope({ subsets: ["latin"], display: "swap", variable: "--font-display" });

export const metadata: Metadata = {
  title: "Tracking Platform",
  description: "Tracking e atribuição de conversões: anúncio → clique → WhatsApp → venda",
  manifest: "/manifest.webmanifest",
  // No iPhone, os avisos só chegam para o sistema instalado na tela inicial.
  appleWebApp: { capable: true, title: "Timeless" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${manrope.variable}`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
