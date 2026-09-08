import { ConversationsService } from "./conversations.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { TETO_DE_CONVERSAS } from "./caixa-de-entrada";
import type { LinhaDaCaixa } from "./caixa-de-entrada";

/**
 * O QUE a consulta traz é conferido contra Postgres de verdade, em
 * `test/conversations.e2e-spec.ts`: a regra de pendência virou SQL, e um
 * dublê aqui só provaria que eu escrevi a string que escrevi.
 *
 * O que sobra para este arquivo é o contorno: escopo por organização, o que a
 * busca repassa, e o aviso de lista cortada.
 */
describe("ConversationsService", () => {
  function montar(linhas: Partial<LinhaDaCaixa>[] = []) {
    const completas = linhas.map((l, i) => ({
      id: `conv-${i}`,
      lastMessageAt: new Date("2026-03-01T10:00:00.000Z"),
      leadId: `lead-${i}`,
      leadName: "Ana",
      normalizedPhone: "5585999999999",
      rawPhone: "5585999999999",
      status: "NEW" as const,
      disqualifiedAt: null,
      naoRespondidas: 0,
      esperaDesde: null,
      ultimaDirecao: "INBOUND" as const,
      ultimoTipo: "TEXT" as const,
      ultimoTexto: "oi",
      ultimaEm: new Date("2026-03-01T10:00:00.000Z"),
      ...l,
    }));
    const prisma = { $queryRaw: jest.fn().mockResolvedValue(completas) };
    return { service: new ConversationsService(prisma as unknown as PrismaService), prisma };
  }

  /** O SQL montado, já com os valores no lugar, para conferir o que ele contém. */
  function sqlMontado(prisma: { $queryRaw: jest.Mock }) {
    const consulta = prisma.$queryRaw.mock.calls[0][0] as { sql: string; values: unknown[] };
    return { texto: consulta.sql, valores: consulta.values };
  }

  it("escopa a consulta à organização de quem pediu", async () => {
    const { service, prisma } = montar();

    await service.list("org-1");

    const { texto, valores } = sqlMontado(prisma);
    expect(texto).toContain("c.organization_id =");
    expect(valores).toContain("org-1");
  });

  it("procura por nome e por telefone só com os dígitos", async () => {
    const { service, prisma } = montar();

    await service.list("org-1", { search: "(85) 99999-9999" });

    const { texto, valores } = sqlMontado(prisma);
    expect(texto).toContain("l.name ILIKE");
    expect(texto).toContain("l.normalized_phone LIKE");
    // Ninguém digita o número do jeito que ele está guardado.
    expect(valores).toContain("%85999999999%");
  });

  it("não procura por telefone quando o termo quase não tem dígitos", async () => {
    const { service, prisma } = montar();

    await service.list("org-1", { search: "An4" });

    const { texto } = sqlMontado(prisma);
    // Um dígito só casaria com quase todo número da base. A coluna continua
    // aparecendo na seleção, então o que se confere é a comparação.
    expect(texto).toContain("l.name ILIKE");
    expect(texto).not.toContain("l.normalized_phone LIKE");
  });

  it("não filtra nada quando a busca vem vazia", async () => {
    const { service, prisma } = montar();

    await service.list("org-1", { search: "   " });

    expect(sqlMontado(prisma).texto).not.toContain("ILIKE");
  });

  /*
    A regressão que motivou mover o filtro para o banco.

    A lista era cortada em duzentas por atividade recente e só então filtrada
    em memória. Quem espera resposta há mais tempo tem, por definição, a
    atividade mais antiga, então o filtro escondia exatamente os leads mais
    abandonados. Na base de demonstração, oitenta esperavam e a tela mostrava
    quarenta e quatro.
  */
  it("pede ao banco só quem está sem resposta, e os mais esquecidos primeiro", async () => {
    const { service, prisma } = montar();

    await service.list("org-1", { status: "awaiting" });

    const { texto } = sqlMontado(prisma);
    expect(texto).toContain("p.espera_desde IS NOT NULL");
    expect(texto).toContain("ORDER BY p.espera_desde ASC");
    // O corte vem depois do filtro, que é a correção inteira.
    expect(texto.indexOf("WHERE p.espera_desde")).toBeLessThan(texto.indexOf("LIMIT"));
  });

  it("lista as não lidas pela atividade mais recente, como uma caixa de entrada", async () => {
    const { service, prisma } = montar();

    await service.list("org-1", { status: "unread" });

    const { texto } = sqlMontado(prisma);
    expect(texto).toContain("COALESCE(p.nao_respondidas, 0) > 0");
    expect(texto).toContain("ORDER BY c.last_message_at DESC");
  });

  it("avisa quando a lista foi cortada no teto", async () => {
    const { service } = montar(Array.from({ length: TETO_DE_CONVERSAS }, () => ({})));

    expect((await service.list("org-1")).truncado).toBe(true);
  });

  it("não se diz cortada quando coube tudo", async () => {
    const { service } = montar([{}, {}]);

    expect((await service.list("org-1")).truncado).toBe(false);
  });
});
