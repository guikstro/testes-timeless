import { notFound } from "next/navigation";
import { sessaoAtual } from "@/lib/sessao";
import { Catalogo } from "./catalogo";

export const metadata = { title: "Componentes" };

/**
 * O catálogo do design system: cada componente, com as variantes e os
 * estados, nos dois temas. Só para a equipe Timeless, que é quem constrói
 * telas; para qualquer outra pessoa a página não existe.
 */
export default async function PaginaDoCatalogo() {
  const sessao = await sessaoAtual();
  if (!sessao.user.platformRole || sessao.impersonating) notFound();
  return <Catalogo />;
}
