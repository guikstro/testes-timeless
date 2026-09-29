import { ExigeArea } from "@/components/exige-area";

/** O WhatsApp é de quem vive de lead: presença local volta para a tela inicial. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ExigeArea caminho="/integrations/whatsapp">{children}</ExigeArea>;
}
