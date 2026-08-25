import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tracking Platform",
  description: "Tracking e atribuição de conversões: anúncio → clique → WhatsApp → venda",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
