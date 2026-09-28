import { RegistroDeErros } from "./registro-de-erros.service";

describe("RegistroDeErros", () => {
  const antes = process.env.ALERTA_WEBHOOK_URL;
  const fetchOriginal = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
    process.env.ALERTA_WEBHOOK_URL = "https://hooks.exemplo.com/x";
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
    if (antes === undefined) delete process.env.ALERTA_WEBHOOK_URL;
    else process.env.ALERTA_WEBHOOK_URL = antes;
  });

  function montar(existente: { resolvidoEm: Date | null } | null) {
    const prisma = {
      erroDaPlataforma: {
        findUnique: jest.fn().mockResolvedValue(existente),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    return { servico: new RegistroDeErros(prisma as never), prisma };
  }

  const erro = { origem: "api" as const, tipo: "Error", mensagem: "falhou ao ler lead 42" };

  it("erro novo avisa a equipe, com texto que Slack e Discord leem", async () => {
    const { servico } = montar(null);
    await servico.registra(erro);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const corpo = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(corpo.text).toContain("Erro novo");
    expect(corpo.content).toBe(corpo.text);
  });

  it("o mesmo erro de novo só soma, sem avisar", async () => {
    const { servico, prisma } = montar({ resolvidoEm: null });
    await servico.registra(erro);

    expect(prisma.erroDaPlataforma.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ ocorrencias: { increment: 1 }, resolvidoEm: null }) }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("erro resolvido que volta avisa que voltou", async () => {
    const { servico } = montar({ resolvidoEm: new Date() });
    await servico.registra(erro);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).text).toContain("Voltou a acontecer");
  });

  it("sem webhook configurado, só registra", async () => {
    delete process.env.ALERTA_WEBHOOK_URL;
    const { servico, prisma } = montar(null);
    await servico.registra(erro);

    expect(prisma.erroDaPlataforma.upsert).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("banco fora não derruba quem registrou", async () => {
    const { servico, prisma } = montar(null);
    prisma.erroDaPlataforma.findUnique.mockRejectedValue(new Error("conexão recusada"));
    await expect(servico.registra(erro)).resolves.toBeUndefined();
  });
});
