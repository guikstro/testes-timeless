import { Prisma } from "@prisma/client";
import { slugify } from "./slugify";

/**
 * O primeiro slug livre para o nome: `acme`, depois `acme-1`, `acme-2`...
 *
 * Não é atômico: o índice único de `slug` é quem decide no fim. Serve ao
 * cadastro e à criação de cliente pelo painel da plataforma.
 */
export async function slugLivre(db: Pick<Prisma.TransactionClient, "organization">, nome: string): Promise<string> {
  const base = slugify(nome) || "org";
  for (let sufixo = 0; ; sufixo++) {
    const slug = sufixo === 0 ? base : `${base}-${sufixo}`;
    if (!(await db.organization.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
}
