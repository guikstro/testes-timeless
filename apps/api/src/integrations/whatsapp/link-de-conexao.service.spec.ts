import { LinkDeConexaoService } from "./link-de-conexao.service";

/** Redis em memória com o pedaço que o serviço usa. O TTL não expira sozinho: basta para as regras testadas. */
function redisFalso() {
  const dados = new Map<string, string>();
  const redis = {
    get: async (chave: string) => dados.get(chave) ?? null,
    ttl: async (chave: string) => (dados.has(chave) ? 86400 : -2),
    del: async (...chaves: string[]) => chaves.forEach((chave) => dados.delete(chave)),
    quit: async () => undefined,
    multi: () => {
      const operacoes: Array<() => void> = [];
      const transacao = {
        del: (chave: string) => (operacoes.push(() => dados.delete(chave)), transacao),
        set: (chave: string, valor: string) => (operacoes.push(() => dados.set(chave, valor)), transacao),
        exec: async () => operacoes.forEach((operacao) => operacao()),
      };
      return transacao;
    },
  };
  return { redis, dados };
}

const mockRedisFalso = redisFalso();
jest.mock("../../common/queue/redis-connection", () => ({ criaConexaoRedis: () => mockRedisFalso.redis }));

const tokenDe = (url: string) => url.split("/conectar-whatsapp/")[1];

describe("LinkDeConexaoService", () => {
  const conexoes = {
    getCurrent: jest.fn(),
    getQrCode: jest.fn(),
    connectViaQrCode: jest.fn().mockResolvedValue({ status: "PENDING_QR", qrCodeBase64: "data:qr" }),
  };
  const prisma = { organization: { findFirst: jest.fn().mockResolvedValue({ name: "Acme" }) } };
  const auditoria = { registra: jest.fn() };
  const service = new LinkDeConexaoService(prisma as never, conexoes as never, auditoria as never);

  beforeEach(() => {
    mockRedisFalso.dados.clear();
    conexoes.getCurrent.mockResolvedValue(null);
    process.env.WEB_APP_URL = "https://site.exemplo.com";
  });

  it("guarda só o hash: o token não aparece em nenhuma chave nem valor", async () => {
    const token = tokenDe((await service.gera("org-1")).url);

    const tudo = [...mockRedisFalso.dados.keys(), ...mockRedisFalso.dados.values()].join(" ");
    expect(tudo).not.toContain(token);
  });

  it("o link leva ao QR da organização certa e registra quem iniciou", async () => {
    const token = tokenDe((await service.gera("org-1")).url);

    await expect(service.situacao(token)).resolves.toEqual({ organizacao: "Acme", status: "PENDING_QR", qrCodeBase64: "data:qr" });
    expect(conexoes.connectViaQrCode).toHaveBeenCalledWith("org-1");
    expect(auditoria.registra).toHaveBeenCalled();
  });

  it("recusa token inventado sem dizer por quê", async () => {
    await expect(service.situacao("qualquer-coisa")).rejects.toMatchObject({ response: { code: "LINK_INVALIDO" } });
  });

  it("gerar um link novo invalida o anterior", async () => {
    const antigo = tokenDe((await service.gera("org-1")).url);
    await service.gera("org-1");

    await expect(service.situacao(antigo)).rejects.toMatchObject({ response: { code: "LINK_INVALIDO" } });
  });

  it("organização já conectada: não reinicia o QR e o link deixa de valer", async () => {
    const token = tokenDe((await service.gera("org-1")).url);
    conexoes.getCurrent.mockResolvedValue({ status: "CONNECTED", provider: "EVOLUTION" });
    conexoes.connectViaQrCode.mockClear();

    await expect(service.situacao(token)).resolves.toMatchObject({ status: "CONNECTED" });
    expect(conexoes.connectViaQrCode).not.toHaveBeenCalled();
    await expect(service.situacao(token)).rejects.toMatchObject({ response: { code: "LINK_INVALIDO" } });
  });

  it("um cliente não enxerga o link do outro", async () => {
    const doCliente1 = tokenDe((await service.gera("org-1")).url);
    await service.gera("org-2");

    await service.situacao(doCliente1);
    expect(conexoes.connectViaQrCode).toHaveBeenLastCalledWith("org-1");
  });
});
