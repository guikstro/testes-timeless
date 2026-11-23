import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";

/** Os blocos que a tela "Meu painel" sabe desenhar. */
export const TIPOS_DE_BLOCO = [
  "numero-leads",
  "numero-qualificados",
  "numero-clientes",
  "numero-faturamento",
  "grafico-diario",
  "origens",
  "links",
  "teste-ab",
  "atendimento",
] as const;
export type TipoDeBloco = (typeof TIPOS_DE_BLOCO)[number];

export interface Bloco {
  id: string;
  tipo: TipoDeBloco;
  /** 1 = um terço da largura, 2 = dois terços, 3 = largura toda. */
  largura: 1 | 2 | 3;
  /** Só no teste A/B: os dois links comparados. */
  linkA?: string;
  linkB?: string;
}

/** O painel de quem ainda não montou o seu. */
export const PAINEL_PADRAO: Bloco[] = [
  { id: "p1", tipo: "numero-leads", largura: 1 },
  { id: "p2", tipo: "numero-qualificados", largura: 1 },
  { id: "p3", tipo: "numero-clientes", largura: 1 },
  { id: "p4", tipo: "grafico-diario", largura: 3 },
  { id: "p5", tipo: "links", largura: 2 },
  { id: "p6", tipo: "atendimento", largura: 1 },
];

const MAXIMO_DE_BLOCOS = 24;

/** Confere o que veio do navegador: só passa bloco conhecido e bem formado. */
export function validaBlocos(entrada: unknown): Bloco[] {
  if (!Array.isArray(entrada)) throw new BadRequestException("blocos precisa ser uma lista");
  if (entrada.length > MAXIMO_DE_BLOCOS) throw new BadRequestException(`no máximo ${MAXIMO_DE_BLOCOS} blocos`);
  const ids = new Set<string>();
  return entrada.map((item, i) => {
    const b = item as Partial<Bloco>;
    if (!b || typeof b !== "object") throw new BadRequestException(`bloco ${i + 1} inválido`);
    if (!TIPOS_DE_BLOCO.includes(b.tipo as TipoDeBloco)) throw new BadRequestException(`bloco ${i + 1}: tipo desconhecido`);
    if (typeof b.id !== "string" || !/^[\w-]{1,40}$/.test(b.id) || ids.has(b.id)) {
      throw new BadRequestException(`bloco ${i + 1}: id inválido`);
    }
    ids.add(b.id);
    const largura = b.largura === 2 || b.largura === 3 ? b.largura : 1;
    const bloco: Bloco = { id: b.id, tipo: b.tipo as TipoDeBloco, largura };
    if (b.tipo === "teste-ab") {
      const uuid = /^[0-9a-f-]{36}$/i;
      if (typeof b.linkA === "string" && uuid.test(b.linkA)) bloco.linkA = b.linkA;
      if (typeof b.linkB === "string" && uuid.test(b.linkB)) bloco.linkB = b.linkB;
    }
    return bloco;
  });
}

@Injectable()
export class PainelService {
  constructor(private readonly prisma: PrismaService) {}

  async le(organizationId: string, userId: string): Promise<{ blocos: Bloco[]; padrao: boolean }> {
    const salvo = await this.prisma.painelPersonalizado.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!salvo) return { blocos: PAINEL_PADRAO, padrao: true };
    return { blocos: validaBlocos(salvo.blocos), padrao: false };
  }

  async salva(organizationId: string, userId: string, entrada: unknown): Promise<{ blocos: Bloco[] }> {
    const blocos = validaBlocos(entrada);
    await this.prisma.painelPersonalizado.upsert({
      where: { organizationId_userId: { organizationId, userId } },
      create: { organizationId, userId, blocos: blocos as object[] },
      update: { blocos: blocos as object[] },
    });
    return { blocos };
  }
}
