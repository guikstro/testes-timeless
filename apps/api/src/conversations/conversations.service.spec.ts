import { ConversationsService } from "./conversations.service";
import { PrismaService } from "../common/prisma/prisma.service";

describe("ConversationsService", () => {
  function buildService(conversas: unknown[] = []) {
    const prisma = { conversation: { findMany: jest.fn().mockResolvedValue(conversas) } };
    return { service: new ConversationsService(prisma as unknown as PrismaService), prisma };
  }

  const linha = (over: Record<string, unknown> = {}) => ({
    id: "c1",
    lastMessageAt: new Date(),
    lead: {
      id: "lead-1",
      name: "Ana",
      normalizedPhone: "+5511999999999",
      rawPhone: "5511999999999",
      status: "NEW",
      disqualifiedAt: null,
    },
    messages: [],
    ...over,
  });

  it("escopa a consulta à organização de quem pediu e ordena pela mais recente", async () => {
    const { service, prisma } = buildService();

    await service.list("org-1");

    const argumentos = prisma.conversation.findMany.mock.calls[0][0];
    expect(argumentos.where.organizationId).toBe("org-1");
    expect(argumentos.orderBy).toEqual({ lastMessageAt: "desc" });
  });

  it("procura por nome e por telefone só com os dígitos", async () => {
    const { service, prisma } = buildService();

    await service.list("org-1", { search: "(11) 99999-9999" });

    const alternativas = prisma.conversation.findMany.mock.calls[0][0].where.lead.OR;
    expect(alternativas).toContainEqual({ name: { contains: "(11) 99999-9999", mode: "insensitive" } });
    // Ninguém digita o número do jeito que ele está guardado: o banco tem
    // "+5511999999999" e a pessoa escreve com parênteses e traço.
    expect(alternativas).toContainEqual({ normalizedPhone: { contains: "11999999999" } });
  });

  it("não procura por telefone quando o termo quase não tem dígitos", async () => {
    const { service, prisma } = buildService();

    await service.list("org-1", { search: "Ana" });

    const alternativas = prisma.conversation.findMany.mock.calls[0][0].where.lead.OR;
    expect(alternativas).toHaveLength(1);
  });

  it("não filtra nada quando a busca vem vazia", async () => {
    const { service, prisma } = buildService();

    await service.list("org-1", { search: "   " });

    expect(prisma.conversation.findMany.mock.calls[0][0].where).toEqual({ organizationId: "org-1" });
  });

  it("avisa quando a lista foi cortada no teto", async () => {
    const { service } = buildService(Array.from({ length: 200 }, (_, i) => linha({ id: `c${i}` })));

    const resultado = await service.list("org-1");

    // "Não encontrei" e "não procurei além daqui" não podem virar a mesma
    // frase na tela.
    expect(resultado.truncado).toBe(true);
    expect(resultado.total).toBe(200);
  });

  it("não se diz cortada quando coube tudo", async () => {
    const { service } = buildService([linha()]);

    await expect(service.list("org-1")).resolves.toMatchObject({ truncado: false, total: 1 });
  });
});
