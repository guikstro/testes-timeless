import { ExigeArea } from "@/components/exige-area";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ExigeArea caminho="/relatorio">{children}</ExigeArea>;
}
