import { confereAmbiente, enderecoPublico, origensPermitidas } from "./ambiente";

const CHAVE_VALIDA = "a".repeat(64);
const SEGREDO_VALIDO = "b".repeat(48);

describe("confereAmbiente", () => {
  const original = { ...process.env };
  const logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() } as never;

  beforeEach(() => {
    process.env = { ...original };
    process.env.DATABASE_URL = "postgresql://x";
    process.env.JWT_SECRET = SEGREDO_VALIDO;
    process.env.TOKEN_ENCRYPTION_KEY = CHAVE_VALIDA;
    process.env.REDIS_URL = "redis://x";
    process.env.WEB_APP_URL = "https://app.exemplo.com";
    process.env.PUBLIC_TRACKING_BASE_URL = "https://exemplo.com";
    process.env.NODE_ENV = "production";
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = original;
  });

  it("deixa subir quando está tudo no lugar", () => {
    expect(() => confereAmbiente("api", logger)).not.toThrow();
  });

  it("reclama de tudo que falta de uma vez", () => {
    delete process.env.DATABASE_URL;
    delete process.env.WEB_APP_URL;
    delete process.env.REDIS_URL;

    // Descobrir que faltam três variáveis uma a cada reinício é a pior forma
    // possível de descobrir isso.
    try {
      confereAmbiente("api", logger);
      throw new Error("devia ter recusado");
    } catch (erro) {
      const mensagem = (erro as Error).message;
      expect(mensagem).toContain("DATABASE_URL");
      expect(mensagem).toContain("WEB_APP_URL");
      expect(mensagem).toContain("REDIS_URL");
    }
  });

  it("recusa o segredo de exemplo do .env.example", () => {
    process.env.JWT_SECRET = "replace-with-a-long-random-secret";

    expect(() => confereAmbiente("api", logger)).toThrow(/JWT_SECRET/);
  });

  it("recusa um segredo curto demais para assinar sessão", () => {
    process.env.JWT_SECRET = "curto";

    expect(() => confereAmbiente("api", logger)).toThrow(/JWT_SECRET/);
  });

  it("recusa uma chave de cifra que não é hexadecimal", () => {
    // Sessenta e quatro caracteres quaisquer passavam e viravam uma chave
    // curta em silêncio; o erro só aparecia depois, dizendo outra coisa.
    process.env.TOKEN_ENCRYPTION_KEY = "z".repeat(64);

    expect(() => confereAmbiente("api", logger)).toThrow(/TOKEN_ENCRYPTION_KEY/);
  });

  it("recusa um endereço público apontando para localhost em produção", () => {
    process.env.PUBLIC_TRACKING_BASE_URL = "http://localhost:3001";

    // Este endereço fica gravado no banco e vai parar dentro de anúncio.
    expect(() => confereAmbiente("api", logger)).toThrow(/PUBLIC_TRACKING_BASE_URL/);
  });

  it("não cobra do worker o que é só da API", () => {
    delete process.env.WEB_APP_URL;
    delete process.env.PUBLIC_TRACKING_BASE_URL;

    expect(() => confereAmbiente("worker", logger)).not.toThrow();
  });

  it("fora de produção avisa em vez de impedir", () => {
    process.env.NODE_ENV = "development";
    delete process.env.WEB_APP_URL;
    delete process.env.PUBLIC_TRACKING_BASE_URL;

    expect(() => confereAmbiente("api", logger)).not.toThrow();
    expect((logger as unknown as { warn: jest.Mock }).warn).toHaveBeenCalled();
  });

  it("continua impedindo o essencial mesmo fora de produção", () => {
    process.env.NODE_ENV = "development";
    delete process.env.JWT_SECRET;

    expect(() => confereAmbiente("api", logger)).toThrow(/JWT_SECRET/);
  });
});

describe("origensPermitidas", () => {
  const original = { ...process.env };
  beforeEach(() => { process.env = { ...original }; });
  afterAll(() => { process.env = original; });

  it("devolve a lista configurada, sem espaços sobrando", () => {
    process.env.WEB_APP_URL = "https://a.com, https://b.com";

    expect(origensPermitidas()).toEqual(["https://a.com", "https://b.com"]);
  });

  it("nunca libera geral em produção", () => {
    process.env.NODE_ENV = "production";
    delete process.env.WEB_APP_URL;

    // Liberar qualquer origem junto de credenciais é o oposto do que se quer,
    // e antes bastava esquecer uma variável para chegar lá.
    expect(origensPermitidas()).toBe(false);
  });

  it("libera fora de produção, onde a porta muda o tempo todo", () => {
    process.env.NODE_ENV = "development";
    delete process.env.WEB_APP_URL;

    expect(origensPermitidas()).toBe(true);
  });
});

describe("enderecoPublico", () => {
  const original = { ...process.env };
  beforeEach(() => { process.env = { ...original }; });
  afterAll(() => { process.env = original; });

  it("usa o configurado", () => {
    process.env.PUBLIC_TRACKING_BASE_URL = "https://exemplo.com";
    expect(enderecoPublico()).toBe("https://exemplo.com");
  });

  it("cai no localhost só quando não há nada", () => {
    delete process.env.PUBLIC_TRACKING_BASE_URL;
    expect(enderecoPublico()).toBe("http://localhost:3001");
  });
});
