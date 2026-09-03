import { FaxinaService } from "./faxina.service";
import { PrismaService } from "../../common/prisma/prisma.service";

describe("FaxinaService", () => {
  function montar() {
    const prisma = { $executeRaw: jest.fn().mockResolvedValue(0) };
    return { servico: new FaxinaService(prisma as unknown as PrismaService), prisma };
  }

  afterEach(() => {
    delete process.env.NOTIFICATION_RETENTION_DAYS;
  });

  /**
   * As consultas montadas, já remontadas em texto.
   *
   * O `$executeRaw` é chamado como template marcado: o primeiro argumento são
   * os pedaços de texto e o resto são os valores, incluindo os identificadores
   * que entram por `Prisma.raw`. Sem remontar os dois, o nome da tabela não
   * aparece em lugar nenhum do que dá para inspecionar.
   */
  function consultas(prisma: { $executeRaw: jest.Mock }) {
    return prisma.$executeRaw.mock.calls.map((chamada) => {
      const [partes, ...valores] = chamada as [string[], ...unknown[]];
      const texto = partes
        .map((pedaco, i) => {
          const valor = valores[i] as { strings?: string[] } | undefined;
          return pedaco + (valor?.strings?.[0] ?? (i < valores.length ? "?" : ""));
        })
        .join("");
      return { sql: texto, limite: valores.find((v) => v instanceof Date) as Date | undefined };
    });
  }

  it("limpa as três tabelas efêmeras", async () => {
    const { servico, prisma } = montar();

    const resultado = await servico.executar();

    const sqls = consultas(prisma).map((c) => c.sql).join(" ");
    expect(sqls).toContain("refresh_tokens");
    expect(sqls).toContain("password_reset_tokens");
    expect(sqls).toContain("notifications");
    expect(resultado).toEqual({ tokensDeSessao: 0, tokensDeRecuperacao: 0, avisos: 0 });
  });

  it("nunca toca no que é medição ou histórico do produto", async () => {
    const { servico, prisma } = montar();

    await servico.executar();

    // Mensagem, evento de lead, clique e auditoria são o que aconteceu.
    // Apagá-los seria reescrever o histórico, e a decisão de quanto guardar
    // disso é do cliente, não de uma rotina de limpeza.
    const sqls = consultas(prisma).map((c) => c.sql).join(" ");
    for (const intocavel of ["messages", "lead_events", "tracking_clicks", "audit_logs", "leads", "sales"]) {
      expect(sqls).not.toContain(intocavel);
    }
  });

  it("apaga em lotes enquanto houver lote cheio", async () => {
    const { servico, prisma } = montar();
    // Dois lotes cheios e um parcial na primeira tabela; as outras já vazias.
    prisma.$executeRaw
      .mockResolvedValueOnce(5000)
      .mockResolvedValueOnce(5000)
      .mockResolvedValueOnce(12)
      .mockResolvedValue(0);

    const resultado = await servico.executar();

    // Um DELETE sobre a tabela inteira segura trava até terminar, e a
    // primeira execução numa base nunca limpa é a maior de todas.
    expect(resultado.tokensDeSessao).toBe(10012);
  });

  it("para no primeiro lote que não veio cheio", async () => {
    const { servico, prisma } = montar();
    prisma.$executeRaw.mockResolvedValue(0);

    await servico.executar();

    // Uma consulta por tabela quando não há nada a apagar.
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(3);
  });

  it("usa noventa dias de retenção de avisos por padrão", async () => {
    const { servico, prisma } = montar();
    const antes = Date.now();

    await servico.executar();

    const limiteDosAvisos = consultas(prisma)[2].limite as Date;
    const dias = Math.round((antes - limiteDosAvisos.getTime()) / 86_400_000);
    expect(dias).toBe(90);
  });

  it("respeita a retenção configurada", async () => {
    process.env.NOTIFICATION_RETENTION_DAYS = "30";
    const { servico, prisma } = montar();
    const antes = Date.now();

    await servico.executar();

    const limiteDosAvisos = consultas(prisma)[2].limite as Date;
    expect(Math.round((antes - limiteDosAvisos.getTime()) / 86_400_000)).toBe(30);
  });

  it("não aceita uma retenção que apagaria o aviso antes de a pessoa voltar de férias", async () => {
    process.env.NOTIFICATION_RETENTION_DAYS = "1";
    const { servico, prisma } = montar();
    const antes = Date.now();

    await servico.executar();

    const limiteDosAvisos = consultas(prisma)[2].limite as Date;
    expect(Math.round((antes - limiteDosAvisos.getTime()) / 86_400_000)).toBe(7);
  });
});
